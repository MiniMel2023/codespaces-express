const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const bankingDetailsSchema = new Schema({
  bankName: String,
  accountHolder: String,
  accountNumber: String,
  branchCode: String,
  accountType: String
}, { _id: false });

const supplierSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  customerAccountNumber: Number,
  contactPerson: String,
  contactEmail: String,
  phoneOne: Number,
  phoneTwo: Number,
  deliveryDays: Number,
  orderLeadTime: Number,
  MOQWithoutDeliveryFee: Number,
  OnlineOrderPlattform: String,
  platformPassword: String,
  orderEmail: String,
  orderEmail2: String,
  paymentTerms: Number,
  accountingContact: String,
  accountingEmail: String,
  accountingPhone: Number,
  bankingDetails: bankingDetailsSchema
});

module.exports = mongoose.model('Supplier', supplierSchema);
