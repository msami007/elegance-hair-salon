const mongoose = require('mongoose');

const stepExecutionSchema = new mongoose.Schema({
  stepOrder: { type: Number, required: true },
  scheduledAt: { type: Date, required: true },
  executedAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending' },
  messageSid: { type: String, default: '' },
  error: { type: String, default: '' },
}, { _id: true });

const cadenceEnrollmentSchema = new mongoose.Schema({
  cadenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cadence', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  source: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  status: { type: String, enum: ['active', 'completed', 'cancelled', 'paused'], default: 'active' },
  stepExecutions: [stepExecutionSchema],
}, { timestamps: true });

cadenceEnrollmentSchema.index({ status: 1, 'stepExecutions.status': 1, 'stepExecutions.scheduledAt': 1 });

module.exports = mongoose.model('CadenceEnrollment', cadenceEnrollmentSchema);
