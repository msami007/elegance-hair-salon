const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  firstName: { type: String, required: true },
  lastName: { type: String, default: '' },
  phone: { type: String, required: true }, // E.164 format
  email: { type: String, default: '' },
  notes: { type: String, default: '' },
  allergies: { type: String, default: '' },
  hairType: { type: String, default: '' }, // e.g. "curly", "straight", "wavy"
  tags: [{ type: String }],
  visitCount: { type: Number, default: 0 },
  preferredBarberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber' },
  preferredLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
  referencePhotos: [{ type: String }], // URLs
  source: { type: String, enum: ['booking-form', 'booksy-import', 'walk-in', 'phone', 'admin'], default: 'booking-form' },
  isTrusted: { type: Boolean, default: false },
  marketingConsent: { type: Boolean, default: false },
  // Fields to accommodate Booksy CSV import
  booksyId: { type: String, default: '' },
  firstVisit: { type: Date },
  lastVisit: { type: Date },
  totalRevenue: { type: Number, default: 0 }, // cents
  noShowCount: { type: Number, default: 0 },
}, { timestamps: true });

// Unique phone number per salon
clientSchema.index({ salonId: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('Client', clientSchema);
