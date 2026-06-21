const { OpenAI } = require('openai');
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Barber = require('../models/Barber');
const Client = require('../models/Client');
const Service = require('../models/Service');
const Salon = require('../models/Salon');
const { sendSMS } = require('./twilio');
const dayjs = require('dayjs');

let openaiClientInstance = null;

// Initialize OpenAI client dynamically
function getOpenAIClient() {
  const currentKey = process.env.OPENAI_API_KEY;
  if (currentKey && currentKey !== 'YOUR_OPENAI_API_KEY' && currentKey.trim() !== '') {
    if (!openaiClientInstance || openaiClientInstance.apiKey !== currentKey) {
      openaiClientInstance = new OpenAI({ apiKey: currentKey });
    }
    return openaiClientInstance;
  }
  return null;
}

/**
 * DB Query: Find Appointments
 */
async function queryAppointments({ startDate, endDate, barberId, salonId, clientId, searchQuery }) {
  const filter = {};
  if (salonId) filter.salonId = new mongoose.Types.ObjectId(salonId);
  if (barberId) filter.barberId = new mongoose.Types.ObjectId(barberId);
  if (clientId) filter.clientId = new mongoose.Types.ObjectId(clientId);
  
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = startDate;
    if (endDate) filter.date.$lte = endDate;
  }

  let appointments = await Appointment.find(filter)
    .populate('clientId', 'firstName lastName phone')
    .populate('barberId', 'name')
    .populate('serviceId', 'name price')
    .sort({ date: 1, startTime: 1 })
    .lean();

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    appointments = appointments.filter(app => {
      const name = app.clientId ? `${app.clientId.firstName || ''} ${app.clientId.lastName || ''}`.toLowerCase() : '';
      const phone = app.clientId?.phone || '';
      return name.includes(q) || phone.includes(q);
    });
  }

  return appointments.map(app => ({
    id: app._id,
    clientName: app.clientId ? `${app.clientId.firstName || ''} ${app.clientId.lastName || ''}`.trim() : 'Client',
    phone: app.clientId?.phone || '',
    barber: app.barberId?.name || 'Any',
    service: app.serviceId?.name || 'Service',
    price: app.serviceId ? (app.serviceId.price / 100).toFixed(2) : '0.00',
    date: app.date,
    time: app.startTime || app.time || '',
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
    const parts = searchQuery.trim().split(/\s+/);
    if (parts.length > 1) {
      filter.$or = [
        {
          $and: [
            { firstName: { $regex: parts[0], $options: 'i' } },
            { lastName: { $regex: parts[1], $options: 'i' } }
          ]
        },
        { firstName: { $regex: searchQuery, $options: 'i' } },
        { lastName: { $regex: searchQuery, $options: 'i' } },
        { phone: { $regex: searchQuery, $options: 'i' } }
      ];
    } else {
      filter.$or = [
        { firstName: { $regex: searchQuery, $options: 'i' } },
        { lastName: { $regex: searchQuery, $options: 'i' } },
        { phone: { $regex: searchQuery, $options: 'i' } }
      ];
    }
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
 * DB Query: Calculate Barber Retention Performance
 */
async function calculateBarberPerformance(salonId) {
  const barbers = await Barber.find({ salonId }).lean();
  const appointments = await Appointment.find({ salonId }).lean();

  const barberStats = {};
  barbers.forEach(b => {
    barberStats[b._id.toString()] = {
      name: b.name,
      title: b.title,
      uniqueClientsMap: new Map()
    };
  });

  appointments.forEach(appt => {
    const bId = appt.barberId?.toString();
    if (!bId || !barberStats[bId]) return;

    if (appt.status === 'completed' || appt.status === 'confirmed') {
      const cId = appt.clientId?.toString();
      if (cId) {
        const stats = barberStats[bId];
        stats.uniqueClientsMap.set(cId, (stats.uniqueClientsMap.get(cId) || 0) + 1);
      }
    }
  });

  const performance = Object.values(barberStats).map(stats => {
    const uniqueClientsCount = stats.uniqueClientsMap.size;
    let repeatClientsCount = 0;
    stats.uniqueClientsMap.forEach((count) => {
      if (count >= 2) repeatClientsCount++;
    });

    const returnRate = uniqueClientsCount > 0
      ? Math.round((repeatClientsCount / uniqueClientsCount) * 100)
      : 0;

    return {
      name: stats.name,
      title: stats.title,
      uniqueClientsCount,
      repeatClientsCount,
      returnRate
    };
  });

  // Sort by returnRate descending, then uniqueClientsCount descending
  performance.sort((a, b) => b.returnRate - a.returnRate || b.uniqueClientsCount - a.uniqueClientsCount);

  return performance;
}

/**
 * Twilio Action: Send SMS reminders
 */
async function sendReminderSMS({ appointmentIds }) {
  let count = 0;
  const logs = [];

  for (const id of appointmentIds) {
    try {
      const app = await Appointment.findById(id)
        .populate('clientId', 'firstName lastName phone')
        .populate('serviceId', 'name');
      if (!app) continue;

      const clientName = app.clientId?.firstName || 'Client';
      const clientPhone = app.clientId?.phone || '';
      const clientFullName = app.clientId ? `${app.clientId.firstName || ''} ${app.clientId.lastName || ''}`.trim() : 'Client';
      const appTime = app.startTime || app.time || '';

      const message = `Elegance Salon Reminder: Hi ${clientName}, you have an appointment for ${app.serviceId?.name || 'haircut'} tomorrow at ${appTime}. Confirm by replying YES.`;
      
      const twilioRes = await sendSMS({ to: clientPhone, body: message });
      if (twilioRes.success) {
        count++;
        app.status = 'need-confirm';
        app.notes = (app.notes ? app.notes + '\n' : '') + `[${dayjs().format('YYYY-MM-DD HH:mm')}] Sent automated Copilot reminder SMS`;
        await app.save();
        logs.push({ id, client: clientFullName, status: 'sent' });
      } else {
        logs.push({ id, client: clientFullName, status: 'failed', error: twilioRes.error });
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
 * DB Action: Cancel Appointment and send cancellation SMS
 */
async function cancelAppointment({ appointmentId }) {
  try {
    const app = await Appointment.findById(appointmentId)
      .populate('clientId')
      .populate('barberId')
      .populate('serviceId');

    if (!app) {
      return { success: false, error: 'Appointment not found' };
    }

    app.status = 'cancelled';
    app.notes = (app.notes ? app.notes + '\n' : '') + `[${dayjs().format('YYYY-MM-DD HH:mm')}] Cancelled by Elegance Copilot`;
    await app.save();

    try {
      const { cancelEnrollment } = require('./cadenceService');
      await cancelEnrollment(appointmentId);
    } catch (e) {
      console.error('[Copilot] Failed to cancel cadence enrollment:', e.message);
    }

    const clientName = app.clientId?.firstName || 'Client';
    const clientPhone = app.clientId?.phone || '';
    const serviceName = app.serviceId?.name || 'haircut';
    const appTime = app.startTime || app.time || '';
    const appDate = app.date || '';

    const clientFullName = app.clientId ? `${app.clientId.firstName || ''} ${app.clientId.lastName || ''}`.trim() : 'Client';
    const message = `Elegance Salon Cancellation: Hi ${clientName}, your appointment for ${serviceName} on ${appDate} at ${appTime} has been cancelled.`;

    let smsSent = false;
    let smsError = null;

    if (clientPhone) {
      const twilioRes = await sendSMS({ to: clientPhone, body: message });
      smsSent = twilioRes.success;
      smsError = twilioRes.error;
    }

    return {
      success: true,
      appointmentId,
      clientName: clientFullName,
      smsSent,
      smsError
    };
  } catch (err) {
    console.error('[Copilot] Error in cancelAppointment:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fallback Parser: Regex-based natural language execution
 */
async function processCommandFallback(message, salonId, clientDate) {
  const text = message.toLowerCase();
  const baseDate = clientDate ? dayjs(clientDate) : dayjs();
  const todayStr = baseDate.format('YYYY-MM-DD');
  const tomorrowStr = baseDate.add(1, 'day').format('YYYY-MM-DD');

  // 1. Cancel appointment
  if (text.includes('cancel') || text.includes('delete') || text.includes('remove')) {
    const todayApps = await queryAppointments({ startDate: todayStr, endDate: todayStr, salonId });
    const tomorrowApps = await queryAppointments({ startDate: tomorrowStr, endDate: tomorrowStr, salonId });
    const allApps = [...todayApps, ...tomorrowApps];

    let targetApp = null;

    for (const app of allApps) {
      if (app.status === 'cancelled') continue;
      const nameParts = app.clientName.toLowerCase().split(' ');
      const isNameMentioned = nameParts.some(part => part && part.length > 2 && text.includes(part));
      
      let isTimeMatch = false;
      const appTime = app.time.toLowerCase();
      
      if (text.includes('1 pm') || text.includes('1pm') || text.includes('1:00') || text.includes('13:00')) {
        if (appTime.includes('13:00') || appTime.startsWith('13:') || appTime.startsWith('01:') || appTime.includes('1:00')) isTimeMatch = true;
      } else if (text.includes('2 pm') || text.includes('2pm') || text.includes('2:00') || text.includes('14:00')) {
        if (appTime.includes('14:00') || appTime.startsWith('14:') || appTime.startsWith('02:') || appTime.includes('2:00')) isTimeMatch = true;
      } else if (text.includes('3 pm') || text.includes('3pm') || text.includes('3:00') || text.includes('15:00')) {
        if (appTime.includes('15:00') || appTime.startsWith('15:') || appTime.startsWith('03:') || appTime.includes('3:00')) isTimeMatch = true;
      } else if (text.includes('4 pm') || text.includes('4pm') || text.includes('4:00') || text.includes('16:00')) {
        if (appTime.includes('16:00') || appTime.startsWith('16:') || appTime.startsWith('04:') || appTime.includes('4:00')) isTimeMatch = true;
      } else if (text.includes('5 pm') || text.includes('5pm') || text.includes('5:00') || text.includes('17:00')) {
        if (appTime.includes('17:00') || appTime.startsWith('17:') || appTime.startsWith('05:') || appTime.includes('5:00')) isTimeMatch = true;
      } else if (text.includes('12 pm') || text.includes('12pm') || text.includes('12:00')) {
        if (appTime.includes('12:00') || appTime.startsWith('12:')) isTimeMatch = true;
      } else if (text.includes('11 am') || text.includes('11am') || text.includes('11:00')) {
        if (appTime.includes('11:00') || appTime.startsWith('11:')) isTimeMatch = true;
      } else if (text.includes('10 am') || text.includes('10am') || text.includes('10:00')) {
        if (appTime.includes('10:00') || appTime.startsWith('10:')) isTimeMatch = true;
      } else if (text.includes('9 am') || text.includes('9am') || text.includes('9:00')) {
        if (appTime.includes('09:00') || appTime.startsWith('09:') || appTime.startsWith('9:')) isTimeMatch = true;
      }

      if (isNameMentioned && isTimeMatch) {
        targetApp = app;
        break;
      }
    }

    if (!targetApp) {
      for (const app of allApps) {
        if (app.status === 'cancelled') continue;
        const nameParts = app.clientName.toLowerCase().split(' ');
        const isNameMentioned = nameParts.some(part => part && part.length > 2 && text.includes(part));
        if (isNameMentioned) {
          targetApp = app;
          break;
        }
      }
    }

    if (!targetApp) {
      for (const app of allApps) {
        if (app.status === 'cancelled') continue;
        let isTimeMatch = false;
        const appTime = app.time.toLowerCase();
        if (text.includes('1 pm') || text.includes('1pm') || text.includes('1:00') || text.includes('13:00')) {
          if (appTime.includes('13:00') || appTime.startsWith('13:') || appTime.startsWith('01:') || appTime.includes('1:00')) isTimeMatch = true;
        }
        if (isTimeMatch) {
          targetApp = app;
          break;
        }
      }
    }

    if (targetApp) {
      const cancelRes = await cancelAppointment({ appointmentId: targetApp.id.toString() });
      if (cancelRes.success) {
        return {
          response: `I found an appointment for ${targetApp.clientName} on ${targetApp.date} at ${targetApp.time} and have successfully cancelled it. A cancellation text has been sent to the client.`,
          actions: [{ type: 'cancel_appointment', appointmentId: targetApp.id.toString(), clientName: targetApp.clientName, smsSent: cancelRes.smsSent }]
        };
      } else {
        return {
          response: `I found the appointment for ${targetApp.clientName} on ${targetApp.date} at ${targetApp.time}, but failed to cancel it: ${cancelRes.error}`,
          actions: []
        };
      }
    }

    return {
      response: `I could not find a matching active appointment to cancel. Please specify the client's name or the time of the appointment.`,
      actions: []
    };
  }

  // 2. Send reminders to tomorrow's appointments
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

  // 7. Barber retention / return rate
  if (text.includes('retention') || text.includes('return rate') || text.includes('repeat client')) {
    const performance = await calculateBarberPerformance(salonId);
    if (!performance.length) {
      return { response: `I could not find any barber performance or client data to calculate retention rates.`, actions: [] };
    }
    const listText = performance.map(p => `- **${p.name}** (${p.title}): **${p.returnRate}%** return rate (${p.repeatClientsCount} repeat clients out of ${p.uniqueClientsCount} unique clients)`).join('\n');
    return {
      response: `Here is the current barber retention rate (return rate) leaderboard:\n\n${listText}\n\n**${performance[0]?.name}** has the highest retention rate!`,
      actions: []
    };
  }

  // 8. Which barber is booked the most / popular barber
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



  // 10. General Info Fallback
  return {
    response: `I am your Elegance Copilot. I can search database records and schedule events. Here are some examples of what you can ask me to do:\n\n` +
      `- "How many appointments do we have tomorrow?"\n` +
      `- "Which barber has the highest retention rate?"\n` +
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
async function processCommand(message, salonId, clientDate, history) {
  const activeOpenai = getOpenAIClient();
  if (!activeOpenai) {
    console.log('[Copilot] Running in mock parser mode (No OpenAI Key)');
    return processCommandFallback(message, salonId, clientDate);
  }

  try {
    const baseDate = clientDate ? dayjs(clientDate) : dayjs();
    const messages = [
      {
        role: 'system',
        content: `You are Elegance Copilot, an AI operations manager for Elegance Hair Salon & Barbershop.
You sit directly on top of the salon's database and have permissions to query appointments, barbers, clients, and services, and to trigger Twilio SMS notifications.
Today is ${baseDate.format('MMMM D, YYYY')}. Tomorrow is ${baseDate.add(1, 'day').format('MMMM D, YYYY')}.

Response formatting rules — follow these exactly:
- Never use emojis.
- Wrap key numbers and names in **double asterisks** (e.g. **Marcus**, **$450.00**, **3 appointments**).
- For lists, start each item on its own line with "- " (dash + space).
- Separate distinct sections or thoughts with a blank line.
- Keep responses concise — under 120 words unless listing many items.
- Never use headers (###), blockquotes (>), or code blocks.
- Prices are already in dollars — do not divide.

Behavior rules:
1. Always query the database before answering factual questions. Never fabricate data.
2. When sending SMS, resolve the client or appointment list first, then call the action tool. Confirm exactly how many messages were sent.
3. Be direct and professional. Skip preamble like "Sure!" or "Great question!".`
      }
    ];

    // Append history messages
    if (Array.isArray(history)) {
      history.forEach(chat => {
        if (chat.sender === 'user') {
          messages.push({ role: 'user', content: chat.text });
        } else if (chat.sender === 'bot') {
          messages.push({ role: 'assistant', content: chat.text });
        }
      });
    }

    // Append current user message
    messages.push({ role: 'user', content: message });

    const tools = [
      {
        type: 'function',
        function: {
          name: 'query_appointments',
          description: 'Fetch appointments within a date range and optionally filter by barber, client ID, or search client name/phone.',
          parameters: {
            type: 'object',
            properties: {
              startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
              endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
              barberId: { type: 'string', description: 'Filter by barber MongoDB ObjectId (optional)' },
              clientId: { type: 'string', description: 'Filter by client MongoDB ObjectId (optional)' },
              searchQuery: { type: 'string', description: 'Search term for client name or phone (optional)' }
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
          name: 'query_barber_performance',
          description: 'Fetch barber performance metrics including unique clients count, repeat clients count, and return rate retention percentage.',
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
      },
      {
        type: 'function',
        function: {
          name: 'cancel_appointment',
          description: 'Cancel a scheduled appointment and send a cancellation SMS to the client.',
          parameters: {
            type: 'object',
            properties: {
              appointmentId: { type: 'string', description: 'The MongoDB ObjectId of the appointment to cancel.' }
            },
            required: ['appointmentId']
          }
        }
      }
    ];

    const executedActions = [];
    let loopCount = 0;
    const maxLoops = 5;

    while (loopCount < maxLoops) {
      const response = await activeOpenai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto'
      });

      const responseMessage = response.choices[0].message;
      console.log('[Copilot DEBUG] Assistant Message:', JSON.stringify(responseMessage, null, 2));
      messages.push(responseMessage);

      const toolCalls = responseMessage.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return {
          response: responseMessage.content,
          actions: executedActions
        };
      }

      console.log('[Copilot DEBUG] Tool Calls:', JSON.stringify(toolCalls, null, 2));

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        let result = null;

        if (functionName === 'query_appointments') {
          result = await queryAppointments({ ...functionArgs, salonId });
        } else if (functionName === 'query_barbers') {
          result = await queryBarbers({ salonId });
        } else if (functionName === 'query_barber_performance') {
          result = await calculateBarberPerformance(salonId);
        } else if (functionName === 'query_clients') {
          result = await queryClients({ ...functionArgs, salonId });
        } else if (functionName === 'query_inactive_clients') {
          result = await queryInactiveClients({ ...functionArgs, salonId });
        } else if (functionName === 'send_reminder_sms') {
          const salonObj = await Salon.findById(salonId);
          if (!salonObj || !salonObj.settings || !salonObj.settings.aiActionPermissions) {
            result = { success: false, error: 'Permission Denied: AI Copilot is not allowed to execute automated SMS campaigns directly. Please enable this permission in settings.' };
          } else {
            result = await sendReminderSMS(functionArgs);
            executedActions.push({ type: 'send_reminder_sms', count: result.count, details: result.details });
          }
        } else if (functionName === 'send_bulk_promo_sms') {
          const salonObj = await Salon.findById(salonId);
          if (!salonObj || !salonObj.settings || !salonObj.settings.aiActionPermissions) {
            result = { success: false, error: 'Permission Denied: AI Copilot is not allowed to execute automated SMS campaigns directly. Please enable this permission in settings.' };
          } else {
            result = await sendBulkPromoSMS(functionArgs);
            executedActions.push({ type: 'send_bulk_promo_sms', count: result.count, details: result.details });
          }
        } else if (functionName === 'cancel_appointment') {
          result = await cancelAppointment(functionArgs);
          executedActions.push({
            type: 'cancel_appointment',
            appointmentId: result.appointmentId,
            clientName: result.clientName,
            smsSent: result.smsSent,
            smsError: result.smsError
          });
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: functionName,
          content: JSON.stringify(result)
        });
      }

      loopCount++;
    }

    const finalText = messages[messages.length - 1]?.content || 'Action executed successfully.';
    return {
      response: finalText,
      actions: executedActions
    };
  } catch (error) {
    console.error('[Copilot OpenAI Error]', error.stack || error);
    // Fall back to regex parser in case of API failure or invalid key
    return processCommandFallback(message, salonId, clientDate);
  }
}

module.exports = {
  processCommand
};
