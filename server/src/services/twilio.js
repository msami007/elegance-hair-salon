const twilio = require('twilio');

let client = null;

function normalizePhone(p) {
  if (!p) return '';
  let normalized = p.replace(/[^0-9+]/g, '');
  if (normalized.startsWith('+')) {
    return normalized;
  }
  // Pakistan patterns: 03xxxxxxxxx -> +923xxxxxxxxx
  if (normalized.startsWith('03') && normalized.length === 11) {
    return '+92' + normalized.substring(1);
  }
  // Pakistan patterns: 923xxxxxxxxx -> +923xxxxxxxxx
  if (normalized.startsWith('92') && normalized.length === 12) {
    return '+' + normalized;
  }
  // US patterns: 10 digits -> +1xxxxxxxxxx
  if (normalized.length === 10) {
    return '+1' + normalized;
  }
  // US patterns: 1xxxxxxxxxx -> +1xxxxxxxxxx
  if (normalized.startsWith('1') && normalized.length === 11) {
    return '+' + normalized;
  }
  // Fallback
  return '+' + normalized;
}

function getTwilioClient() {
  if (!client) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken || accountSid === 'ACtest') {
      console.log('[Twilio] Running in mock mode - no real SMS will be sent');
      return null;
    }

    client = twilio(accountSid, authToken);
  }
  return client;
}

/**
 * Send booking confirmation SMS to client
 * @param {Object} params
 * @param {string} params.to - Client phone number (E.164)
 * @param {string} params.clientName - Client name
 * @param {string} params.serviceName - Service name
 * @param {string} params.barberName - Barber name
 * @param {string} params.date - Appointment date
 * @param {string} params.time - Appointment time
 * @param {string} params.locationName - Location name
 * @returns {Object} { success, messageSid, mock }
 */
async function sendBookingConfirmation({ to, clientName, serviceName, barberName, date, time, locationName }) {
  const normalizedTo = normalizePhone(to);
  // Concise & emoji-free to prevent Twilio Error 30044 (Trial Message Length Exceeded)
  const message = `Elegance Salon: Hi ${clientName}! Booking confirmed for ${serviceName} with ${barberName} on ${date} at ${time}. Location: ${locationName}.`;

  const twilioClient = getTwilioClient();

  if (!twilioClient) {
    // Mock mode for development
    console.log(`[Twilio Mock] SMS to ${normalizedTo}:\n${message}`);
    return { success: true, messageSid: 'MOCK_' + Date.now(), mock: true };
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalizedTo,
    });

    console.log(`[Twilio] SMS sent to ${normalizedTo}: ${result.sid}`);
    return { success: true, messageSid: result.sid, mock: false };
  } catch (error) {
    console.error(`[Twilio] Failed to send SMS to ${normalizedTo}:`, error.message);
    return { success: false, error: error.message, mock: false };
  }
}

async function sendSMS({ to, body }) {
  const normalizedTo = normalizePhone(to);
  const twilioClient = getTwilioClient();

  if (!twilioClient) {
    console.log(`[Twilio Mock] SMS to ${normalizedTo}:\n${body}`);
    return { success: true, messageSid: 'MOCK_SMS_' + Date.now(), mock: true };
  }

  try {
    const result = await twilioClient.messages.create({
      body: body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalizedTo,
    });

    console.log(`[Twilio] Custom SMS sent to ${normalizedTo}: ${result.sid}`);
    return { success: true, messageSid: result.sid, mock: false };
  } catch (error) {
    console.error(`[Twilio] Failed to send custom SMS to ${normalizedTo}:`, error.message);
    return { success: false, error: error.message, mock: false };
  }
}

module.exports = { sendBookingConfirmation, sendSMS, normalizePhone };
