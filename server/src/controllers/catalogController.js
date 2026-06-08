const Service = require('../models/Service');
const Barber = require('../models/Barber');
const Location = require('../models/Location');
const Salon = require('../models/Salon');

// GET /api/services?locationId=&category=
exports.getServices = async (req, res) => {
  try {
    const { locationId, category, salonId } = req.query;
    const filter = { isActive: true };
    if (locationId) filter.locationId = locationId;
    if (category) filter.category = category;
    if (salonId) filter.salonId = salonId;

    const services = await Service.find(filter).sort({ category: 1, sortOrder: 1, name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/barbers?locationId=
exports.getBarbers = async (req, res) => {
  try {
    const { locationId, salonId } = req.query;
    const filter = { isActive: true };
    if (locationId) filter.locationId = locationId;
    if (salonId) filter.salonId = salonId;

    const barbers = await Barber.find(filter).sort({ name: 1 });
    res.json(barbers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/locations?salonId=
exports.getLocations = async (req, res) => {
  try {
    const { salonId } = req.query;
    const filter = { isActive: true };
    if (salonId) filter.salonId = salonId;

    const locations = await Location.find(filter);
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/salon/:slug
exports.getSalonBySlug = async (req, res) => {
  try {
    const salon = await Salon.findOne({ slug: req.params.slug });
    if (!salon) return res.status(404).json({ error: 'Salon not found' });

    const locations = await Location.find({ salonId: salon._id, isActive: true });
    res.json({ salon, locations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
