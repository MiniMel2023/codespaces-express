const express = require('express');
const router = express.Router();
const Employee = require('../models/employees');
const WageRecord = require('../models/wageRecords');
const TipRecord = require('../models/tipRecords');
const WageTracker = require('./wageTracker');

const {
  getSelectedWeek,
  getDaysInWeek,
  getWeekDateRange,
  getSelectedDepartment,
  buildDailyHoursArray,
  buildLeaveStatuses,
  calculatePaidHours
} = WageTracker;

function getTipPeriod(tipMonth) {
  const [year, month] = tipMonth.split('-').map(Number);
  const periodEnd = new Date(Date.UTC(year, month - 1, 15));
  const periodStart = new Date(Date.UTC(year, month - 2, 16));
  const formatKeyDate = (date) => date.toISOString().slice(0, 10);
  const formatDisplayDate = (date) => date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

  return {
    periodKey: `${formatKeyDate(periodStart)}_to_${formatKeyDate(periodEnd)}`,
    periodStart,
    periodEnd,
    periodLabel: `${formatDisplayDate(periodStart)} to ${formatDisplayDate(periodEnd)}`
  };
}

async function getHome(req, res) {
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
  const wageRecords = await WageRecord.find({ week, periodType: 'weekly' });
  const tipPeriod = getTipPeriod(tipsMonth);
  const tipRecords = await TipRecord.find({ periodKey: tipPeriod.periodKey });
  const employeeIds = new Set(employees.map((employee) => employee._id.toString()));
  const recordsByEmployee = new Map(
    wageRecords
      .filter((record) => employeeIds.has(record.employee.toString()))
      .map((record) => [record.employee.toString(), record])
  );
  const tipsByEmployee = new Map(
    tipRecords
      .filter((record) => employeeIds.has(record.employee.toString()))
      .map((record) => [record.employee.toString(), record])
  );
  const daysOfPeriod = getDaysInWeek(week);

  const employeeFigures = employees.map((employee) => {
    const record = recordsByEmployee.get(employee._id.toString());
    const dailyHours = buildDailyHoursArray(record ? record.dailyHours : {}, daysOfPeriod.length);
    const leaveStatuses = buildLeaveStatuses(record ? record.leaveStatuses : {}, daysOfPeriod.length);
    const paidHours = calculatePaidHours(dailyHours, leaveStatuses);

    return { employee, dailyHours, leaveStatuses, paidHours };
  });

  const totalWage = employeeFigures.reduce((total, item) => {
    return total + item.paidHours * item.employee.salaryPerHour;
  }, 0);

  const tipFigures = employees.map((employee) => ({
    employee,
    amount: tipsByEmployee.get(employee._id.toString())?.amount || 0
  }));
  const totalTips = tipFigures.reduce((total, item) => total + item.amount, 0);

  const wageGraph = daysOfPeriod.map((day, index) => ({
    key: day.key,
    label: day.label.split(' ')[0],
    dateLabel: day.dateLabel,
    amount: employeeFigures.reduce((total, item) => {
      const leaveStatus = item.leaveStatuses[index];
      const paidHours = leaveStatus === 'annual' || leaveStatus === 'sick'
        ? 8
        : leaveStatus === 'unpaid' ? 0 : item.dailyHours[index];
      return total + paidHours * item.employee.salaryPerHour;
    }, 0),
    selected: true
  }));

  res.render('homeDashboard', {
    week,
    weekLabel: getWeekDateRange(week),
    department,
    departments,
    employeeCount: employees.length,
    totalWage,
    wageGraph,
    graphMax: Math.max(...wageGraph.map((day) => day.amount), 1),
    daysOfPeriod,
    employeeFigures,
    tipsMonth,
    tipPeriodLabel: tipPeriod.periodLabel,
    tipFigures,
    totalTips,
    pageTitle: 'Home Dashboard',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

async function postTips(req, res) {
  const tipsMonth = /^\d{4}-\d{2}$/.test(req.body.tipsMonth || '')
    ? req.body.tipsMonth
    : new Date().toISOString().slice(0, 7);
  const week = getSelectedWeek(req.body.week);
  const department = req.body.department || 'all';
  const tipPeriod = getTipPeriod(tipsMonth);
  const selectedEmployees = req.body.selectedTipEmployees
    ? (Array.isArray(req.body.selectedTipEmployees) ? req.body.selectedTipEmployees : [req.body.selectedTipEmployees])
    : [];
  const tipInputs = req.body.tips || {};

  if (!selectedEmployees.length) {
    return res.status(400).send('Select at least one employee to save tips');
  }

  await Promise.all(selectedEmployees.map(async (employeeId) => {
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      throw new Error('Invalid employee');
    }

    const amount = Number(tipInputs[employeeId]);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Tip amount must be zero or more');
    }

    await TipRecord.findOneAndUpdate(
      { employee: employeeId, periodKey: tipPeriod.periodKey },
      {
        employee: employeeId,
        periodKey: tipPeriod.periodKey,
        periodStart: tipPeriod.periodStart,
        periodEnd: tipPeriod.periodEnd,
        amount,
        paidOn: tipPeriod.periodEnd
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }));

  const departmentQuery = department !== 'all'
    ? `&department=${encodeURIComponent(department)}`
    : '';
  res.redirect(`/home?week=${encodeURIComponent(week)}&tipsMonth=${encodeURIComponent(tipsMonth)}${departmentQuery}`);
}

async function postHomeFigures(req, res) {
  const week = getSelectedWeek(req.body.week);
  const department = req.body.department || 'all';
  const daysOfPeriod = getDaysInWeek(week);
  const selectedEmployees = req.body.selectedEmployees
    ? (Array.isArray(req.body.selectedEmployees) ? req.body.selectedEmployees : [req.body.selectedEmployees])
    : [];
  const employeeInputs = req.body.employees || {};

  if (!selectedEmployees.length) {
    return res.status(400).send('Select at least one employee to save daily figures');
  }

  await Promise.all(selectedEmployees.map(async (employeeId) => {
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      throw new Error('Invalid employee');
    }

    const input = employeeInputs[employeeId] || {};
    const dailyHours = buildDailyHoursArray(input.dailyHours || {}, daysOfPeriod.length);
    const leaveStatuses = buildLeaveStatuses(input.leaveStatuses || {}, daysOfPeriod.length);
    const hoursWorked = calculatePaidHours(dailyHours, leaveStatuses);

    await WageRecord.findOneAndUpdate(
      { employee: employeeId, periodType: 'weekly', week },
      {
        employee: employeeId,
        periodType: 'weekly',
        week,
        hoursWorked,
        dailyHours,
        leaveStatuses,
        totalWage: hoursWorked * employee.salaryPerHour
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }));

  const departmentQuery = department !== 'all'
    ? `&department=${encodeURIComponent(department)}`
    : '';
  res.redirect(`/home?week=${encodeURIComponent(week)}${departmentQuery}`);
}

module.exports = { getHome, postHomeFigures, postTips };
