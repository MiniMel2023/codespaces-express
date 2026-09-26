const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  dayIndex: {
    type: Number,
    required: true,
    min: 0,
    max: 6
  },
  shiftTemplate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShiftTemplate',
    required: true
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  }
}, { _id: false });

const shiftScheduleSchema = new mongoose.Schema({
  week: {
    type: String,
    required: true,
    match: /^\d{4}-W\d{2}$/,
    unique: true
  },
  assignments: {
    type: [assignmentSchema],
    default: []
  },
  formula: {
    hoursWeight: { type: Number, min: 0, default: 70 },
    shiftsWeight: { type: Number, min: 0, default: 30 },
    maxHours: { type: Number, min: 1, default: 40 }
  }
}, { timestamps: true });

module.exports = mongoose.model('ShiftSchedule', shiftScheduleSchema);
