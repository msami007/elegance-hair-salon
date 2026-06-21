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
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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

// POST /api/clients/merge
exports.mergeClients = async (req, res) => {
  try {
    const { sourceId, targetId, salonId } = req.body;
    if (!sourceId || !targetId) {
      return res.status(400).json({ error: 'Source ID and Target ID are required' });
    }
    if (sourceId === targetId) {
      return res.status(400).json({ error: 'Source and Target clients cannot be the same' });
    }
    const sourceClient = await Client.findById(sourceId);
    const targetClient = await Client.findById(targetId);
    if (!sourceClient || !targetClient) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // 1. Update all appointments for source client to target client
    const Appointment = require('../models/Appointment');
    await Appointment.updateMany({ clientId: sourceId }, { clientId: targetId });

    // 2. Merge stats
    targetClient.visitCount = (targetClient.visitCount || 0) + (sourceClient.visitCount || 0);
    targetClient.noShowCount = (targetClient.noShowCount || 0) + (sourceClient.noShowCount || 0);
    targetClient.totalRevenue = (targetClient.totalRevenue || 0) + (sourceClient.totalRevenue || 0);
    
    if (sourceClient.notes) {
      targetClient.notes = (targetClient.notes ? targetClient.notes + '\n\n' : '') + 
        `[Merged from ${sourceClient.firstName} ${sourceClient.lastName} (${sourceClient.phone})]:\n${sourceClient.notes}`;
    }
    if (sourceClient.hairType && !targetClient.hairType) {
      targetClient.hairType = sourceClient.hairType;
    }
    
    // Merge tags
    if (sourceClient.tags && sourceClient.tags.length > 0) {
      targetClient.tags = Array.from(new Set([...(targetClient.tags || []), ...sourceClient.tags]));
    }

    // Merge first/last visit dates
    if (sourceClient.firstVisit) {
      if (!targetClient.firstVisit || sourceClient.firstVisit < targetClient.firstVisit) {
        targetClient.firstVisit = sourceClient.firstVisit;
      }
    }
    if (sourceClient.lastVisit) {
      if (!targetClient.lastVisit || sourceClient.lastVisit > targetClient.lastVisit) {
        targetClient.lastVisit = sourceClient.lastVisit;
      }
    }
    
    if (sourceClient.isTrusted && !targetClient.isTrusted) {
      targetClient.isTrusted = true;
    }

    await targetClient.save();

    // 3. Delete source client
    await Client.findByIdAndDelete(sourceId);

    res.json({ success: true, message: 'Clients merged successfully', targetClient });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/clients/bulk-import
exports.bulkImportClients = async (req, res) => {
  try {
    const { clients, salonId, dedupeStrategy } = req.body; // strategy: 'skip' | 'overwrite' | 'merge'
    if (!clients || !Array.isArray(clients)) {
      return res.status(400).json({ error: 'Clients array is required' });
    }
    if (!salonId) {
      return res.status(400).json({ error: 'Salon ID is required' });
    }

    let importedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    let mergedCount = 0;

    for (const rawClient of clients) {
      if (!rawClient.firstName || !rawClient.phone) {
        skippedCount++;
        continue;
      }

      const normalizedPhone = normalizePhone(rawClient.phone);
      
      // Validate phone format E.164
      const e164Regex = /^\+[1-9]\d{7,14}$/;
      if (!e164Regex.test(normalizedPhone)) {
        skippedCount++;
        continue;
      }
      if (normalizedPhone.startsWith('+1')) {
        if (normalizedPhone.length !== 12) {
          skippedCount++;
          continue;
        }
        const areaFirst = normalizedPhone.charAt(2);
        if (areaFirst === '0' || areaFirst === '1') {
          skippedCount++;
          continue;
        }
      }

      // Check if client already exists with this phone at this salon
      const existing = await Client.findOne({ salonId, phone: normalizedPhone });

      if (existing) {
        if (dedupeStrategy === 'skip') {
          skippedCount++;
          continue;
        } else if (dedupeStrategy === 'overwrite') {
          existing.firstName = rawClient.firstName;
          if (rawClient.lastName) existing.lastName = rawClient.lastName;
          if (rawClient.email) existing.email = rawClient.email;
          if (rawClient.notes) existing.notes = rawClient.notes;
          if (rawClient.hairType) existing.hairType = rawClient.hairType;
          if (rawClient.booksyId) existing.booksyId = rawClient.booksyId;
          if (rawClient.visitCount) existing.visitCount = Number(rawClient.visitCount);
          if (rawClient.totalRevenue) existing.totalRevenue = Number(rawClient.totalRevenue);
          if (rawClient.noShowCount) existing.noShowCount = Number(rawClient.noShowCount);
          if (rawClient.firstVisit) existing.firstVisit = new Date(rawClient.firstVisit);
          if (rawClient.lastVisit) existing.lastVisit = new Date(rawClient.lastVisit);
          if (rawClient.isTrusted !== undefined) existing.isTrusted = !!rawClient.isTrusted;
          
          await existing.save();
          updatedCount++;
        } else if (dedupeStrategy === 'merge') {
          existing.visitCount = (existing.visitCount || 0) + (Number(rawClient.visitCount) || 0);
          existing.totalRevenue = (existing.totalRevenue || 0) + (Number(rawClient.totalRevenue) || 0);
          existing.noShowCount = (existing.noShowCount || 0) + (Number(rawClient.noShowCount) || 0);
          
          if (rawClient.notes) {
            existing.notes = (existing.notes ? existing.notes + '\n\n' : '') + `[Imported note]: ${rawClient.notes}`;
          }
          if (rawClient.hairType && !existing.hairType) {
            existing.hairType = rawClient.hairType;
          }
          if (rawClient.firstVisit) {
            const rawFirstDate = new Date(rawClient.firstVisit);
            if (!existing.firstVisit || rawFirstDate < existing.firstVisit) {
              existing.firstVisit = rawFirstDate;
            }
          }
          if (rawClient.lastVisit) {
            const rawLastDate = new Date(rawClient.lastVisit);
            if (!existing.lastVisit || rawLastDate > existing.lastVisit) {
              existing.lastVisit = rawLastDate;
            }
          }
          if (rawClient.isTrusted) {
            existing.isTrusted = true;
          }
          
          await existing.save();
          mergedCount++;
        }
      } else {
        const newClient = new Client({
          salonId,
          firstName: rawClient.firstName,
          lastName: rawClient.lastName || '',
          phone: normalizedPhone,
          email: rawClient.email || '',
          notes: rawClient.notes || '',
          hairType: rawClient.hairType || '',
          isTrusted: !!rawClient.isTrusted,
          visitCount: Number(rawClient.visitCount) || 0,
          noShowCount: Number(rawClient.noShowCount) || 0,
          totalRevenue: Number(rawClient.totalRevenue) || 0,
          booksyId: rawClient.booksyId || '',
          firstVisit: rawClient.firstVisit ? new Date(rawClient.firstVisit) : undefined,
          lastVisit: rawClient.lastVisit ? new Date(rawClient.lastVisit) : undefined,
          source: 'booksy-import',
        });
        
        await newClient.save();
        importedCount++;
      }
    }

    res.json({
      success: true,
      summary: {
        imported: importedCount,
        skipped: skippedCount,
        updated: updatedCount,
        merged: mergedCount,
        totalProcessed: clients.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
