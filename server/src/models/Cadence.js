const mongoose = require('mongoose');

const cadenceStepSchema = new mongoose.Schema({
  order: { type: Number, required: true },
  channel: { type: String, enum: ['sms'], default: 'sms' },
  delayValue: { type: Number, required: true },         // e.g. 48
  delayUnit: { type: String, enum: ['hours', 'minutes'], default: 'hours' },
  delayDirection: { type: String, enum: ['before', 'after'], default: 'before' },
  messageTemplate: { type: String, required: true },
}, { _id: true });

const cadenceSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['pre-appointment', 'post-visit', 'marketing'], default: 'pre-appointment' },
  isActive: { type: Boolean, default: true },
  steps: [cadenceStepSchema],
}, { timestamps: true });

module.exports = mongoose.model('Cadence', cadenceSchema);
