const mongoose = require('mongoose');

async function connectDB() {
  let uri = process.env.MONGODB_URI;

  if (!uri) {
    // No real DB configured (common during a hackathon night) - spin up an
    // in-memory MongoDB instance so `npm install && npm start` just works.
    // Data will not persist across server restarts in this mode.
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mem = await MongoMemoryServer.create();
    uri = mem.getUri();
    console.log('No MONGODB_URI set - using an in-memory MongoDB for this session.');
    console.log('   Set MONGODB_URI in .env to persist data across restarts.');
  }

  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

module.exports = connectDB;
