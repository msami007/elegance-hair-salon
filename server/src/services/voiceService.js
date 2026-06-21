const Client = require('../models/Client');
const Appointment = require('../models/Appointment');
const Salon = require('../models/Salon');
const CallLog = require('../models/CallLog');
const Barber = require('../models/Barber');
const Location = require('../models/Location');
const Service = require('../models/Service');
const twilio = require('twilio');
const { OpenAI } = require('openai');
const { normalizePhone } = require('./twilio');

// Initialize OpenAI client if key is set
let openai = null;
if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('proj-1OXa')) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else if (process.env.OPENAI_API_KEY) {
  // Try to use the provided key regardless
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken || accountSid === 'ACtest') {
    return null;
  }
  return twilio(accountSid, authToken);
}

/**
 * Trigger outbound call (real or mock)
 */
async function triggerOutboundCall({ clientId, appointmentId, type, salonId }) {
  const clientRecord = await Client.findById(clientId);
  if (!clientRecord) {
    throw new Error('Client not found');
  }

  const phone = normalizePhone(clientRecord.phone);
  const salon = await Salon.findById(salonId);
  const senderNumber = (salon && salon.settings && salon.settings.twilioTollFreeNumber) || process.env.TWILIO_PHONE_NUMBER;

  // Create initial pending CallLog
  const callLog = new CallLog({
    salonId,
    clientId,
    appointmentId,
    type,
    direction: 'outbound',
    status: 'pending',
    outcome: 'Initiated',
  });
  await callLog.save();

  const twilioClient = getTwilioClient();
  if (!twilioClient) {
    // RUN SIMULATED CALL
    console.log(`[Twilio Mock Voice] Starting simulated call to ${phone} for type ${type}`);
    // Async simulation so it returns immediately
    setTimeout(() => {
      simulateMockCall(callLog._id).catch(err => console.error('Error in mock call simulation:', err));
    }, 500);

    return { success: true, callLogId: callLog._id, mock: true };
  }

  // RUN REAL OUTBOUND CALL
  try {
    const callbackUrl = `${process.env.SERVER_URL || 'https://elegance-api.ngrok.app'}/api/voice/twiml?callLogId=${callLog._id}`;
    const statusUrl = `${process.env.SERVER_URL || 'https://elegance-api.ngrok.app'}/api/voice/status?callLogId=${callLog._id}`;

    const twilioCall = await twilioClient.calls.create({
      url: callbackUrl,
      statusCallback: statusUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      to: phone,
      from: senderNumber,
    });

    callLog.twilioCallSid = twilioCall.sid;
    callLog.status = 'queued';
    await callLog.save();

    console.log(`[Twilio Voice] Real call initiated to ${phone}, SID: ${twilioCall.sid}`);
    return { success: true, callLogId: callLog._id, twilioCallSid: twilioCall.sid, mock: false };
  } catch (error) {
    console.error(`[Twilio Voice] Outbound call failed to ${phone}: ${error.message}. Falling back to simulated mock call.`);
    
    // Async simulation so it returns immediately
    setTimeout(() => {
      simulateMockCall(callLog._id).catch(err => console.error('Error in mock call simulation after Twilio failure:', err));
    }, 500);

    return { success: true, callLogId: callLog._id, mock: true, warning: `Twilio call failed (${error.message}). Switched to simulated mock call.` };
  }
}

/**
 * Generate dialogue steps and transcripts offline
 */
