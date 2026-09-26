const mongoose = require('mongoose');

const wageRecordSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  periodType: {
    type: String,
    enum: ['monthly', 'weekly'],
    required: true,
    default: 'monthly'
  },
  month: {
    type: String,
    match: /^\d{4}-\d{2}$/
  },
  week: {
    type: String,
    match: /^\d{4}-W\d{2}$/
  },
  payPeriod: {
    type: String,
    enum: ['first', 'second']
  },
  hoursWorked: {
    type: Number,
    required: true,
    min: 0
  },
  dailyHours: {
    type: [Number],
    default: () => Array(31).fill(0),
    validate: {
      validator: (hours) => hours.length <= 31,
      message: 'A month cannot contain more than 31 daily entries'
    }
  },
  dailyTurnover: {
    type: [Number],
    default: () => Array(31).fill(0),
    validate: {
      validator: (turnover) => turnover.length <= 31 && turnover.every((amount) => amount >= 0),
      message: 'Daily turnover must contain no more than 31 non-negative entries'
    }
  },
  leaveStatuses: {
    type: [String],
    default: () => Array(31).fill('none'),
    validate: {
      validator: (statuses) => statuses.length <= 31 && statuses.every((status) => ['none', 'annual', 'sick', 'unpaid'].includes(status)),
      message: 'Leave status must be none, annual, sick, or unpaid'
    }
  },
  totalWage: {
    type: Number,
    required: true,
    min: 0
  }
}, { timestamps: true });

wageRecordSchema.index({ employee: 1, periodType: 1, month: 1, week: 1, payPeriod: 1 }, { unique: true });

module.exports = mongoose.model('WageRecord', wageRecordSchema);