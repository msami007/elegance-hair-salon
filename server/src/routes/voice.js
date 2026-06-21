const express = require('express');
const router = express.Router();
const voiceService = require('../services/voiceService');
const CallLog = require('../models/CallLog');

// POST /api/voice/call - Initiate manual call
router.post('/call', async (req, res) => {
  try {
    const { clientId, appointmentId, type, salonId } = req.body;
    if (!clientId || !type || !salonId) {
      return res.status(400).json({ error: 'Client ID, Type, and Salon ID are required' });
    }

    const result = await voiceService.triggerOutboundCall({
      clientId,
      appointmentId,
      type,
      salonId,
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/voice/logs - Retrieve call logs
router.get('/logs', async (req, res) => {
  try {
    const { salonId } = req.query;
    if (!salonId) {
      return res.status(400).json({ error: 'Salon ID is required' });
    }

    const logs = await CallLog.find({ salonId })
      .populate('clientId', 'firstName lastName phone email')
      .populate({
        path: 'appointmentId',
        populate: [
          { path: 'serviceId', select: 'name price' },
          { path: 'barberId', select: 'name' }
        ]
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/voice/twiml - Twilio call initial TwiML webhook
router.post('/twiml', async (req, res) => {
  try {
    const { callLogId } = req.query;
    const xmlTwiML = await voiceService.generateInitialTwiML(callLogId);
    res.type('text/xml').send(xmlTwiML);
  } catch (error) {
    console.error('TwiML Webhook error:', error.message);
    const twilio = require('twilio');
    const response = new twilio.twiml.VoiceResponse();
    response.say('A system error occurred. We apologize. Goodbye.');
    res.type('text/xml').send(response.toString());
  }
});

// POST /api/voice/respond - Twilio STT webhook callback
router.post('/respond', async (req, res) => {
  try {
    const { callLogId } = req.query;
    const speechResult = req.body.SpeechResult || '';
    
    if (!speechResult.trim()) {
      // Loop or prompt again if empty speech received
      const twilio = require('twilio');
      const response = new twilio.twiml.VoiceResponse();
      response.say({ voice: 'Polly.Joanna' }, "Sorry, I didn't catch that. Could you please say that again?");
      response.gather({
        input: 'speech',
        action: `/api/voice/respond?callLogId=${callLogId}`,
        timeout: 5,
        speechTimeout: 'auto',
      });
      return res.type('text/xml').send(response.toString());
    }

    const xmlTwiML = await voiceService.processVoiceSpeech(callLogId, speechResult);
    res.type('text/xml').send(xmlTwiML);
  } catch (error) {
    console.error('Voice response webhook error:', error.message);
    const twilio = require('twilio');
    const response = new twilio.twiml.VoiceResponse();
    response.say('Sorry, we encountered an error. Goodbye.');
    res.type('text/xml').send(response.toString());
  }
});

// POST /api/voice/status - Twilio status callback
router.post('/status', async (req, res) => {
  try {
    const { callLogId } = req.query;
    const { CallStatus, CallDuration } = req.body;
    
    const callLog = await CallLog.findById(callLogId);
    if (callLog) {
      if (CallStatus === 'completed') {
        callLog.status = 'completed';
        callLog.duration = Number(CallDuration) || 0;
      } else if (['failed', 'busy', 'no-answer'].includes(CallStatus)) {
        callLog.status = 'failed';
        callLog.outcome = CallStatus === 'busy' ? 'Busy' : CallStatus === 'no-answer' ? 'No Answer' : 'Failed';
      }
      await callLog.save();
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Call status webhook error:', error.message);
    res.sendStatus(500);
  }
});

module.exports = router;
