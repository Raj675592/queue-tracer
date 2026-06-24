const bcrypt = require('bcryptjs');
const Patient = require('../models/Patient');
const ClinicConfig = require('../models/ClinicConfig');
const Clinic = require('../models/Clinic');
const { getEffectiveAverage, estimateWaitMinutes } = require('../utils/waitTime');

const PIN_HASH_ROUNDS = 10;
const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;

function roomName(clinicId) {
  return `clinic:${clinicId}`;
}

// Local calendar date as 'YYYY-MM-DD'. Scoping every query to this string is
// what makes token numbers and the wait-time average reset automatically
// every day, with no cron job required.
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getOrCreateConfig(clinicId, queueDate) {
  return ClinicConfig.findOneAndUpdate(
    { clinicId, queueDate },
    { $setOnInsert: { clinicId, queueDate } },
    { upsert: true, new: true }
  );
}

// Ensures a no-setup "default" clinic always exists, so the original
// single-clinic links (/reception, /queue - which redirect to
// /c/default/...) keep working with zero configuration, exactly like
// before multi-clinic support existed.
async function ensureDefaultClinic() {
  const existing = await Clinic.findOne({ slug: 'default' });
  if (existing) return existing;

  const pin = process.env.DEFAULT_RECEPTION_PIN || '';
  const pinHash = pin ? await bcrypt.hash(pin, PIN_HASH_ROUNDS) : null;

  return Clinic.create({ slug: 'default', name: 'Demo Clinic', pinHash });
}

// Builds the single snapshot object both screens render from, for one
// clinic. Sending one consistent shape to both clients - instead of letting
// each screen derive its own view of "the truth" - is what keeps the two
// screens from ever quietly disagreeing about the queue state.
async function buildSnapshot(clinicId, queueDate) {
  const [patients, config] = await Promise.all([
    Patient.find({ clinicId, queueDate }).sort({ tokenNumber: 1 }).lean(),
    getOrCreateConfig(clinicId, queueDate),
  ]);

  const nowServing = patients.find((p) => p.status === 'in-consultation') || null;
  const waiting = patients.filter((p) => p.status === 'waiting');
  const { minutesPerPatient, source, sampleSize } = getEffectiveAverage(config);

  // tokensAhead counts everyone still between this patient and the doctor -
  // i.e. the current in-consultation patient (if any) plus every waiting
  // patient with a lower token number.
  const activeAheadCount = nowServing ? 1 : 0;
  const waitingWithEta = waiting.map((p, idx) => ({
    ...p,
    tokensAhead: activeAheadCount + idx,
    estimatedWaitMinutes: estimateWaitMinutes(activeAheadCount + idx, config),
  }));

  return {
    clinicId: String(clinicId),
    queueDate,
    nowServing,
    waiting: waitingWithEta,
    done: patients.filter((p) => p.status === 'done'),
    skipped: patients.filter((p) => p.status === 'skipped'),
    config: {
      avgConsultMinutes: config.avgConsultMinutes,
      effectiveMinutesPerPatient: minutesPerPatient,
      waitTimeSource: source, // 'real-data' | 'manual-estimate'
      realSampleSize: sampleSize,
    },
  };
}

