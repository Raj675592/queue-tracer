const mongoose = require('mongoose');

// One document per (clinic, day) - holds that clinic's receptionist-set
// fallback average and the rolling window of *real* consultation durations
// used once actual data exists for the day. Despite the similar name this
// is NOT the same model as Clinic.js (which is the clinic's identity/PIN) -
// this is purely that clinic's daily operating numbers.
const clinicConfigSchema = new mongoose.Schema(
  {
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    queueDate: { type: String, required: true }, // 'YYYY-MM-DD'
    avgConsultMinutes: { type: Number, default: 8, min: 1, max: 120 },
    lastDurationsMinutes: { type: [Number], default: [] }, // rolling window, newest last
    lastTokenNumber: { type: Number, default: 0 },
  },
  { timestamps: true }
);

clinicConfigSchema.index({ clinicId: 1, queueDate: 1 }, { unique: true });

const ROLLING_WINDOW_SIZE = 8;

clinicConfigSchema.methods.recordDuration = function (minutes) {
  this.lastDurationsMinutes.push(minutes);
  if (this.lastDurationsMinutes.length > ROLLING_WINDOW_SIZE) {
    this.lastDurationsMinutes.shift();
  }
};

clinicConfigSchema.statics.ROLLING_WINDOW_SIZE = ROLLING_WINDOW_SIZE;

module.exports = mongoose.model('ClinicConfig', clinicConfigSchema);
