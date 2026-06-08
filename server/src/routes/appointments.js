const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/appointmentController');

router.get('/', ctrl.getAppointments);
router.get('/availability', ctrl.getAvailability);
router.post('/match-barbers', ctrl.matchBarbersForBooking);
router.get('/:id', ctrl.getAppointment);
router.post('/', ctrl.createAppointment);
router.patch('/:id', ctrl.updateAppointment);

module.exports = router;
