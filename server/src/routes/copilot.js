const express = require('express');
const router = express.Router();
const Salon = require('../models/Salon');
const { processCommand } = require('../services/copilotService');

router.post('/chat', async (req, res) => {
  try {
    const { message, clientDate, history } = req.body;
    let { salonId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!salonId) {
      // Find the first salon as a default
      const defaultSalon = await Salon.findOne();
      if (defaultSalon) {
        salonId = defaultSalon._id.toString();
      } else {
        return res.status(400).json({ error: 'No salon configured in database' });
      }
    }

    const result = await processCommand(message, salonId, clientDate, history);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
