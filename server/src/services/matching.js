const Barber = require('../models/Barber');
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const dayjs = require('dayjs');

/**
 * Match barbers to a client's selected haircut style and service.
 * Returns ranked recommendations based on specialism overlap, availability, and workload.
 *
 * @param {Object} params
 * @param {string} params.locationId - The location to search barbers in
 * @param {string} params.haircutStyle - The style tag selected by the client
 * @param {string} params.serviceCategory - The service category
 * @param {string} params.date - The requested date (YYYY-MM-DD)
 * @param {string} [params.time] - The requested time (HH:mm)
 * @param {string} [params.serviceId] - The specific service ID
 * @returns {Array} Ranked barber recommendations with match reasons
 */
async function matchBarbers({ locationId, haircutStyle, serviceCategory, date, time, serviceId }) {
  // 1. Fetch all active barbers at this location
  const barbers = await Barber.find({ locationId, isActive: true }).lean();

  if (!barbers.length) return [];

  // 2. Fetch service duration if serviceId is provided
  let duration = 30; // default 30 min
  if (serviceId) {
    const service = await Service.findById(serviceId).lean();
    if (service) {
      duration = service.duration;
    }
  }

  // 3. Get appointment counts per barber for load balancing
  const appointmentCounts = await Appointment.aggregate([
    {
      $match: {
        locationId: barbers[0].locationId,
        date: date,
        status: { $in: ['confirmed', 'need-confirm'] },
      },
    },
    { $group: { _id: '$barberId', count: { $sum: 1 } } },
  ]);

  const countMap = {};
  appointmentCounts.forEach((a) => {
    countMap[a._id.toString()] = a.count;
  });

  // 4. Fetch all appointments on this date for availability overlap check
  let appointmentsOnDate = [];
  if (date && time) {
    appointmentsOnDate = await Appointment.find({
      locationId: barbers[0].locationId,
      date,
      status: { $in: ['confirmed', 'need-confirm'] },
    }).lean();
  }

  const dayOfWeek = date ? dayjs(date).format('ddd').toLowerCase() : null;

  // 5. Score each barber out of 100 points
  const scored = barbers.map((barber) => {
    let score = 0;
    const reasons = [];
    let isAvailable = true;

    // A. Slot Availability (30 points)
    if (date && time && dayOfWeek) {
      const hours = barber.workingHours?.[dayOfWeek];
      if (!hours || !hours.start || !hours.end) {
        isAvailable = false;
        reasons.push('Not scheduled to work today');
      } else {
        const slotStartStr = time;
        const slotStart = dayjs(`${date} ${time}`, 'YYYY-MM-DD HH:mm');
        const slotEnd = slotStart.add(duration, 'minute');
        const slotEndStr = slotEnd.format('HH:mm');

        const dayStart = dayjs(`${date} ${hours.start}`, 'YYYY-MM-DD HH:mm');
        const dayEnd = dayjs(`${date} ${hours.end}`, 'YYYY-MM-DD HH:mm');

        // Check if the booking fits within working hours
        const withinHours = (slotStart.isSame(dayStart) || slotStart.isAfter(dayStart)) &&
                            (slotEnd.isSame(dayEnd) || slotEnd.isBefore(dayEnd));

        if (!withinHours) {
          isAvailable = false;
          reasons.push('Outside working hours');
        } else {
          // Check for overlapping appointments
          const hasConflict = appointmentsOnDate.some((appt) => {
            return appt.barberId.toString() === barber._id.toString() &&
                   slotStartStr < appt.endTime && slotEndStr > appt.startTime;
          });

          if (hasConflict) {
            isAvailable = false;
            reasons.push(`Booked at ${dayjs(`${date} ${time}`).format('h:mm A')}`);
          } else {
            score += 30;
            reasons.push(`Available at ${dayjs(`${date} ${time}`).format('h:mm A')}`);
          }
        }
      }
    } else {
      // Default fallback if time is not supplied
      score += 30;
      reasons.push('Available on selected date');
    }

    // B. Specialism Match (40 points)
    if (haircutStyle && barber.specialisms.includes(haircutStyle)) {
      score += 40;
      reasons.push(`Specialist in ${haircutStyle.replace(/-/g, ' ')}`);
    } else if (haircutStyle) {
      // Partial specialism match (up to 15 points)
      const styleWords = haircutStyle.split('-');
      let bestOverlap = 0;
      barber.specialisms.forEach((spec) => {
        const specWords = spec.split('-');
        const overlap = styleWords.filter((w) => specWords.includes(w));
        if (overlap.length > bestOverlap) {
          bestOverlap = overlap.length;
        }
      });
      if (bestOverlap > 0) {
        score += 15;
        reasons.push('Experience with similar haircut styles');
      }
    }

    // C. Category Alignment (20 points)
    const categoryToSpecialisms = {
      'mens-services': ['fade', 'skin-fade', 'beard', 'classic', 'textured', 'buzz', 'lineup'],
      'womens-services': ['color', 'blowout', 'styling', 'extensions', 'curly', 'updo'],
      'color': ['color', 'highlights', 'balayage', 'ombre'],
      'mens-color': ['color', 'gray-blending'],
      'smoothing-perms': ['keratin', 'smoothing', 'perm'],
    };

    const catSpecs = categoryToSpecialisms[serviceCategory] || [];
    const catOverlap = barber.specialisms.filter((s) => catSpecs.includes(s));
    if (catOverlap.length > 0) {
      score += 20;
      if (!reasons.some(r => r.startsWith('Specialist') || r.startsWith('Experience'))) {
        reasons.push(`Strong background in ${serviceCategory.replace(/-/g, ' ')}`);
      }
    }

    // D. Load Balancing / Workload (10 points)
    const apptCount = countMap[barber._id.toString()] || 0;
    const loadScore = Math.max(0, 10 - apptCount * 2);
    score += loadScore;
    if (apptCount === 0 && isAvailable) {
      reasons.push('Wide availability today');
    }

    return {
      barber,
      score: Math.min(100, Math.round(score)),
      isAvailable,
      reasons,
      appointmentCount: apptCount,
    };
  });

  // 6. Sort by availability status (available first), then score descending
  scored.sort((a, b) => {
    if (a.isAvailable !== b.isAvailable) {
      return a.isAvailable ? -1 : 1;
    }
    return b.score - a.score;
  });

  // 7. Format output
  return scored.map((s) => ({
    _id: s.barber._id,
    name: s.barber.name,
    title: s.barber.title,
    photo: s.barber.photo,
    specialisms: s.barber.specialisms,
    matchScore: s.score,
    isAvailable: s.isAvailable,
    matchReasons: s.reasons.slice(0, 3), // top 3 reasons
    appointmentCount: s.appointmentCount,
  }));
}

module.exports = { matchBarbers };
