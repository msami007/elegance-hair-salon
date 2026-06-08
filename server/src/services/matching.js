const Barber = require('../models/Barber');
const Appointment = require('../models/Appointment');

/**
 * Match barbers to a client's selected haircut style and service.
 * Returns ranked recommendations based on specialism overlap and workload.
 *
 * @param {Object} params
 * @param {string} params.locationId - The location to search barbers in
 * @param {string} params.haircutStyle - The style tag selected by the client
 * @param {string} params.serviceCategory - The service category
 * @param {string} params.date - The requested date (YYYY-MM-DD)
 * @returns {Array} Ranked barber recommendations with match reasons
 */
async function matchBarbers({ locationId, haircutStyle, serviceCategory, date }) {
  // 1. Fetch all active barbers at this location
  const barbers = await Barber.find({ locationId, isActive: true }).lean();

  if (!barbers.length) return [];

  // 2. Get appointment counts per barber for load balancing
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

  // 3. Score each barber
  const scored = barbers.map((barber) => {
    let score = 0;
    const reasons = [];

    // Specialism match (primary signal)
    if (haircutStyle && barber.specialisms.includes(haircutStyle)) {
      score += 10;
      reasons.push(`Specializes in ${haircutStyle.replace(/-/g, ' ')}`);
    }

    // Partial specialism match (secondary signal)
    if (haircutStyle) {
      const styleWords = haircutStyle.split('-');
      barber.specialisms.forEach((spec) => {
        const specWords = spec.split('-');
        const overlap = styleWords.filter((w) => specWords.includes(w));
        if (overlap.length > 0 && spec !== haircutStyle) {
          score += 3;
          reasons.push(`Experience with ${spec.replace(/-/g, ' ')}`);
        }
      });
    }

    // Category alignment
    const categoryToSpecialisms = {
      'mens-services': ['fade', 'skin-fade', 'beard', 'classic', 'textured', 'buzz'],
      'womens-services': ['color', 'blowout', 'styling', 'extensions', 'curly'],
      'color': ['color', 'highlights', 'balayage', 'ombre'],
      'mens-color': ['color', 'gray-blending'],
    };

    const catSpecs = categoryToSpecialisms[serviceCategory] || [];
    const catOverlap = barber.specialisms.filter((s) => catSpecs.includes(s));
    if (catOverlap.length > 0) {
      score += 5;
      if (reasons.length === 0) {
        reasons.push(`Strong in ${serviceCategory.replace(/-/g, ' ')}`);
      }
    }

    // Load balancing (fewer appointments = higher score)
    const apptCount = countMap[barber._id.toString()] || 0;
    const loadScore = Math.max(0, 5 - apptCount);
    score += loadScore;
    if (apptCount === 0) {
      reasons.push('Available all day');
    }

    return {
      barber,
      score,
      reasons: reasons.slice(0, 3), // top 3 reasons
      appointmentCount: apptCount,
    };
  });

  // 4. Sort by score descending, return top results
  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => ({
    _id: s.barber._id,
    name: s.barber.name,
    title: s.barber.title,
    photo: s.barber.photo,
    specialisms: s.barber.specialisms,
    matchScore: s.score,
    matchReasons: s.reasons,
    appointmentCount: s.appointmentCount,
  }));
}

module.exports = { matchBarbers };
