const Employee = require('../models/employees');
const WageRecord = require('../models/wageRecords');
const TipRecord = require('../models/tipRecords');
const {
  getSelectedWeek,
  getWeekDateRange,
  getSelectedDepartment
} = require('./wageTracker');

function getTipPeriod(tipsMonth) {
  const [year, month] = tipsMonth.split('-').map(Number);
  const periodEnd = new Date(Date.UTC(year, month - 1, 15));
  const periodStart = new Date(Date.UTC(year, month - 2, 16));
  const formatDate = (date) => date.toISOString().slice(0, 10);
  const formatDisplayDate = (date) => date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

  return {
    periodKey: `${formatDate(periodStart)}_to_${formatDate(periodEnd)}`,
    periodLabel: `${formatDisplayDate(periodStart)} to ${formatDisplayDate(periodEnd)}`
  };
}

async function getPayrollPayout(req, res) {
  const week = getSelectedWeek(req.query.week);
  const tipsMonth = /^\d{4}-\d{2}$/.test(req.query.tipsMonth || '')
    ? req.query.tipsMonth
    : new Date().toISOString().slice(0, 7);
  const allEmployees = await Employee.find().sort({ name: 1 });
  const departments = [...new Set(allEmployees.map((employee) => employee.department))].sort();
  const department = getSelectedDepartment(req.query.department, departments);
  const employees = department === 'all'
    ? allEmployees
    : allEmployees.filter((employee) => employee.department === department);
  const employeeIds = new Set(employees.map((employee) => employee._id.toString()));
  const tipPeriod = getTipPeriod(tipsMonth);
  const [wageRecords, tipRecords] = await Promise.all([
    WageRecord.find({ periodType: 'weekly', week }),
    TipRecord.find({ periodKey: tipPeriod.periodKey })
  ]);
  const wagesByEmployee = new Map(wageRecords.map((record) => [record.employee.toString(), record]));
  const tipsByEmployee = new Map(tipRecords.map((record) => [record.employee.toString(), record]));

  const payoutRows = employees.map((employee) => {
    const employeeId = employee._id.toString();
    const wageRecord = employeeIds.has(employeeId) ? wagesByEmployee.get(employeeId) : null;
    const tipRecord = tipsByEmployee.get(employeeId);
    const wageAmount = wageRecord ? Number(wageRecord.totalWage) || 0 : 0;
    const tipAmount = tipRecord ? Number(tipRecord.amount) || 0 : 0;

    return {
      employee,
      wageAmount,
      tipAmount,
      totalPayout: wageAmount + tipAmount
    };
  });

  res.render('payrollPayout', {
    week,
    weekLabel: getWeekDateRange(week),
    tipsMonth,
    tipPeriodLabel: tipPeriod.periodLabel,
    department,
    departments,
    payoutRows,
    totalWages: payoutRows.reduce((total, row) => total + row.wageAmount, 0),
    totalTips: payoutRows.reduce((total, row) => total + row.tipAmount, 0),
    totalPayout: payoutRows.reduce((total, row) => total + row.totalPayout, 0),
    pageTitle: 'Payroll Payout',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

module.exports = { getPayrollPayout };
