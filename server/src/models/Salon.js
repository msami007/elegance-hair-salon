const mongoose = require('mongoose');

const salonSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  branding: {
    primaryColor: { type: String, default: '#000000' },
    accentColor: { type: String, default: '#C8A96E' },
    logo: { type: String, default: '' },
  },
  contactEmail: { type: String, default: '' },
  website: { type: String, default: '' },
  instagramHandle: { type: String, default: '' },
  settings: {
    twilioTollFreeNumber: { type: String, default: '' },
    reminderHours: { type: Number, default: 24 },
    voiceCallEscalation: { type: Boolean, default: false },
    aiAutoReschedule: { type: Boolean, default: false },
    aiActionPermissions: { type: Boolean, default: false },
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Salon', salonSchema);
