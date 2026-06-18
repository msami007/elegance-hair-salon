const { OpenAI } = require('openai');
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Barber = require('../models/Barber');
const Client = require('../models/Client');
const Service = require('../models/Service');
const Salon = require('../models/Salon');
const { sendSMS } = require('./twilio');
const dayjs = require('dayjs');

// Initialize OpenAI client
const apiKey = process.env.OPENAI_API_KEY;
let openai = null;
if (apiKey && apiKey !== 'YOUR_OPENAI_API_KEY') {
  openai = new OpenAI({ apiKey });
}

/**
 * DB Query: Find Appointments
 */
async function queryAppointments({ startDate, endDate, barberId, salonId }) {
  const filter = {};
  if (salonId) filter.salonId = new mongoose.Types.ObjectId(salonId);
  if (barberId) filter.barberId = new mongoose.Types.ObjectId(barberId);
  
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = startDate;
    if (endDate) filter.date.$lte = endDate;
  }

  const appointments = await Appointment.find(filter)
    .populate('barberId', 'name')
    .populate('serviceId', 'name price')
    .sort({ date: 1, time: 1 })
    .lean();

  return appointments.map(app => ({
    id: app._id,
    clientName: `${app.firstName} ${app.lastName}`,
    phone: app.phone,
    barber: app.barberId?.name || 'Any',
    service: app.serviceId?.name || 'Service',
    price: app.serviceId ? (app.serviceId.price / 100).toFixed(2) : '0.00',
    date: app.date,
    time: app.time,
    status: app.status
  }));
}

/**
 * DB Query: Find Barbers
 */
async function queryBarbers({ salonId }) {
  const filter = { isActive: true };
  if (salonId) filter.salonId = new mongoose.Types.ObjectId(salonId);

  const barbers = await Barber.find(filter).lean();
  return barbers.map(b => ({
    id: b._id,
    name: b.name,
    title: b.title,
    specialisms: b.specialisms,
    role: b.role
  }));
}

/**
 * DB Query: Find Clients
 */
async function queryClients({ searchQuery, salonId }) {
  const filter = {};
  if (salonId) filter.salonId = new mongoose.Types.ObjectId(salonId);

  if (searchQuery) {
    filter.$or = [
      { firstName: { $regex: searchQuery, $options: 'i' } },
      { lastName: { $regex: searchQuery, $options: 'i' } },
      { phone: { $regex: searchQuery, $options: 'i' } }
    ];
  }

  const clients = await Client.find(filter).sort({ visitCount: -1 }).limit(20).lean();
  return clients.map(c => ({
    id: c._id,
    name: `${c.firstName} ${c.lastName}`,
    phone: c.phone,
    email: c.email,
    visitCount: c.visitCount,
    lastVisit: c.lastVisit ? dayjs(c.lastVisit).format('YYYY-MM-DD') : 'Never',
    totalRevenue: (c.totalRevenue / 100).toFixed(2)
  }));
}

/**
 * DB Query: Find Inactive (Slip-Away) Clients
 */
async function queryInactiveClients({ daysThreshold = 90, salonId }) {
  const filter = {};
  if (salonId) filter.salonId = new mongoose.Types.ObjectId(salonId);

  const thresholdDate = dayjs().subtract(daysThreshold, 'day').toDate();
  
  // Find clients whose last visit was before threshold, or who have never visited but were created before threshold
  filter.$or = [
    { lastVisit: { $lt: thresholdDate } },
    { lastVisit: { $exists: false }, createdAt: { $lt: thresholdDate } }
  ];

  const clients = await Client.find(filter).sort({ lastVisit: 1 }).lean();
  return clients.map(c => ({
    id: c._id,
    name: `${c.firstName} ${c.lastName}`,
    phone: c.phone,
    visitCount: c.visitCount,
    lastVisit: c.lastVisit ? dayjs(c.lastVisit).format('YYYY-MM-DD') : 'Never'
  }));
}

/**
 * Twilio Action: Send SMS reminders
 */
