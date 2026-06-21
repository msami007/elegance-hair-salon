const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/clientController');

router.get('/', ctrl.getClients);
router.get('/lookup', ctrl.lookupByPhone);
router.get('/retention', ctrl.getRetentionData);
router.post('/retention/send-sms', ctrl.sendRetentionSMS);
router.post('/merge', ctrl.mergeClients);
router.post('/bulk-import', ctrl.bulkImportClients);
router.post('/', ctrl.createClient);
router.patch('/:id', ctrl.updateClient);

module.exports = router;