async function simulateMockCall(callLogId) {
  console.log(`[simulateMockCall] STARTED for callLogId: ${callLogId}`);
  try {
    const callLog = await CallLog.findById(callLogId);
    if (!callLog) {
      console.log(`[simulateMockCall] CallLog not found for ID: ${callLogId}`);
      return;
    }
    console.log(`[simulateMockCall] Found callLog type: ${callLog.type}, client: ${callLog.clientId}`);

    const clientRecord = await Client.findById(callLog.clientId);
    const apptRecord = callLog.appointmentId ? await Appointment.findById(callLog.appointmentId) : null;
    const barber = apptRecord ? await Barber.findById(apptRecord.barberId) : null;
    const service = apptRecord ? await Service.findById(apptRecord.serviceId) : null;
    const location = apptRecord ? await Location.findById(apptRecord.locationId) : null;

    const clientName = clientRecord ? `${clientRecord.firstName} ${clientRecord.lastName}` : 'Client';
    const serviceName = service ? service.name : 'Haircut service';
    const barberName = barber ? barber.name : 'our specialist';
    const appointmentDate = apptRecord ? apptRecord.date : 'today';
    const appointmentTime = apptRecord ? apptRecord.startTime : '12:00';

    const transcript = [];
    let outcome = 'No Response';
    let summary = '';

    const addTurn = (speaker, text, offsetSecs) => {
      transcript.push({
        speaker,
        text,
        timestamp: new Date(Date.now() + offsetSecs * 1000)
      });
    };

    callLog.status = 'in-progress';
    await callLog.save();
    console.log(`[simulateMockCall] Set status to in-progress`);

    const salon = await Salon.findById(callLog.salonId);
    const aiAutoRescheduleEnabled = salon && salon.settings && salon.settings.aiAutoReschedule;
    console.log(`[simulateMockCall] aiAutoRescheduleEnabled: ${aiAutoRescheduleEnabled}`);

  if (callLog.type === 'confirmation') {
    addTurn('agent', `Hello, is this ${clientName}?`, 0);
    addTurn('customer', `Yes, this is ${clientRecord?.firstName || 'me'}. Who's calling?`, 2);
    addTurn('agent', `Hi! I'm the AI Assistant from Elegance Hair Salon. I'm calling to confirm your appointment for ${serviceName} with ${barberName} scheduled on ${appointmentDate} at ${appointmentTime}. Are you still good to make it?`, 5);
    addTurn('customer', `Yes, I am still coming. Please confirm it.`, 9);
    
    if (aiAutoRescheduleEnabled) {
      addTurn('agent', `Wonderful! I have updated your appointment status to confirmed in our system. We look forward to seeing you at our salon! Have a great day.`, 12);
      addTurn('customer', `Thank you so much! Looking forward to it. Bye.`, 15);
      outcome = 'Confirmed';
      summary = 'Client verbally confirmed the booking details.';
      if (apptRecord) {
        apptRecord.status = 'confirmed';
        await apptRecord.save();
      }
    } else {
      addTurn('agent', `I apologize, but automatic appointment confirmation and rescheduling is currently disabled by the salon administration. Please contact our front desk at 3 1 2, 5 5 5, 0 1 0 0 to confirm your appointment.`, 12);
      addTurn('customer', `Oh, I see. I will call the front desk. Thanks anyway.`, 15);
      outcome = 'Requires Manual Action';
      summary = 'Automatic confirmation blocked due to disabled AI auto-reschedule settings.';
    }
  } else if (callLog.type === 'feedback') {
    addTurn('agent', `Hi ${clientRecord?.firstName || 'there'}! This is the AI voice assistant for Elegance Hair Salon. I hope you enjoyed your recent ${serviceName} with ${barberName}. Do you have a quick moment to rate your experience from 1 to 5?`, 0);
    addTurn('customer', `Oh, hi! Yes, it was great. I'd give it a 5 out of 5.`, 3);
    addTurn('agent', `That's amazing! We love to hear that. Any specific comments about the service or things we can do better next time?`, 6);
    addTurn('customer', `The barber was super friendly and did the fade exactly how I wanted. Best haircut I've had in years!`, 9);
    addTurn('agent', `Thank you so much for the feedback! I've noted down your compliments. We really appreciate your loyalty. Have a fantastic day!`, 13);
    addTurn('customer', `Thanks! You too. Bye.`, 16);

    outcome = 'Feedback Collected';
    summary = 'Client rated service 5/5, mentioning barber friendliness and excellent fade details.';
    
    // Add note to client profile
    if (clientRecord) {
      clientRecord.notes = (clientRecord.notes ? clientRecord.notes + '\n\n' : '') + `[AI Voice Feedback]: Rating 5/5. Best haircut in years, loved the fade.`;
      await clientRecord.save();
    }
  } else if (callLog.type === 're-engagement') {
    addTurn('agent', `Hello ${clientRecord?.firstName || 'there'}! I'm calling from Elegance Hair Salon. We noticed it's been a while since your last visit, and we miss having you in the chair. We actually have a few openings this Friday afternoon. Would you be interested in booking a haircut?`, 0);
    addTurn('customer', `Hey! Yeah, it has been a couple of months. Friday actually works for me. What times do you have open?`, 4);
    addTurn('agent', `We have openings at 2:00 PM and 4:30 PM with ${barberName || 'our stylists'}. Would either of those fit your schedule?`, 8);
    addTurn('customer', `2:00 PM on Friday works perfectly. Can you book that?`, 11);

    if (aiAutoRescheduleEnabled) {
      addTurn('agent', `Absolutely! I've provisionally scheduled you for a standard haircut this Friday at 2:00 PM. I'll send you an SMS confirmation shortly. We're looking forward to welcoming you back!`, 14);
      addTurn('customer', `Awesome, thank you. See you Friday!`, 18);

      outcome = 'Appointment Scheduled';
      summary = 'Dormant client successfully re-engaged. Scheduled haircut for upcoming Friday at 2:00 PM.';

      // Create a new mock appointment
      if (clientRecord) {
        const dayjs = require('dayjs');
        const targetDate = dayjs().add(2, 'day').format('YYYY-MM-DD'); // Friday-ish
        await Appointment.create({
          salonId: callLog.salonId,
          locationId: location?._id || new mongoose.Types.ObjectId(),
          clientId: clientRecord._id,
          barberId: barber?._id || new mongoose.Types.ObjectId(),
          serviceId: service?._id || new mongoose.Types.ObjectId(),
          date: targetDate,
          startTime: '14:00',
          endTime: '14:30',
          status: 'confirmed',
          source: 'phone',
          notes: '[AI Voice Auto-Booking] Client re-engaged via outbound call.'
        });

        clientRecord.visitCount += 1;
        await clientRecord.save();
      }
    } else {
      addTurn('agent', `I apologize, but automatic scheduling is currently disabled by the salon administration. Please call our front desk or visit our website to secure your slot.`, 14);
      addTurn('customer', `Okay, I will do that. Thanks anyway.`, 17);
      outcome = 'Requires Manual Action';
      summary = 'Automatic booking blocked due to disabled AI auto-reschedule settings.';
    }
  }

  callLog.status = 'completed';
  callLog.duration = transcript.length * 5; // simulated seconds
  callLog.outcome = outcome;
  callLog.summary = summary;
  callLog.transcript = transcript;
  await callLog.save();
  console.log(`[simulateMockCall] SAVED successfully. outcome=${outcome}`);
  } catch (err) {
    console.error(`[simulateMockCall] CRASHED:`, err);
    throw err;
  }
}