async function sendReminderSMS({ appointmentIds }) {
  let count = 0;
  const logs = [];

  for (const id of appointmentIds) {
    try {
      const app = await Appointment.findById(id).populate('serviceId', 'name');
      if (!app) continue;

      const message = `Elegance Salon Reminder: Hi ${app.firstName}, you have an appointment for ${app.serviceId?.name || 'haircut'} tomorrow at ${app.time}. Confirm by replying YES.`;
      
      const twilioRes = await sendSMS({ to: app.phone, body: message });
      if (twilioRes.success) {
        count++;
        app.status = 'need-confirm';
        app.notes = (app.notes ? app.notes + '\n' : '') + `[${dayjs().format('YYYY-MM-DD HH:mm')}] Sent automated Copilot reminder SMS`;
        await app.save();
        logs.push({ id, client: `${app.firstName} ${app.lastName}`, status: 'sent' });
      } else {
        logs.push({ id, client: `${app.firstName} ${app.lastName}`, status: 'failed', error: twilioRes.error });
      }
    } catch (err) {
      logs.push({ id, error: err.message });
    }
  }

  return { success: true, count, details: logs };
}

/**
 * Twilio Action: Send Bulk Promo SMS
 */
async function sendBulkPromoSMS({ clientIds, promoMessage }) {
  let count = 0;
  const logs = [];

  for (const id of clientIds) {
    try {
      const client = await Client.findById(id);
      if (!client) continue;

      const body = promoMessage.replace('[Name]', client.firstName);
      const twilioRes = await sendSMS({ to: client.phone, body });
      
      if (twilioRes.success) {
        count++;
        client.notes = (client.notes ? client.notes + '\n' : '') + `[${dayjs().format('YYYY-MM-DD HH:mm')}] Sent Copilot promo SMS: "${body}"`;
        if (!client.tags.includes('promo-sent')) {
          client.tags.push('promo-sent');
        }
        await client.save();
        logs.push({ id, name: `${client.firstName} ${client.lastName}`, status: 'sent' });
      } else {
        logs.push({ id, name: `${client.firstName} ${client.lastName}`, status: 'failed', error: twilioRes.error });
      }
    } catch (err) {
      logs.push({ id, error: err.message });
    }
  }

  return { success: true, count, details: logs };
}

/**
 * Fallback Parser: Regex-based natural language execution
 */
