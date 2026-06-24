require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const connectDB = require('./db');
const { registerQueueHandlers, buildSnapshot, todayKey, ensureDefaultClinic } = require('./socket/queueHandlers');

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',');

async function main() {
  await connectDB();
  const defaultClinic = await ensureDefaultClinic();
  console.log(`Default clinic ready: /c/${defaultClinic.slug}/reception and /c/${defaultClinic.slug}/queue`);

  const app = express();
  app.use(cors({ origin: CLIENT_ORIGIN }));
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Plain REST fallback for debugging a clinic's snapshot in a browser tab,
  // e.g. /api/queue/default - even though the live app gets everything
  // over the socket.
  app.get('/api/queue/:slug', async (req, res) => {
    try {
      const Clinic = require('./models/Clinic');
      const clinic = await Clinic.findOne({ slug: req.params.slug.toLowerCase() });
      if (!clinic) return res.status(404).json({ error: 'No clinic with that slug.' });
      res.json(await buildSnapshot(clinic._id, todayKey()));
    } catch (err) {
      res.status(500).json({ error: 'Could not load queue.' });
    }
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
  });

  registerQueueHandlers(io);

  httpServer.listen(PORT, () => {
    console.log(`Queue Cure backend listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
