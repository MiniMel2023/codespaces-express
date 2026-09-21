require('dotenv').config();

const mongoose = require('mongoose');

const WageRecord = require('../models/wageRecords');

async function migrateMonthlyWages() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const legacyRecords = await mongoose.connection.collection('wagerecords')
    .find({ periodType: 'biweekly' })
    .toArray();

  if (!legacyRecords.length) {
    console.log('No legacy biweekly wage records found.');
    return;
  }

  console.log(`${legacyRecords.length} legacy biweekly wage record(s) found.`);
  await mongoose.connection.collection('wagerecords').updateMany(
    { periodType: 'biweekly' },
    { $set: { periodType: 'monthly' } }
  );
  console.log('Legacy wage records migrated to monthly periods.');
}

migrateMonthlyWages()
  .catch((error) => {
    console.error('Monthly wage migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });