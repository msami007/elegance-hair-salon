const Cadence = require('../models/Cadence');
const CadenceEnrollment = require('../models/CadenceEnrollment');

// GET /api/cadences?salonId=
exports.getCadences = async (req, res) => {
  try {
    const { salonId } = req.query;
    if (!salonId) return res.status(400).json({ error: 'salonId required' });

    const cadences = await Cadence.find({ salonId }).sort({ createdAt: -1 }).lean();

    // Attach enrollment stats to each cadence
    const enriched = await Promise.all(cadences.map(async (cadence) => {
      const totalEnrollments = await CadenceEnrollment.countDocuments({ cadenceId: cadence._id });
      const activeEnrollments = await CadenceEnrollment.countDocuments({ cadenceId: cadence._id, status: 'active' });
      const completedEnrollments = await CadenceEnrollment.countDocuments({ cadenceId: cadence._id, status: 'completed' });

      // Count total messages sent across all enrollments
      const sentAgg = await CadenceEnrollment.aggregate([
        { $match: { cadenceId: cadence._id } },
        { $unwind: '$stepExecutions' },
        { $match: { 'stepExecutions.status': 'sent' } },
        { $count: 'totalSent' },
      ]);
      const totalMessagesSent = sentAgg.length > 0 ? sentAgg[0].totalSent : 0;

      return {
        ...cadence,
        stats: { totalEnrollments, activeEnrollments, completedEnrollments, totalMessagesSent },
      };
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/cadences
exports.createCadence = async (req, res) => {
  try {
    const { salonId, name, type, steps } = req.body;
    if (!salonId || !name) return res.status(400).json({ error: 'salonId and name required' });

    const cadence = await Cadence.create({
      salonId,
      name,
      type: type || 'pre-appointment',
      isActive: true,
      steps: steps || [],
    });

    res.status(201).json(cadence);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/cadences/:id
exports.updateCadence = async (req, res) => {
  try {
    const { name, isActive, steps, type } = req.body;
    const update = {};

    if (name !== undefined) update.name = name;
    if (isActive !== undefined) update.isActive = isActive;
    if (type !== undefined) update.type = type;
    if (steps !== undefined) update.steps = steps;

    const cadence = await Cadence.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!cadence) return res.status(404).json({ error: 'Cadence not found' });

    res.json(cadence);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/cadences/:id
exports.deleteCadence = async (req, res) => {
  try {
    const cadence = await Cadence.findByIdAndDelete(req.params.id);
    if (!cadence) return res.status(404).json({ error: 'Cadence not found' });

    // Also clean up enrollments
    await CadenceEnrollment.deleteMany({ cadenceId: cadence._id });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/cadences/:id/enrollments
exports.getEnrollments = async (req, res) => {
  try {
    const enrollments = await CadenceEnrollment.find({ cadenceId: req.params.id })
      .populate('appointmentId', 'date startTime endTime status')
      .populate('clientId', 'firstName lastName phone')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