function registerQueueHandlers(io) {
  io.on('connection', (socket) => {
    // Tracks which clinics THIS socket has successfully entered a PIN for.
    // Authorization is per-connection, not persisted - a page refresh opens
    // a new socket and has to re-authenticate, which is the deliberate
    // trade-off of doing this check server-side instead of trusting the
    // client to remember it.
    socket.data.authorizedClinics = new Set();

    function isAuthorized(clinicId) {
      return socket.data.authorizedClinics.has(String(clinicId));
    }

    // --- Create a new clinic -------------------------------------------
    socket.on('clinic:create', async ({ name, slug, pin } = {}, ack) => {
      const safeAck = typeof ack === 'function' ? ack : () => {};
      try {
        const cleanName = (name || '').trim();
        const cleanSlug = (slug || '').trim().toLowerCase();
        const cleanPin = (pin || '').trim();

        if (!cleanName) return safeAck({ ok: false, error: 'Clinic name is required.' });
        if (!SLUG_PATTERN.test(cleanSlug)) {
          return safeAck({
            ok: false,
            error: 'URL slug must be 3-40 characters: lowercase letters, numbers, and hyphens only.',
          });
        }
        if (cleanPin && !/^\d{4,6}$/.test(cleanPin)) {
          return safeAck({ ok: false, error: 'PIN must be 4-6 digits, or leave it blank for no PIN.' });
        }

        const pinHash = cleanPin ? await bcrypt.hash(cleanPin, PIN_HASH_ROUNDS) : null;
        const clinic = await Clinic.create({ name: cleanName, slug: cleanSlug, pinHash });
        safeAck({ ok: true, clinicId: String(clinic._id), slug: clinic.slug, name: clinic.name });
      } catch (err) {
        if (err?.code === 11000) {
          return safeAck({ ok: false, error: 'That URL is already taken - try a different slug.' });
        }
        safeAck({ ok: false, error: 'Could not create clinic.' });
      }
    });

    // --- Resolve a slug from the URL into a clinic record ---------------
    socket.on('clinic:resolve', async ({ slug } = {}, ack) => {
      const safeAck = typeof ack === 'function' ? ack : () => {};
      try {
        const clinic = await Clinic.findOne({ slug: (slug || '').trim().toLowerCase() });
        if (!clinic) return safeAck({ ok: false, error: 'No clinic found for that link.' });
        safeAck({
          ok: true,
          clinicId: String(clinic._id),
          name: clinic.name,
          slug: clinic.slug,
          requiresPin: Boolean(clinic.pinHash),
        });
      } catch (err) {
        safeAck({ ok: false, error: 'Could not look up that clinic.' });
      }
    });

    // --- Join a clinic's live room and get the current snapshot ---------
    socket.on('clinic:join', async ({ clinicId } = {}, ack) => {
      const safeAck = typeof ack === 'function' ? ack : () => {};
      try {
        const clinic = await Clinic.findById(clinicId);
        if (!clinic) return safeAck({ ok: false, error: 'Clinic not found.' });

        socket.join(roomName(clinicId));
        const snapshot = await buildSnapshot(clinicId, todayKey());
        safeAck({ ok: true, snapshot, clinicName: clinic.name });
      } catch (err) {
        safeAck({ ok: false, error: 'Could not load this clinic\u2019s queue.' });
      }
    });

    // --- Reception PIN check --------------------------------------------
    socket.on('clinic:auth', async ({ clinicId, pin } = {}, ack) => {
      const safeAck = typeof ack === 'function' ? ack : () => {};
      try {
        const clinic = await Clinic.findById(clinicId);
        if (!clinic) return safeAck({ ok: false, error: 'Clinic not found.' });

        if (!clinic.pinHash) {
          socket.data.authorizedClinics.add(String(clinicId));
          return safeAck({ ok: true });
        }

        const matches = await bcrypt.compare((pin || '').trim(), clinic.pinHash);
        if (!matches) return safeAck({ ok: false, error: 'Incorrect PIN.' });

        socket.data.authorizedClinics.add(String(clinicId));
        safeAck({ ok: true });
      } catch (err) {
        safeAck({ ok: false, error: 'Could not verify PIN.' });
      }
    });

    // --- Receptionist adds a patient -------------------------------------
    socket.on('patient:add', async ({ clinicId, name } = {}, ack) => {
      const safeAck = typeof ack === 'function' ? ack : () => {};
      try {
        if (!clinicId) return safeAck({ ok: false, error: 'Missing clinic.' });
        if (!isAuthorized(clinicId)) return safeAck({ ok: false, error: 'Enter the reception PIN first.' });

        const trimmed = (name || '').trim();
        if (!trimmed) return safeAck({ ok: false, error: 'Name is required.' });

        const queueDate = todayKey();
        // Atomic counter increment - immune to two receptionist tabs adding
        // a patient at the same instant and colliding on a token number.
        const config = await ClinicConfig.findOneAndUpdate(
          { clinicId, queueDate },
          { $setOnInsert: { clinicId, queueDate }, $inc: { lastTokenNumber: 1 } },
          { upsert: true, new: true }
        );

        const patient = await Patient.create({
          clinicId,
          tokenNumber: config.lastTokenNumber,
          name: trimmed,
          status: 'waiting',
          queueDate,
        });

        const snapshot = await buildSnapshot(clinicId, queueDate);
        io.to(roomName(clinicId)).emit('queue:update', snapshot);
        safeAck({ ok: true, tokenNumber: patient.tokenNumber });
      } catch (err) {
        safeAck({ ok: false, error: 'Could not add patient.' });
      }
    });

    // --- Receptionist calls the next token --------------------------------
    socket.on('token:callNext', async ({ clinicId } = {}, ack) => {
      const safeAck = typeof ack === 'function' ? ack : () => {};
      try {
        if (!clinicId) return safeAck({ ok: false, error: 'Missing clinic.' });
        if (!isAuthorized(clinicId)) return safeAck({ ok: false, error: 'Enter the reception PIN first.' });

        const queueDate = todayKey();
        const now = new Date();

        // 1. Close out whoever is currently being seen and log the real
        //    duration into the rolling average.
        const current = await Patient.findOne({ clinicId, queueDate, status: 'in-consultation' });
        if (current) {
          current.status = 'done';
          current.consultEndTime = now;
          await current.save();

          const durationMinutes = (current.consultEndTime - current.consultStartTime) / 60000;
          if (durationMinutes > 0 && durationMinutes < 180) {
            const config = await getOrCreateConfig(clinicId, queueDate);
            config.recordDuration(Math.round(durationMinutes * 10) / 10);
            await config.save();
          }
        }

        // 2. Atomically claim the next waiting token. findOneAndUpdate is a
        //    single atomic findAndModify at the DB level, so if two clicks
        //    (or two receptionist tabs) fire "call next" within milliseconds
        //    of each other, only one can win this document - the second
        //    call simply finds no matching "waiting" doc left to claim.
        const next = await Patient.findOneAndUpdate(
          { clinicId, queueDate, status: 'waiting' },
          { $set: { status: 'in-consultation', consultStartTime: now } },
          { sort: { tokenNumber: 1 }, new: true }
        );

        const snapshot = await buildSnapshot(clinicId, queueDate);
        io.to(roomName(clinicId)).emit('queue:update', snapshot);
        safeAck({ ok: true, nowServing: next ? next.tokenNumber : null });
      } catch (err) {
        safeAck({ ok: false, error: 'Could not call next token.' });
      }
    });

    // --- Receptionist skips a no-show -------------------------------------
    socket.on('token:skip', async ({ clinicId, patientId } = {}, ack) => {
      const safeAck = typeof ack === 'function' ? ack : () => {};
      try {
        if (!clinicId) return safeAck({ ok: false, error: 'Missing clinic.' });
        if (!isAuthorized(clinicId)) return safeAck({ ok: false, error: 'Enter the reception PIN first.' });

        const queueDate = todayKey();
        // Conditional update guards against skipping a token that has
        // already been called or completed by a concurrent action.
        const updated = await Patient.findOneAndUpdate(
          { _id: patientId, clinicId, queueDate, status: 'waiting' },
          { $set: { status: 'skipped' } },
          { new: true }
        );
        if (!updated) return safeAck({ ok: false, error: 'Token is no longer waiting.' });

        const snapshot = await buildSnapshot(clinicId, queueDate);
        io.to(roomName(clinicId)).emit('queue:update', snapshot);
        safeAck({ ok: true });
      } catch (err) {
        safeAck({ ok: false, error: 'Could not skip token.' });
      }
    });

    // --- Receptionist sets the manual fallback average ----------------------
    socket.on('config:setAvgTime', async ({ clinicId, minutes } = {}, ack) => {
      const safeAck = typeof ack === 'function' ? ack : () => {};
      try {
        if (!clinicId) return safeAck({ ok: false, error: 'Missing clinic.' });
        if (!isAuthorized(clinicId)) return safeAck({ ok: false, error: 'Enter the reception PIN first.' });

        const value = Number(minutes);
        if (!Number.isFinite(value) || value < 1 || value > 120) {
          return safeAck({ ok: false, error: 'Enter a value between 1 and 120 minutes.' });
        }
        const queueDate = todayKey();
        await ClinicConfig.findOneAndUpdate(
          { clinicId, queueDate },
          { $setOnInsert: { clinicId, queueDate }, $set: { avgConsultMinutes: value } },
          { upsert: true }
        );
        const snapshot = await buildSnapshot(clinicId, queueDate);
        io.to(roomName(clinicId)).emit('queue:update', snapshot);
        safeAck({ ok: true });
      } catch (err) {
        safeAck({ ok: false, error: 'Could not update average time.' });
      }
    });
  });
}

module.exports = { registerQueueHandlers, buildSnapshot, todayKey, ensureDefaultClinic };
