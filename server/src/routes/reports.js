const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');

// GET /api/reports/barber-performance
router.get('/barber-performance', reportsController.getBarberPerformance);

module.exports = router;
