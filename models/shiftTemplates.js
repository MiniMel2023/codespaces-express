const mongoose = require('mongoose');

const shiftTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  startTime: {
    type: String,
    required: true,
    match: /^([01]\d|2[0-3]):[0-5]\d$/
  },
  endTime: {
    type: String,
    required: true,
    match: /^([01]\d|2[0-3]):[0-5]\d$/
  },
  breakMinutes: {
    type: Number,
    min: 0,
    default: 0
  },
  color: {
    type: String,
    default: '#2563eb'
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

shiftTemplateSchema.index({ department: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ShiftTemplate', shiftTemplateSchema);
