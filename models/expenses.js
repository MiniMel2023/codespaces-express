const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  invoiceNumber: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  incurredAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

expenseSchema.index({ incurredAt: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
