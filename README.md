# Queue Cure '26 — Live Clinic Queue

A live digital token queue for a neighbourhood clinic: a receptionist screen
to add patients and call the next token, and a patient-facing waiting room
screen that updates instantly — no refresh — with a wait estimate computed
from that clinic's *actual* consultation times, not a guess.

**Multi-clinic:** any number of clinics can use this from one deployment.
Each clinic creates its own queue and gets its own private link — nothing
is shared, including live updates (verified — see "Multi-clinic isolation"
below).

Built for Wooble's Queue Cure '26 hackathon.

## The one sentence

*A receptionist taps "Call Next" once, and on a phone across the room the
token number flips, the wait estimate updates, and nobody had to ask "am I
next?" out loud.*

## Stack

- **Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose)
- **Frontend:** React (Vite), Socket.IO client, plain CSS (no framework)
- **Real-time sync:** Socket.IO rooms, one per clinic — both of a clinic's
  screens render off one shared snapshot pushed to that clinic's room only,
  so they can never quietly disagree with each other, or with another
  clinic's queue.

## Project structure

```
queue-cure/
├── backend/
│   ├── server.js              # Express + Socket.IO entry point
│   ├── db.js                  # Mongo connection (auto in-memory fallback)
│   ├── models/
│   │   ├── Clinic.js          # one doc per clinic - slug, name, hashed PIN
│   │   ├── Patient.js         # one document per token, scoped by clinicId
│   │   └── ClinicConfig.js    # daily per-clinic singleton: avg time + rolling real durations
│   ├── socket/queueHandlers.js# all live queue + clinic logic lives here
│   └── utils/waitTime.js      # manual-estimate vs real-data wait calculation
├── frontend/
│   └── src/
│       ├── pages/Landing.jsx       # create-a-clinic flow ("/")
│       ├── pages/Reception.jsx     # receptionist control screen
│       ├── pages/PatientQueue.jsx  # patient waiting-room screen
│       ├── components/CounterDisplay.jsx   # LED token display (signature UI element)
│       ├── components/TokenRevealModal.jsx # "show this token to the patient" card
│       ├── components/PinPrompt.jsx        # PIN entry UI (server-checked)
│       ├── hooks/useClinic.js      # resolves a URL slug into a clinic record
│       ├── hooks/useReceptionAuth.js # per-clinic PIN auth, server-side
│       ├── hooks/useQueue.js       # joins a clinic's room, live snapshot
│       └── socket.js
├── SOCKET_EVENTS.md            # socket event diagram + payload reference
└── THOUGHT_PROCESS.md          # design reasoning, concurrency & edge cases
```

## Running it locally

**Backend**
```bash
cd backend
npm install
npm start
```
No `MONGODB_URI` needed to try it out — if it's unset, the server
automatically spins up an in-memory MongoDB for the session (data resets on
restart). For a real deployment, copy `.env.example` to `.env` and set
`MONGODB_URI` to a MongoDB Atlas connection string.

**Frontend** (in a second terminal)
```bash
cd frontend
npm install
npm run dev
```

## Using it — one clinic or many

1. Open `http://localhost:5173/` and fill in a clinic name, a URL slug
   (auto-suggested from the name), and an optional staff PIN.
2. You'll get two links:
   - `**/c/<slug>/reception**` — give this to staff only
   - `**/c/<slug>/queue**` — put this on the waiting-room screen / share with patients
3. Repeat for as many clinics as you want — each is fully independent.

The original single-clinic links still work with zero setup:
`/reception` and `/queue` redirect to a built-in `default` clinic (no PIN
unless you set `DEFAULT_RECEPTION_PIN` in `backend/.env`).

### Reception PIN — now server-side

Each clinic's PIN is set once at creation time and stored **hashed** in the
database (`bcryptjs`), and checked server-side via a `clinic:auth` socket
event — not a frontend constant like the old single-clinic version. A
receptionist who enters the right PIN stays authorized for that browser tab
(re-sent automatically if the connection drops and reconnects); a fresh
device or tab needs the PIN again. This is meaningfully more secure than
"PIN baked into the JS bundle," though it's still a shared staff PIN, not
individual logins — fine for a clinic front desk, not for anything needing
per-staff audit trails.

### Multi-clinic isolation

The two things that would actually break in a shared multi-tenant
deployment — and that this build specifically guards against:

- **Data isolation:** every `Patient` and `ClinicConfig` document is scoped
  by `clinicId`, including the unique index on token numbers — so two
  clinics can both have a "token #1" today with zero collision risk.
- **Broadcast isolation:** live updates are sent with `io.to(room).emit(...)`
  to a Socket.IO room per clinic (`clinic:<id>`), not `io.emit(...)` to
  everyone — so Clinic B's patient screen never receives Clinic A's queue
  updates. This was verified directly: a test harness ran two clinics
  through the real handler code and confirmed clinic A's broadcasts never
  reached clinic B's sockets.

## Deploying for the submission link

- **Backend:** Render or Railway — set `MONGODB_URI` (Atlas free tier works)
  and `CLIENT_ORIGIN` to your deployed frontend URL.
- **Frontend:** Vercel or Netlify — set `VITE_SERVER_URL` to your deployed
  backend URL, then `npm run build`.

## Design

The whole visual identity is built around one real, recognizable object: the
dark, brass-trimmed LED counter display at a bank or clinic window that
shows "NOW SERVING 042" in glowing red. That's rendered literally as the
`CounterDisplay` component and used as the hero on both screens. Around it:
warm paper background, brass circular token badges, and waiting-line rows
styled like torn ticket stubs (each with a perforation notch) — a visual
callback to the paper tokens this is replacing.

## Patient flow, end to end

1. Receptionist adds a patient → a "show this to the patient" card pops up
   on the Reception screen with the assigned token in giant LED digits —
   the receptionist turns the screen around for a few seconds, then
   dismisses it (or it auto-dismisses after 6s).
2. The patient's token now also appears as a row in the public `/c/<slug>/queue`
   list, with an explicit "N ahead" count and an estimated wait — no need
   to count rows themselves.
3. When their row says "Up next," they're next after whoever is currently
   being served.

## How the wait-time estimate actually works

This was the core thing the brief asked for, so it's worth spelling out:

1. The receptionist sets a starting estimate (default 8 min) — used only
   until real data exists for the day.
2. Every time "Call Next" closes out a patient, the actual consultation
   duration is logged.
3. Once at least 2 real durations exist, every wait estimate switches to a
   rolling average of the last 8 real consultations — automatically, with
   no extra step from the receptionist.
4. Both screens show *which* mode is active (`manual-estimate` vs
   `real-data`) so it's never a black box during a demo.

See `SOCKET_EVENTS.md` for the exact event contract and `THOUGHT_PROCESS.md`
for concurrency handling and edge cases.