async function processCommandFallback(message, salonId) {
  const text = message.toLowerCase();
  const todayStr = dayjs().format('YYYY-MM-DD');
  const tomorrowStr = dayjs().add(1, 'day').format('YYYY-MM-DD');

  // 1. Send reminders to tomorrow's appointments
  if (text.includes('send') && text.includes('reminder') && (text.includes('tomorrow') || text.includes('next day'))) {
    const apps = await Appointment.find({
      salonId: new mongoose.Types.ObjectId(salonId),
      date: tomorrowStr,
      status: { $ne: 'cancelled' }
    }).lean();

    if (!apps.length) {
      return {
        response: `I searched the schedule for tomorrow (${tomorrowStr}) but did not find any upcoming appointments to send reminders to.`,
        actions: []
      };
    }

    const appIds = apps.map(a => a._id.toString());
    const result = await sendReminderSMS({ appointmentIds: appIds });

    return {
      response: `I successfully processed and sent SMS reminders to ${result.count} client(s) with appointments scheduled for tomorrow (${tomorrowStr}).`,
      actions: [{ type: 'send_reminder_sms', count: result.count, details: result.details }]
    };
  }

  // 2. Query appointments tomorrow
  if (text.includes('appointment') && (text.includes('tomorrow') || text.includes('next day'))) {
    const data = await queryAppointments({ startDate: tomorrowStr, endDate: tomorrowStr, salonId });
    if (!data.length) {
      return { response: `There are no appointments scheduled for tomorrow (${tomorrowStr}).`, actions: [] };
    }
    const listText = data.map(a => `- **${a.time}**: ${a.clientName} for ${a.service} with ${a.barber} ($${a.price})`).join('\n');
    return {
      response: `We have **${data.length} appointment(s)** scheduled for tomorrow (${tomorrowStr}):\n\n${listText}`,
      actions: []
    };
  }

  // 3. Query appointments today
  if (text.includes('appointment') && (text.includes('today') || text.includes('current day'))) {
    const data = await queryAppointments({ startDate: todayStr, endDate: todayStr, salonId });
    if (!data.length) {
      return { response: `There are no appointments scheduled for today (${todayStr}).`, actions: [] };
    }
    const listText = data.map(a => `- **${a.time}**: ${a.clientName} for ${a.service} with ${a.barber} ($${a.price})`).join('\n');
    return {
      response: `We have **${data.length} appointment(s)** scheduled for today (${todayStr}):\n\n${listText}`,
      actions: []
    };
  }

  // 4. Inactive/slip-away clients (90 days)
  if (text.includes('slip-away') || text.includes('inactive') || text.includes('not visited') || text.includes('90 days')) {
    const clients = await queryInactiveClients({ daysThreshold: 90, salonId });
    if (!clients.length) {
      return { response: `No clients found who haven't visited in the last 90 days.`, actions: [] };
    }
    const listText = clients.slice(0, 10).map(c => `- **${c.name}** (Phone: ${c.phone}, Last visit: ${c.lastVisit}, Visits: ${c.visitCount})`).join('\n');
    const suffix = clients.length > 10 ? `\n*...and ${clients.length - 10} more clients.*` : '';
    return {
      response: `I found **${clients.length} clients** who haven't visited in the last 90 days:\n\n${listText}${suffix}\n\nYou can ask me to send them a promo message, e.g. "send a 20% off promo to all slip-away clients".`,
      actions: []
    };
  }

  // 5. Send promo to slip-away clients
  if (text.includes('send') && (text.includes('promo') || text.includes('off') || text.includes('discount')) && (text.includes('slip-away') || text.includes('inactive'))) {
    const clients = await queryInactiveClients({ daysThreshold: 90, salonId });
    if (!clients.length) {
      return { response: `No inactive clients found to send promotional offers to.`, actions: [] };
    }

    const clientIds = clients.map(c => c.id.toString());
    const promoMessage = "Hi [Name]! We miss you at Elegance Salon. Book your next visit this week and get 20% off with code FRESH20: http://localhost:5173";
    const result = await sendBulkPromoSMS({ clientIds, promoMessage });

    return {
      response: `I successfully sent a 20% off promotional SMS to **${result.count} inactive client(s)** to encourage them to rebook.`,
      actions: [{ type: 'send_bulk_promo_sms', count: result.count, details: result.details }]
    };
  }

  // 6. Check client visit history
  if (text.includes('visit') || text.includes('how many times') || text.includes('client')) {
    // Attempt to extract client name or phone
    const words = message.split(' ');
    let query = '';
    // Simple extraction: look for capitalized words that aren't common
    const candidates = words.filter(w => w[0] === w[0]?.toUpperCase() && w.toLowerCase() !== 'i' && w.toLowerCase() !== 'how' && w.toLowerCase() !== 'salon' && w.toLowerCase() !== 'barber');
    if (candidates.length > 0) query = candidates.join(' ');
    
    // Fallback search for phone numbers
    const phoneMatch = message.match(/(\d{7,12})/);
    if (phoneMatch) query = phoneMatch[1];

    if (query) {
      const clients = await queryClients({ searchQuery: query, salonId });
      if (clients.length > 0) {
        const primary = clients[0];
        return {
          response: `Client **${primary.name}** (Phone: ${primary.phone}) has visited **${primary.visitCount} times**. Their last recorded visit was **${primary.lastVisit}** and total revenue generated is **$${primary.totalRevenue}**.`,
          actions: []
        };
      }
    }
  }

  // 7. Which barber is booked the most / popular barber
  if (text.includes('barber') && (text.includes('popular') || text.includes('booked') || text.includes('highest'))) {
    const barbers = await Barber.find({ salonId, isActive: true }).lean();
    const stats = [];
    for (const b of barbers) {
      const count = await Appointment.countDocuments({ barberId: b._id, status: 'confirmed' });
      stats.push({ name: b.name, title: b.title, count });
    }
    stats.sort((a, b) => b.count - a.count);
    const listText = stats.map(s => `- **${s.name}** (${s.title}): ${s.count} confirmed bookings`).join('\n');
    return {
      response: `Here is the current barber booking leaderboard:\n\n${listText}\n\n**${stats[0]?.name || 'Lucky'}** has the highest booking count!`,
      actions: []
    };
  }

  // 8. General Info Fallback
  return {
    response: `I am your Elegance Copilot. I can search database records and schedule events. Here are some examples of what you can ask me to do:\n\n` +
      `- "How many appointments do we have tomorrow?"\n` +
      `- "Which barber is booked the most?"\n` +
      `- "Check how many times John Doe has visited"\n` +
      `- "Which clients are slip-aways?"\n` +
      `- "Send a reminder to all appointments tomorrow" (Triggers SMS)\n` +
      `- "Send a 20% off message to all slip-away clients" (Triggers SMS)`,
    actions: []
  };
}