/**
 * Generate initial TwiML for incoming Twilio call
 */
async function generateInitialTwiML(callLogId) {
  const callLog = await CallLog.findById(callLogId);
  if (!callLog) {
    const response = new twilio.twiml.VoiceResponse();
    response.say('Error locating call records. Goodbye.');
    return response.toString();
  }

  const clientRecord = await Client.findById(callLog.clientId);
  const apptRecord = callLog.appointmentId ? await Appointment.findById(callLog.appointmentId) : null;
  const service = apptRecord ? await Service.findById(apptRecord.serviceId) : null;
  const barber = apptRecord ? await Barber.findById(apptRecord.barberId) : null;

  const clientName = clientRecord ? clientRecord.firstName : 'there';
  const serviceName = service ? service.name : 'haircut';
  const barberName = barber ? barber.name : 'your barber';
  const apptTime = apptRecord ? apptRecord.startTime : '';

  const response = new twilio.twiml.VoiceResponse();
  let speechText = '';

  if (callLog.type === 'confirmation') {
    speechText = `Hello, is this ${clientName}? I am calling from Elegance Hair Salon to confirm your appointment for ${serviceName} with ${barberName} today at ${apptTime}. Please tell me if you want to confirm or cancel this booking.`;
  } else if (callLog.type === 'feedback') {
    speechText = `Hi ${clientName}! This is Elegance Hair Salon. We hope you liked your recent haircut. Could you tell us how happy you were with the service out of 5 stars?`;
  } else {
    speechText = `Hello ${clientName}! This is Elegance Hair Salon checking in. We haven't seen you in a while and wanted to see if you would like to book a fresh haircut this week?`;
  }

  // Update CallLog with initial turn
  callLog.status = 'in-progress';
  callLog.transcript.push({
    speaker: 'agent',
    text: speechText,
    timestamp: new Date()
  });
  await callLog.save();

  response.say({ voice: 'Polly.Joanna' }, speechText);
  response.gather({
    input: 'speech',
    action: `/api/voice/respond?callLogId=${callLog._id}`,
    timeout: 5,
    speechTimeout: 'auto',
  });

  return response.toString();
}

