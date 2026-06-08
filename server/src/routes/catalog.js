const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/catalogController');

router.get('/services', ctrl.getServices);
router.get('/barbers', ctrl.getBarbers);
router.get('/locations', ctrl.getLocations);
router.get('/salon/:slug', ctrl.getSalonBySlug);

module.exports = router;
