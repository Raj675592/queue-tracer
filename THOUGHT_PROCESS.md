# Thought Process — Queue Cure

## The actual problem, restated

A paper-token system fails in three specific ways: the receptionist has no
record once a slip is handed out, the patient has no visibility once they
sit down, and "how long will this take" is always a guess shouted across
the room. The brief's three questions map directly onto those three
failures, so that's what the build optimizes for, in this order:

1. **Speed for the receptionist** — one name field, one button, token
   assigned. Nothing else gets in the way of that loop, because it repeats
   all day.
2. **Live truth for the patient** — both screens read from the same
   server-pushed snapshot. The patient screen never polls or guesses; it
   just renders whatever the server says is current.
3. **A wait estimate that's earned, not assumed** — the manual fallback
   number only covers the first couple of patients of the day. After that,
   it's the rolling average of what's actually happening in that clinic,
   that day.

## Why a single shared snapshot instead of separate diffs per screen

Early designs for things like this often try to send minimal "patches" to
each screen (e.g. "token 12 status changed to done"). That's more
bandwidth-efficient, but it means each screen has to reconstruct queue
state from a stream of patches — and if a screen misses one message
(reconnect, tab backgrounded on a phone, flaky clinic wifi), it silently
drifts out of sync forever. Sending one full, authoritative snapshot on
every change is slightly more data, but it makes "out of sync" structurally
impossible: a screen that reconnects gets the truth, not a delta.

## Concurrency — where this actually breaks if you're not careful

The realistic failure mode in a real clinic isn't exotic distributed-systems
stuff, it's mundane: a receptionist double-clicking "Call Next" because the
UI didn't visibly respond fast enough, or two browser tabs open on the same
desk (one left open from yesterday).

- **Double-click on "Call Next":** handled with `Patient.findOneAndUpdate`
  using a `{ status: 'waiting' }` filter and a sort, rather than a
  read-then-write. MongoDB executes `findAndModify` as a single atomic
  operation at the database level, so if two calls land milliseconds apart,
  the first claims the token and the second simply finds nothing left to
  claim — it can't pull the same patient into consultation twice.
- **Token numbering under concurrent adds:** the same pattern applies to
  the daily token counter (`$inc` inside `findOneAndUpdate`), so two
  receptionist tabs adding a patient at the same instant still get
  different, sequential token numbers instead of colliding.
- **Skipping a token that's already been called:** the skip handler's
  filter requires `status: 'waiting'`, so a token that a *different* action
  already moved to `in-consultation` or `done` a moment earlier can't be
  retroactively skipped out from under the doctor.
- **State lives in MongoDB, not in server memory:** if the Node process
  restarts mid-shift (deploy, crash, free-tier idle spin-down), the queue
  isn't lost — it reloads from the database on the next request. A
  memory-only queue would silently wipe the whole day's line.

What this build does **not** attempt: true multi-doctor concurrency (more
than one "in-consultation" patient at once per clinic). That's a
straightforward extension — `nowServing` could become an array keyed by
doctor/room — but the brief describes one receptionist station per clinic,
so the data model stays at that scope.

## Multi-clinic — added after the brief, scoped deliberately

The brief only asks for one clinic. Multi-clinic support was added as an
extension on top of that, not because the rubric requires it, but because
the data model already kept `queueDate` as a scoping key — adding
`clinicId` alongside it as a second scoping key was additive, not a
rewrite. Two things had to be true for this to actually be safe, and both
were verified directly against the real handler code rather than assumed:

- **Data never collides.** The unique index that used to be
  `{ queueDate, tokenNumber }` is now `{ clinicId, queueDate, tokenNumber }`
  — two clinics can both have a token #1 on the same day with zero
  collision risk, because the database enforces it, not application logic.
