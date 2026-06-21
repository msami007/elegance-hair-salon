const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  type: {
    type: String,
    enum: ['confirmation', 'feedback', 're-engagement'],
    required: true,
  },
  direction: {
    type: String,
    enum: ['outbound', 'inbound'],
    default: 'outbound',
  },
  status: {
    type: String,
    enum: ['pending', 'queued', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer', 'busy'],
    default: 'pending',
  },
  twilioCallSid: { type: String, unique: true, sparse: true },
  duration: { type: Number, default: 0 }, // in seconds
  outcome: { type: String, default: 'Pending' }, // e.g., 'Confirmed', 'Rescheduled', 'Left Voicemail', 'Opt-out', 'No Response'
  summary: { type: String, default: '' },
  transcript: [
    {
      speaker: { type: String, enum: ['agent', 'customer'], required: true },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
    }
  ],
}, { timestamps: true });

// Index for quick queries
callLogSchema.index({ salonId: 1, createdAt: -1 });

module.exports = mongoose.model('CallLog', callLogSchema);
