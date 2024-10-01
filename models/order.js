const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ name: String, price: Number, quantity: Number}],
  total: { type: Number, required: true },
  paymentStatus: { type: String, required: true }, // 'pending' or 'completed'
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
//module.exports = Order;