const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const bankingDetailsSchema = new Schema({
  bankName: {
    type: String,
    required: true
  },
  accountNumber: {
    type: String,
    required: true
  },
  branchCode: {
    type: String,
    required: true
  }
}, { _id: false });

const employeeSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  salaryPerHour: {
    type: Number,
    required: true
  },
  turnoverTarget: {
    type: Number,
    min: 0,
    default: null
  },
  hireDate: {
    type: Date,
    required: true
  },
  IDnumber: {
    type: String,
    required: true
  },
  incomeTaxNo: {
    type: String,
    required: true
  },
  annualLeaveDaysPerYear: {
    type: Number,
    required: true
  },
  unpaidLeaveDaysPerYear: {
    type: Number,
    required: true
  },
  offDaysPerYear: {
    type: Number,
    required: true
  },
  workDaysPerYear: {
    type: Number,
    required: true
  },
  UIFregNo: {
    type: String,
    required: true
  },
  sickDaysPerYear: {
    type: Number,
    required: true
  }, 
  bankingDetails: {
    type: bankingDetailsSchema,
    required: true,
    default: undefined
  }
});

module.exports = mongoose.model("Employee", employeeSchema);