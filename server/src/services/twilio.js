const twilio = require('twilio');

let client = null;

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
  const message = `✂️ Elegance Hair Salon\n\nHi ${clientName}! Your appointment is confirmed.\n\n📋 ${serviceName}\n💈 with ${barberName}\n📅 ${date} at ${time}\n📍 ${locationName}\n\nSee you soon! Reply CANCEL to cancel.`;

  const twilioClient = getTwilioClient();

  if (!twilioClient) {
    // Mock mode for development
    console.log(`[Twilio Mock] SMS to ${to}:\n${message}`);
    return { success: true, messageSid: 'MOCK_' + Date.now(), mock: true };
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to,
    });

    console.log(`[Twilio] SMS sent to ${to}: ${result.sid}`);
    return { success: true, messageSid: result.sid, mock: false };
  } catch (error) {
    console.error(`[Twilio] Failed to send SMS to ${to}:`, error.message);
    return { success: false, error: error.message, mock: false };
  }
}

module.exports = { sendBookingConfirmation };
