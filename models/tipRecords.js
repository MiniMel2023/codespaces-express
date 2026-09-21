const mongoose = require('mongoose');

const tipRecordSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  periodKey: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}$/
  },
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paidOn: {
    type: Date,
    required: true,
    immutable: true
  }
}, { timestamps: true });

tipRecordSchema.index({ employee: 1, periodKey: 1 }, { unique: true });

module.exports = mongoose.model('TipRecord', tipRecordSchema);
