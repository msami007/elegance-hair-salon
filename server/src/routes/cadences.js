const express = require('express');
const router = express.Router();
const cadenceController = require('../controllers/cadenceController');

router.get('/', cadenceController.getCadences);
router.post('/', cadenceController.createCadence);
router.patch('/:id', cadenceController.updateCadence);
router.delete('/:id', cadenceController.deleteCadence);
router.get('/:id/enrollments', cadenceController.getEnrollments);

module.exports = router;
