const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zip: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, default: '' },
  timezone: { type: String, default: 'America/Chicago' },
  hours: {
    mon: { open: { type: String, default: '08:00' }, close: { type: String, default: '20:00' } },
    tue: { open: { type: String, default: '08:00' }, close: { type: String, default: '20:00' } },
    wed: { open: { type: String, default: '08:00' }, close: { type: String, default: '20:00' } },
    thu: { open: { type: String, default: '08:00' }, close: { type: String, default: '20:00' } },
    fri: { open: { type: String, default: '08:00' }, close: { type: String, default: '20:00' } },
    sat: { open: { type: String, default: '08:00' }, close: { type: String, default: '20:00' } },
    sun: { open: { type: String, default: '08:00' }, close: { type: String, default: '20:00' } },
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Location', locationSchema);
