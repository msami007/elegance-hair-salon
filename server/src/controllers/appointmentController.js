const Appointment = require('../models/Appointment');
const Barber = require('../models/Barber');
const Client = require('../models/Client');
const Service = require('../models/Service');
const { sendBookingConfirmation, normalizePhone } = require('../services/twilio');
const { matchBarbers } = require('../services/matching');
const dayjs = require('dayjs');

// GET /api/appointments?locationId=&date=&barberId=&weekStart=
exports.getAppointments = async (req, res) => {
  try {
    const { locationId, date, barberId, weekStart } = req.query;
    const filter = {};

    if (locationId) filter.locationId = locationId;
    if (barberId) filter.barberId = barberId;

    if (weekStart) {
      // Get full week
      const start = dayjs(weekStart);
      const end = start.add(6, 'day');
      filter.date = {
        $gte: start.format('YYYY-MM-DD'),
        $lte: end.format('YYYY-MM-DD'),
      };
    } else if (date) {
      filter.date = date;
    }

    filter.status = { $ne: 'cancelled' };

    const appointments = await Appointment.find(filter)
      .populate('clientId', 'firstName lastName phone email')
      .populate('barberId', 'name title photo')
      .populate('serviceId', 'name category price duration')
      .populate('locationId', 'name address')
      .sort({ date: 1, startTime: 1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/appointments/:id
exports.getAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('clientId')
      .populate('barberId')
      .populate('serviceId')
      .populate('locationId');

    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/appointments
exports.createAppointment = async (req, res) => {
  try {
    const {
      salonId, locationId, barberId, serviceId,
      date, startTime, haircutStyle, referencePhoto,
      notes, source,
      // Client info (for creating/finding client)
      clientId, firstName, lastName, phone, email, isNewClient,
    } = req.body;

    // 1. Find or create client
    let client;
    if (clientId) {
      client = await Client.findById(clientId);
    } else if (phone) {
      const normalizedPhone = normalizePhone(phone);
      client = await Client.findOne({ salonId, phone: normalizedPhone });
      if (!client) {
        client = await Client.create({
          salonId,
          firstName: firstName || '',
          lastName: lastName || '',
          phone: normalizedPhone,
          email: email || '',
          source: source === 'online' ? 'booking-form' : source || 'booking-form',
        });
      } else {
        // Update name/email if provided
        if (firstName) client.firstName = firstName;
        if (lastName) client.lastName = lastName;
        if (email) client.email = email;
        await client.save();
      }
    } else {
      return res.status(400).json({ error: 'Client ID or phone number required' });
    }

    // 2. Get service duration to calculate end time
    const service = await Service.findById(serviceId);
    if (!service) return res.status(400).json({ error: 'Service not found' });

    const startMoment = dayjs(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm');
    const endMoment = startMoment.add(service.duration, 'minute');
    const endTime = endMoment.format('HH:mm');

    // 3. Check for conflicts
    const conflicts = await Appointment.find({
      barberId,
      date,
      status: { $in: ['confirmed', 'need-confirm'] },
      $or: [
        { startTime: { $lt: endTime }, endTime: { $gt: startTime } },
      ],
    });

    if (conflicts.length > 0) {
      return res.status(409).json({ error: 'Time slot conflict — barber already booked' });
    }

    // 4. Create appointment
    const appointment = await Appointment.create({
      salonId,
      locationId,
      clientId: client._id,
      barberId,
      serviceId,
      date,
      startTime,
      endTime,
      status: 'confirmed',
      source: source || 'online',
      haircutStyle: haircutStyle || '',
      referencePhoto: referencePhoto || '',
      notes: notes || '',
      totalPrice: service.price,
    });

    // 5. Update client visit count
    client.visitCount += 1;
    client.lastVisit = new Date();
    if (!client.firstVisit) client.firstVisit = new Date();
    await client.save();

    // 6. Send SMS confirmation
    const barber = await Barber.findById(barberId);
    const Location = require('../models/Location');
    const location = await Location.findById(locationId);

    const smsResult = await sendBookingConfirmation({
      to: client.phone,
      clientName: client.firstName,
      serviceName: service.name,
      barberName: barber?.name || 'Your stylist',
      date: dayjs(date).format('ddd, MMM D'),
      time: dayjs(`${date} ${startTime}`).format('h:mm A'),
      locationName: location?.name || 'Elegance Hair Salon',
    });

    if (smsResult.success) {
      appointment.smsConfirmationSent = true;
      appointment.smsConfirmationSid = smsResult.messageSid;
      await appointment.save();
    }

    // 7. Return populated appointment
    const populated = await Appointment.findById(appointment._id)
      .populate('clientId', 'firstName lastName phone email')
      .populate('barberId', 'name title photo')
      .populate('serviceId', 'name category price duration')
      .populate('locationId', 'name address');

    res.status(201).json({
      appointment: populated,
      sms: smsResult,
      client: { _id: client._id, firstName: client.firstName, lastName: client.lastName },
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/appointments/:id
exports.updateAppointment = async (req, res) => {
  try {
    const { status, notes, barberId, startTime, date } = req.body;
    const update = {};

    if (status) update.status = status;
    if (notes !== undefined) update.notes = notes;
    if (barberId) update.barberId = barberId;
    if (startTime) update.startTime = startTime;
    if (date) update.date = date;

    // Recalculate endTime if startTime or date changed
    if (startTime) {
      const appointment = await Appointment.findById(req.params.id).populate('serviceId');
      if (appointment) {
        const d = date || appointment.date;
        const end = dayjs(`${d} ${startTime}`, 'YYYY-MM-DD HH:mm')
          .add(appointment.serviceId.duration, 'minute');
        update.endTime = end.format('HH:mm');
      }
    }

    const updated = await Appointment.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('clientId', 'firstName lastName phone email')
      .populate('barberId', 'name title photo')
      .populate('serviceId', 'name category price duration')
      .populate('locationId', 'name address');

    if (!updated) return res.status(404).json({ error: 'Appointment not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/appointments/availability?locationId=&barberId=&date=&serviceId=
exports.getAvailability = async (req, res) => {
  try {
    const { locationId, barberId, date, serviceId } = req.query;

    if (!date) return res.status(400).json({ error: 'Date is required' });

    const service = serviceId ? await Service.findById(serviceId) : null;
    const duration = service ? service.duration : 30; // default 30 min

    // Get barbers for this location (or specific barber)
    const barberFilter = { locationId, isActive: true };
    if (barberId) barberFilter._id = barberId;
    const barbers = await Barber.find(barberFilter).lean();

    const dayOfWeek = dayjs(date).format('ddd').toLowerCase();

    const availability = {};

    for (const barber of barbers) {
      const hours = barber.workingHours?.[dayOfWeek];
      if (!hours || !hours.start || !hours.end) continue;

      // Get existing appointments for this barber on this date
      const existing = await Appointment.find({
        barberId: barber._id,
        date,
        status: { $in: ['confirmed', 'need-confirm'] },
      }).sort({ startTime: 1 }).lean();

      // Generate all possible slots
      const slots = [];
      let slotStart = dayjs(`${date} ${hours.start}`, 'YYYY-MM-DD HH:mm');
      const dayEnd = dayjs(`${date} ${hours.end}`, 'YYYY-MM-DD HH:mm');

      while (slotStart.add(duration, 'minute').isBefore(dayEnd) || slotStart.add(duration, 'minute').isSame(dayEnd)) {
        const slotEnd = slotStart.add(duration, 'minute');
        const startStr = slotStart.format('HH:mm');
        const endStr = slotEnd.format('HH:mm');

        // Check if this slot conflicts with any existing appointment
        const isConflict = existing.some((appt) => {
          return startStr < appt.endTime && endStr > appt.startTime;
        });

        // Don't show past time slots for today
        const now = dayjs();
        const isPast = dayjs(date).isSame(now, 'day') && slotStart.isBefore(now);

        slots.push({
          startTime: startStr,
          endTime: endStr,
          available: !isConflict && !isPast,
        });

        slotStart = slotStart.add(30, 'minute'); // 30-min intervals
      }

      availability[barber._id.toString()] = {
        barber: { _id: barber._id, name: barber.name, title: barber.title, photo: barber.photo },
        slots,
      };
    }

    res.json(availability);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/appointments/match-barbers
exports.matchBarbersForBooking = async (req, res) => {
  try {
    const { locationId, haircutStyle, serviceCategory, date } = req.body;

    const recommendations = await matchBarbers({
      locationId,
      haircutStyle,
      serviceCategory,
      date,
    });

    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
