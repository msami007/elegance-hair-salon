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

// POST /api/barbers
exports.createBarber = async (req, res) => {
  try {
    const barber = await Barber.create(req.body);
    res.status(201).json(barber);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/barbers/:id
exports.updateBarber = async (req, res) => {
  try {
    const updated = await Barber.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Barber not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/barbers/:id
exports.deleteBarber = async (req, res) => {
  try {
    const barber = await Barber.findById(req.params.id);
    if (!barber) return res.status(404).json({ error: 'Barber not found' });
    barber.isActive = false; // soft delete
    await barber.save();
    res.json({ success: true, message: 'Barber marked inactive' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/services
exports.createService = async (req, res) => {
  try {
    const service = await Service.create(req.body);
    res.status(201).json(service);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/services/:id
exports.updateService = async (req, res) => {
  try {
    const updated = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Service not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/services/:id
exports.deleteService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    service.isActive = false; // soft delete
    await service.save();
    res.json({ success: true, message: 'Service marked inactive' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/salon/:id/settings
exports.updateSalonSettings = async (req, res) => {
  try {
    const salon = await Salon.findById(req.params.id);
    if (!salon) return res.status(404).json({ error: 'Salon not found' });
    
    salon.settings = {
      ...salon.settings,
      ...req.body
    };
    await salon.save();
    res.json(salon);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
