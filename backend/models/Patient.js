const mongoose = require('mongoose');

// One document per token, scoped to a clinic. `queueDate` further scopes
// everything to a single day (midnight-to-midnight, server local time) so
// token numbers and the rolling wait-time average reset cleanly every
// morning, per clinic, without a cron job.
const patientSchema = new mongoose.Schema(
  {
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    tokenNumber: { type: Number, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    status: {
      type: String,
      enum: ['waiting', 'in-consultation', 'done', 'skipped'],
      default: 'waiting',
      index: true,
    },
    queueDate: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
    checkInTime: { type: Date, default: Date.now },
    consultStartTime: { type: Date, default: null },
    consultEndTime: { type: Date, default: null },
  },
  { timestamps: true }
);

patientSchema.index({ clinicId: 1, queueDate: 1, tokenNumber: 1 }, { unique: true });

module.exports = mongoose.model('Patient', patientSchema);
