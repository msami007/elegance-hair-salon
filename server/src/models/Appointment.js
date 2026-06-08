const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  barberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Barber', required: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  startTime: { type: String, required: true }, // HH:mm
  endTime: { type: String, required: true }, // HH:mm (calculated from service duration)
  status: {
    type: String,
    enum: ['confirmed', 'need-confirm', 'completed', 'cancelled', 'no-show'],
    default: 'confirmed',
  },
  source: {
    type: String,
    enum: ['online', 'walk-in', 'phone', 'admin', 'instagram'],
    default: 'online',
  },
  haircutStyle: { type: String, default: '' }, // selected style tag
  referencePhoto: { type: String, default: '' }, // uploaded photo URL
  notes: { type: String, default: '' }, // internal notes
  clientMessage: { type: String, default: '' }, // message for client
  barberSelectedByClient: { type: Boolean, default: false }, // vs AI-recommended
  addOns: [{ type: String }],
  totalPrice: { type: Number, default: 0 }, // cents
  smsConfirmationSent: { type: Boolean, default: false },
  smsConfirmationSid: { type: String, default: '' }, // Twilio message SID
}, { timestamps: true });

// Index for checking availability conflicts
appointmentSchema.index({ barberId: 1, date: 1, status: 1 });
appointmentSchema.index({ locationId: 1, date: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
