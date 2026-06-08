const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true, index: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', index: true },
  category: {
    type: String,
    enum: ['mens-services', 'womens-services', 'color', 'mens-color', 'smoothing-perms', 'threading-wax'],
    required: true,
  },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true }, // in cents
  priceVaries: { type: Boolean, default: false }, // true if "+" pricing
  duration: { type: Number, required: true }, // minutes
  styleTags: [{ type: String }], // for matching: ["fade", "classic", "textured", "curly"]
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
