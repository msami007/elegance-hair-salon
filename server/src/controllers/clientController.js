const Client = require('../models/Client');
const dayjs = require('dayjs');
const { normalizePhone } = require('../services/twilio');

// GET /api/clients?salonId=&search=
exports.getClients = async (req, res) => {
  try {
    const { salonId, search } = req.query;
    const filter = {};
    if (salonId) filter.salonId = salonId;

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const clients = await Client.find(filter)
      .populate('preferredBarberId', 'name')
      .sort({ lastName: 1, firstName: 1 })
      .limit(50);

    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/clients/lookup?phone=&salonId=
exports.lookupByPhone = async (req, res) => {
  try {
    const { phone, salonId } = req.query;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const normalized = normalizePhone(phone);
    const filter = { phone: normalized };
    if (salonId) filter.salonId = salonId;

    const client = await Client.findOne(filter)
      .populate('preferredBarberId', 'name photo');

    if (!client) {
      return res.json({ found: false, phone: normalized });
    }

    res.json({
      found: true,
      client: {
        _id: client._id,
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
        email: client.email,
        notes: client.notes,
        hairType: client.hairType,
        visitCount: client.visitCount,
        preferredBarber: client.preferredBarberId,
        lastVisit: client.lastVisit,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/clients
exports.createClient = async (req, res) => {
  try {
    if (req.body.phone) {
      req.body.phone = normalizePhone(req.body.phone);
    }
    const client = await Client.create(req.body);
    res.status(201).json(client);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A client with this phone number already exists' });
    }
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/clients/:id
exports.updateClient = async (req, res) => {
  try {
    if (req.body.phone) {
      req.body.phone = normalizePhone(req.body.phone);
    }
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Client not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/clients/retention?salonId=
exports.getRetentionData = async (req, res) => {
  try {
    const { salonId } = req.query;
    const filter = {};
    if (salonId) filter.salonId = salonId;

    const clients = await Client.find(filter)
      .populate('preferredBarberId', 'name title photo')
      .lean();

    const now = dayjs();
    let activeCount = 0;
    let slippingCount = 0;
    let dormantCount = 0;

    const list = clients.map(client => {
      let daysSinceLastVisit = 999;
      let status = 'dormant';

      if (client.lastVisit) {
        const diff = now.diff(dayjs(client.lastVisit), 'day');
        daysSinceLastVisit = diff;

        if (diff <= 30) {
          status = 'active';
          activeCount++;
        } else if (diff <= 60) {
          status = 'slipping';
          slippingCount++;
        } else {
          status = 'dormant';
          dormantCount++;
        }
      } else {
        dormantCount++;
      }

      let aiRecommendation = '';
      if (status === 'dormant') {
        aiRecommendation = `Send Promo Code: 15% Off with code FRESH15. Recommend booking with ${client.preferredBarberId?.name || 'their previous stylist'} to refresh their look.`;
      } else if (status === 'slipping') {
        aiRecommendation = `Send Quick Check-in: Ask if they are ready for a trim. Mention ${client.preferredBarberId?.name || 'their barber'} has openings this week.`;
      }

      return {
        ...client,
        daysSinceLastVisit,
        engagementStatus: status,
        aiRecommendation,
      };
    });

    const retentionClients = list
      .filter(c => c.engagementStatus !== 'active')
      .sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit);

    res.json({
      summary: {
        totalClients: clients.length,
        activeCount,
        slippingCount,
        dormantCount,
        retentionRate: clients.length > 0 ? Math.round((activeCount / clients.length) * 100) : 0,
      },
      clients: retentionClients,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/clients/retention/send-sms
exports.sendRetentionSMS = async (req, res) => {
  try {
    const { clientId, message } = req.body;
    if (!clientId || !message) {
      return res.status(400).json({ error: 'Client ID and message text are required' });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { sendSMS } = require('../services/twilio');
    const smsResult = await sendSMS({
      to: client.phone,
      body: message,
    });

    if (smsResult.success) {
      const timestamp = dayjs().format('YYYY-MM-DD HH:mm');
      client.notes = (client.notes ? client.notes + '\n' : '') + `[${timestamp}] Sent retention SMS: "${message}"`;
      if (!client.tags.includes('sms-reengaged')) {
        client.tags.push('sms-reengaged');
      }
      await client.save();
    }

    res.json({
      success: smsResult.success,
      messageSid: smsResult.messageSid,
      mock: smsResult.mock,
      error: smsResult.error,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
