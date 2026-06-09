require('dotenv').config();
const { sendSMS } = require('./services/twilio');

// Retrieve recipient phone number from CLI arguments
const recipient = process.argv[2];

if (!recipient) {
  console.log('\n❌ Error: Please specify a recipient phone number (including country code).');
  console.log('Usage: node src/test-sms.js +92XXXXXXXXXX\n');
  process.exit(1);
}

async function testTwilio() {
  console.log(`\n⏳ Sending test SMS to: ${recipient}...`);
  console.log(`Using Twilio Number: ${process.env.TWILIO_PHONE_NUMBER}`);
  console.log(`Account SID: ${process.env.TWILIO_ACCOUNT_SID}`);

  const res = await sendSMS({
    to: recipient,
    body: 'Elegance Salon: Test SMS working! Your Twilio credentials and geo-permissions are configured correctly.'
  });

  if (res.success) {
    console.log(`\n✅ Success! SMS Sent. SID: ${res.messageSid}\n`);
  } else {
    console.log(`\n❌ Error sending SMS: ${res.error}\n`);
    console.log('Troubleshooting tips:');
    console.log('1. Make sure you enabled SMS Geo-Permissions for the destination country in the Twilio Console.');
    console.log('2. Since you are on a free trial account, make sure the destination number is added to "Verified Caller IDs" in the Twilio Console.');
    console.log('3. Double check that TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in server/.env are correct.\n');
  }
}

testTwilio();
