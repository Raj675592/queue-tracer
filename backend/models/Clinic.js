const mongoose = require('mongoose');

// One document per clinic. `slug` is what shows up in the shareable URLs
// (/c/:slug/reception, /c/:slug/queue); `_id` is the stable internal
// reference every Patient/ClinicConfig document is actually scoped by, so
// renaming a clinic's slug later never has to touch historical data.
const clinicSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9-]{3,40}$/,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // null/empty = no PIN required (used for the zero-config default clinic
    // so the original single-clinic demo links keep working with no setup).
    pinHash: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Clinic', clinicSchema);
