const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/clientController');

router.get('/', ctrl.getClients);
router.get('/lookup', ctrl.lookupByPhone);
router.post('/', ctrl.createClient);
router.patch('/:id', ctrl.updateClient);

module.exports = router;
