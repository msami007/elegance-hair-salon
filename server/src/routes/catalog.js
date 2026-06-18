const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/catalogController');

router.get('/services', ctrl.getServices);
router.post('/services', ctrl.createService);
router.patch('/services/:id', ctrl.updateService);
router.delete('/services/:id', ctrl.deleteService);

router.get('/barbers', ctrl.getBarbers);
router.post('/barbers', ctrl.createBarber);
router.patch('/barbers/:id', ctrl.updateBarber);
router.delete('/barbers/:id', ctrl.deleteBarber);

router.get('/locations', ctrl.getLocations);
router.get('/salon/:slug', ctrl.getSalonBySlug);
router.patch('/salon/:id/settings', ctrl.updateSalonSettings);

module.exports = router;