- **Live updates never leak.** This was the actual risk worth naming: a
  naive multi-tenant version would still call `io.emit(...)` to *every*
  connected socket, which means Clinic B's waiting-room screen would
  flicker every time Clinic A added a patient. The fix is Socket.IO rooms —
  every clinic gets its own room (`clinic:<id>`), every screen joins the
  room for the clinic it resolved from its URL slug, and every broadcast
  goes to `io.to(room).emit(...)`, never the global `io.emit(...)`. A test
  harness ran two clinics through the actual production handler code and
  confirmed clinic A's broadcasts never reach clinic B's sockets, and that
  each clinic's token numbering is independent.

**Auth changed shape, too.** A single-clinic PIN can live as a frontend
constant and it's a minor sin (anyone with devtools can find it, but it's
one clinic's one secret). That doesn't scale to N clinics — there's no
single constant to bake in. So the PIN moved server-side: hashed with
bcrypt at clinic-creation time, checked via a `clinic:auth` socket event,
and the authorization lives on the socket connection, not in the browser.
That's a meaningfully different trust model, not just a refactor — worth
flagging because it's easy to read "added multi-clinic" as a pure UI change
when it actually moved a security boundary.

**What's still out of scope deliberately:** per-staff logins (it's one
shared PIN per clinic, not individual accounts with an audit trail), and
clinic-level admin tooling (renaming a clinic, rotating its PIN, deleting
it) — all straightforward additions to the same `Clinic` model, just not
built, because nothing in the brief or the multi-clinic ask required them
yet.

## Other edge cases handled

- **Empty queue:** "Call Next" disables with a plain explanation instead of
  letting the receptionist click into a no-op or an error.
- **Last patient of the day:** calling next when no one is waiting still
  correctly closes out the current patient — it just doesn't open a new
  one. The button label changes to "Finish current patient" so this isn't
  ambiguous.
- **No-shows:** a dedicated `skipped` status, separate from `done`, so a
  no-show doesn't get counted as a completed consultation in the
  duration average (which would quietly corrupt the wait-time math).
- **Daily reset with no cron job:** every query is scoped to a `queueDate`
  string derived from the server's local date. Token numbers and the
  rolling average both reset naturally at midnight just by virtue of
  querying a new date string — there's no batch job that needs to run, and
  nothing to forget to schedule.
- **Reconnect after a dropped connection:** Socket.IO's client
  auto-reconnects, but room membership doesn't survive a reconnect (a new
  socket has joined no rooms yet) — so each screen explicitly re-runs
  `clinic:join` on every `connect` event, not just on first mount, and gets
  back a fresh full snapshot, not a delta. A patient's phone that drops
  wifi for ten seconds catches back up automatically rather than staying
  frozen on stale data.
- **Outlier consultation durations:** a duration is only recorded into the
  rolling average if it falls between 0 and 180 minutes, so a forgotten
  "Call Next" click that leaves a token open for hours doesn't drag the
  whole day's estimate up.
- **Privacy on the public screen:** the patient-facing screen shows only
  first names, not full names — appropriate for a shared waiting-room
  display, even though the receptionist's own screen shows the full name
  for identification.

## What "good enough for a hackathon demo" deliberately leaves out

- **Per-staff auth:** PIN is shared per clinic, not individual staff
  logins. Fine for a single front desk; an audit trail of *which*
  receptionist called which token would need real accounts.
- **SMS/notification when a patient's turn is close:** would be the single
  biggest real-world UX win after this (patients could leave the waiting
  room entirely), but it's a separate integration (Twilio/WhatsApp) rather
  than a queue-logic problem, so it's flagged here rather than half-built.
- **Clinic admin tooling:** no way yet to rename a clinic, rotate its PIN,
  or delete it once created — additive to the `Clinic` model, just not
  built.

## The "wow" moment in the demo

Two phones side by side. Tap "Call Next" on the receptionist screen — the
token on the patient screen flips immediately, with no refresh, and the
wait estimate for the next patient changes with it. That single tap is the
whole pitch: paper tokens can't do that, and shouting across a waiting room
can't either.