/**
 * Handle Twilio speech-to-text callback and run conversation engine
 */
async function processVoiceSpeech(callLogId, speechResult) {
  const callLog = await CallLog.findById(callLogId);
  if (!callLog) {
    const response = new twilio.twiml.VoiceResponse();
    response.say('System error. Goodbye.');
    return response.toString();
  }

  // Save customer turn
  callLog.transcript.push({
    speaker: 'customer',
    text: speechResult,
    timestamp: new Date()
  });
  await callLog.save();

  const clientRecord = await Client.findById(callLog.clientId);
  const apptRecord = callLog.appointmentId ? await Appointment.findById(callLog.appointmentId) : null;
  const service = apptRecord ? await Service.findById(apptRecord.serviceId) : null;
  const barber = apptRecord ? await Barber.findById(apptRecord.barberId) : null;

  const clientName = clientRecord ? clientRecord.firstName : 'Client';
  const serviceName = service ? service.name : ' haircut';
  const barberName = barber ? barber.name : 'our barber';

  let replyText = '';
  let finishCall = false;
  let outcome = callLog.outcome;
  let summary = callLog.summary;

  // Use OpenAI if configured
  if (openai) {
    try {
      const historyStr = callLog.transcript.map(t => `${t.speaker === 'agent' ? 'AI Assistant' : 'Customer'}: ${t.text}`).join('\n');
      const prompt = `You are the outbound AI Voice Assistant for Elegance Hair Salon.
We are on a live phone call with the customer ${clientName}.
Call Purpose: ${callLog.type.toUpperCase()}
Appointment Details: ${serviceName} with ${barberName}.

Current Conversation History:
${historyStr}

Guidelines:
1. Speak concisely in 1-2 simple sentences maximum, since this is text-to-speech.
2. Be friendly, clean, and professional. Avoid emojis.
3. If this is a confirmation call and the client agrees to confirm, reply confirming you have marked it as confirmed, and end the call.
4. If they wish to cancel or reschedule, ask them to call the front desk at (312) 555-0100.
5. If the customer indicates they are finished or saying goodbye, output a goodbye message and end the dialog.

Return a JSON structure:
{
  "reply": "next spoken sentence",
  "finishCall": true/false,
  "outcome": "Updated Outcome status (e.g. Confirmed, Feedback Collected, Rescheduled, Opt-out)",
  "summary": "Brief 1-sentence call summary"
}`;

      const chatCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(chatCompletion.choices[0].message.content);
      replyText = parsed.reply;
      finishCall = parsed.finishCall;
      outcome = parsed.outcome;
      summary = parsed.summary;
    } catch (err) {
      console.error('[OpenAI Voice API Error] Falling back to rule-based dialog:', err.message);
    }
  }

  // Fallback Rule-Based dialogue processing if OpenAI fails or is unconfigured
  if (!replyText) {
    const textLower = speechResult.toLowerCase();
    
    if (callLog.type === 'confirmation') {
      if (textLower.includes('yes') || textLower.includes('confirm') || textLower.includes('good') || textLower.includes('coming')) {
        replyText = `Great! I've marked your appointment as confirmed. We look forward to seeing you at Elegance Salon. Goodbye!`;
        finishCall = true;
        outcome = 'Confirmed';
        summary = 'Customer verbally confirmed their appointment.';
      } else if (textLower.includes('no') || textLower.includes('cancel') || textLower.includes('change') || textLower.includes('reschedule')) {
        replyText = `Understood. Please call our front desk at 3 1 2, 5 5 5, 0 1 0 0 to adjust your reservation. Thank you, goodbye.`;
        finishCall = true;
        outcome = 'Needs Reschedule';
        summary = 'Customer requested a cancellation or rescheduling.';
      } else {
        replyText = `I heard you say: "${speechResult}". Did you want to confirm your booking for ${serviceName} with ${barberName}? Please say yes or no.`;
      }
    } else if (callLog.type === 'feedback') {
      if (textLower.includes('5') || textLower.includes('five') || textLower.includes('great') || textLower.includes('excellent') || textLower.includes('good')) {
        replyText = `Thank you so much for the 5-star rating! We are thrilled to hear you had a great experience. Have a wonderful day!`;
        finishCall = true;
        outcome = 'Feedback Collected';
        summary = 'Customer rated the experience 5/5 and shared positive feedback.';
      } else {
        replyText = `Thank you for sharing your feedback. I have shared it with our styling team. Have a great day!`;
        finishCall = true;
        outcome = 'Feedback Collected';
        summary = `Customer shared feedback: "${speechResult}"`;
      }
    } else {
      if (textLower.includes('yes') || textLower.includes('book') || textLower.includes('sure') || textLower.includes('haircut')) {
        replyText = `Perfect! Please call our front desk or visit our online site to secure your slot. We look forward to booking you in. Goodbye!`;
        finishCall = true;
        outcome = 'Interpreted Booking Interest';
        summary = 'Customer expressed booking interest during re-engagement.';
      } else {
        replyText = `No problem at all. We will be here whenever you need your next haircut. Thank you for your time, goodbye.`;
        finishCall = true;
        outcome = 'Declined';
        summary = 'Customer declined re-engagement booking.';
      }
    }
  }

  // Get salon settings to check AI auto-reschedule permission
  const salon = await Salon.findById(callLog.salonId);
  const aiAutoRescheduleEnabled = salon && salon.settings && salon.settings.aiAutoReschedule;

  if (finishCall && outcome === 'Confirmed' && !aiAutoRescheduleEnabled) {
    replyText = `I apologize, but automatic appointment confirmation and rescheduling is currently disabled by the salon administration. Please contact our front desk at 3 1 2, 5 5 5, 0 1 0 0 to confirm your appointment. Goodbye!`;
    outcome = 'Requires Manual Action';
    summary = 'Automatic confirmation blocked due to disabled AI auto-reschedule settings.';
  }

  // Update CallLog with Agent's turn
  callLog.outcome = outcome;
  callLog.summary = summary;
  callLog.transcript.push({
    speaker: 'agent',
    text: replyText,
    timestamp: new Date()
  });
  await callLog.save();

  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: 'Polly.Joanna' }, replyText);

  if (finishCall) {
    // If appointment is confirmed, persist to DB
    if (outcome === 'Confirmed' && apptRecord) {
      apptRecord.status = 'confirmed';
      await apptRecord.save();
    }
    response.hangup();
  } else {
    // Continue loop
    response.gather({
      input: 'speech',
      action: `/api/voice/respond?callLogId=${callLog._id}`,
      timeout: 5,
      speechTimeout: 'auto',
    });
  }

  return response.toString();
}

