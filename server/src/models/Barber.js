const mongoose = require('mongoose');

const barberSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  name: { type: String, required: true },
  title: { type: String, default: '' }, // e.g. "Master barber", "Master hairdresser"
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  photo: { type: String, default: '' },
  bio: { type: String, default: '' },
  specialisms: [{ type: String }], // e.g. ["skin-fade", "curly", "beard", "color"]
  workingHours: {
    mon: { start: { type: String, default: '08:00' }, end: { type: String, default: '20:00' } },
    tue: { start: { type: String, default: '08:00' }, end: { type: String, default: '20:00' } },
    wed: { start: { type: String, default: '08:00' }, end: { type: String, default: '20:00' } },
    thu: { start: { type: String, default: '08:00' }, end: { type: String, default: '20:00' } },
    fri: { start: { type: String, default: '08:00' }, end: { type: String, default: '20:00' } },
    sat: { start: { type: String, default: '08:00' }, end: { type: String, default: '20:00' } },
    sun: { start: { type: String, default: '08:00' }, end: { type: String, default: '20:00' } },
  },
  role: { type: String, enum: ['owner', 'staffer', 'basic_staffer'], default: 'staffer' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Barber', barberSchema);
