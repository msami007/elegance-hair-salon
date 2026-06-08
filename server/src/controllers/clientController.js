const Client = require('../models/Client');

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

    // Normalize phone: strip non-digits, ensure +1 prefix
    let normalized = phone.replace(/[^0-9+]/g, '');
    if (!normalized.startsWith('+')) {
      if (normalized.startsWith('1') && normalized.length === 11) {
        normalized = '+' + normalized;
      } else if (normalized.length === 10) {
        normalized = '+1' + normalized;
      }
    }

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
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Client not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