/**
 * Main Controller Entrypoint
 */
async function processCommand(message, salonId) {
  if (!openai) {
    console.log('[Copilot] Running in mock parser mode (No OpenAI Key)');
    return processCommandFallback(message, salonId);
  }

  try {
    const messages = [
      {
        role: 'system',
        content: `You are Elegance Copilot, an AI operations manager for Elegance Hair Salon & Barbershop.
You sit directly on top of the salon's database. You have permissions to query database collections (appointments, barbers, clients, services) and trigger Twilio SMS notifications.
The current date is ${dayjs().format('YYYY-MM-DD')}. Tomorrow is ${dayjs().add(1, 'day').format('YYYY-MM-DD')}.

Guidelines:
1. Always be professional, concise, and do not use emojis.
2. If the user asks a question, call the appropriate database queries to fetch facts, then summarize clearly.
3. If the user asks to "send reminders" or "send marketing/promo messages", resolve the list of clients/appointments first, and call the corresponding action tools (e.g. send_reminder_sms or send_bulk_promo_sms). Always summarize exactly how many messages were sent.
4. Keep prices formatted nicely (divide cents by 100).`
      },
      { role: 'user', content: message }
    ];

    const tools = [
      {
        type: 'function',
        function: {
          name: 'query_appointments',
          description: 'Fetch appointments within a date range.',
          parameters: {
            type: 'object',
            properties: {
              startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
              endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
              barberId: { type: 'string', description: 'Filter by barber MongoDB ObjectId (optional)' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'query_barbers',
          description: 'Fetch all active barbers at the salon.',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'query_clients',
          description: 'Search client list by name, phone, or return top clients.',
          parameters: {
            type: 'object',
            properties: {
              searchQuery: { type: 'string', description: 'Search term name or phone (optional)' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'query_inactive_clients',
          description: 'Find clients who have not visited in a while.',
          parameters: {
            type: 'object',
            properties: {
              daysThreshold: { type: 'number', description: 'Days since last visit. Default 90.' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'send_reminder_sms',
          description: 'Send Twilio reminder texts to a list of appointment IDs.',
          parameters: {
            type: 'object',
            properties: {
              appointmentIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of appointment IDs'
              }
            },
            required: ['appointmentIds']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'send_bulk_promo_sms',
          description: 'Send bulk re-engagement promo SMS to a list of client IDs.',
          parameters: {
            type: 'object',
            properties: {
              clientIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of client IDs'
              },
              promoMessage: {
                type: 'string',
                description: 'SMS message body. Use [Name] as a merge tag for first name.'
              }
            },
            required: ['clientIds', 'promoMessage']
          }
        }
      }
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto'
    });

    const responseMessage = response.choices[0].message;
    const toolCalls = responseMessage.tool_calls;

    if (!toolCalls) {
      return { response: responseMessage.content, actions: [] };
    }

    // Process tool calls
    const executedActions = [];
    messages.push(responseMessage);

    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);
      let result = null;

      if (functionName === 'query_appointments') {
        result = await queryAppointments({ ...functionArgs, salonId });
      } else if (functionName === 'query_barbers') {
        result = await queryBarbers({ salonId });
      } else if (functionName === 'query_clients') {
        result = await queryClients({ ...functionArgs, salonId });
      } else if (functionName === 'query_inactive_clients') {
        result = await queryInactiveClients({ ...functionArgs, salonId });
      } else if (functionName === 'send_reminder_sms') {
        result = await sendReminderSMS(functionArgs);
        executedActions.push({ type: 'send_reminder_sms', count: result.count, details: result.details });
      } else if (functionName === 'send_bulk_promo_sms') {
        result = await sendBulkPromoSMS(functionArgs);
        executedActions.push({ type: 'send_bulk_promo_sms', count: result.count, details: result.details });
      }

      messages.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: JSON.stringify(result)
      });
    }

    // Call chat completion again to formulate response
    const secondResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages
    });

    return {
      response: secondResponse.choices[0].message.content,
      actions: executedActions
    };
  } catch (error) {
    console.error('[Copilot OpenAI Error]', error);
    // Fall back to regex parser in case of API failure or invalid key
    return processCommandFallback(message, salonId);
  }
}

module.exports = {
  processCommand
};