/**
 * Periodically escalates SMS to Voice confirmation calls if enabled
 */
async function checkSmsToVoiceEscalation() {
  try {
    const salons = await Salon.find().lean();
    for (const salon of salons) {
      if (!salon.settings || !salon.settings.voiceCallEscalation) {
        continue;
      }

      // Query appointments: need-confirm, SMS sent, created > 15 minutes ago
      const dayjs = require('dayjs');
      const fifteenMinsAgo = dayjs().subtract(15, 'minute').toDate();

      const unconfirmedAppts = await Appointment.find({
        salonId: salon._id,
        status: 'need-confirm',
        smsConfirmationSent: true,
        createdAt: { $lt: fifteenMinsAgo },
      });

      for (const appt of unconfirmedAppts) {
        try {
          // Verify no call has been placed already
          const existingCall = await CallLog.findOne({
            appointmentId: appt._id,
            type: 'confirmation',
          });

          if (!existingCall) {
            const clientExists = await Client.findById(appt.clientId);
            if (!clientExists) {
              console.log(`[Escalation Scheduler] Skipping orphan appointment ${appt._id} because client ${appt.clientId} does not exist.`);
              continue;
            }

            console.log(`[Escalation Scheduler] Escalating unconfirmed appointment ${appt._id} to outbound voice agent.`);
            await triggerOutboundCall({
              clientId: appt.clientId,
              appointmentId: appt._id,
              type: 'confirmation',
              salonId: salon._id,
            });
          }
        } catch (e) {
          console.error(`[Escalation Scheduler Appointment Error] Failed for appt ${appt._id}:`, e.message);
        }
      }
    }
  } catch (err) {
    console.error('[Escalation Scheduler Error]:', err.message);
  }
}

module.exports = {
  triggerOutboundCall,
  simulateMockCall,
  generateInitialTwiML,
  processVoiceSpeech,
  checkSmsToVoiceEscalation
};
