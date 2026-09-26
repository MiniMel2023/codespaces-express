const express = require('express');
const Employee = require('../models/employees');
const WageRecord = require('../models/wageRecords');
const TipRecord = require('../models/tipRecords');
const WageTracker = require('./wageTracker');

const TIP_ELIGIBLE_DEPARTMENTS = ['Waiter', 'Barista'];

const {
  getSelectedWeek,
  getSelectedMonth,
  getDaysInWeek,
  getDaysInMonth,
  getWeekDateRange,
  getSelectedDepartment,
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

function buildDailyTurnoverArray(rawTurnover = {}, length = 7) {
  return Array.from({ length }, (_, index) => {
    const amount = Number(rawTurnover[index]);
    return Number.isFinite(amount) && amount >= 0 ? amount : 0;
  });
}

function getSelectedView(viewType) {
  return ['daily', 'weekly', 'monthly'].includes(viewType) ? viewType : 'weekly';
}

function getSelectedDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    ? date
    : new Date().toISOString().slice(0, 10);
}

function getWeekForDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getWeekStartDate(week) {
  const [year, weekNumber] = week.split('-W').map(Number);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - januaryFourthDay + 1 + ((weekNumber - 1) * 7));
  return monday.toISOString().slice(0, 10);
}

function getDailyViewDay(dateValue) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const dayIndex = (date.getUTCDay() + 6) % 7;
  return {
    key: String(dayIndex),
    sourceIndex: dayIndex,
    label: date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    dateLabel: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  };
}

function getMonthDays(month) {
  return getDaysInMonth(month).map((day) => ({ ...day, sourceIndex: Number(day.key) }));
}

function getPeriodConfig(viewType, week, month, date) {
  if (viewType === 'daily') {
    const selectedDate = getSelectedDate(date);
    return {
      periodKey: selectedDate,
      periodLabel: getDailyViewDay(selectedDate).dateLabel,
      recordQuery: { periodType: 'weekly', week: getWeekForDate(selectedDate) },
      recordType: 'weekly',
      recordPeriod: getWeekForDate(selectedDate),
      daysOfPeriod: [getDailyViewDay(selectedDate)]
    };
  }

  if (viewType === 'monthly') {
    return {
      periodKey: month,
      periodLabel: month,
      recordQuery: { periodType: 'monthly', month, $or: [{ payPeriod: { $exists: false } }, { payPeriod: null }] },
      recordType: 'monthly',
      recordPeriod: month,
      daysOfPeriod: getMonthDays(month)
    };
  }

  return {
    periodKey: week,
    periodLabel: getWeekDateRange(week),
    recordQuery: { periodType: 'weekly', week },
    recordType: 'weekly',
    recordPeriod: week,
    daysOfPeriod: getDaysInWeek(week).map((day) => ({ ...day, sourceIndex: Number(day.key) }))
  };
}

async function getHome(req, res) {
  const viewType = getSelectedView(req.query.viewType);
  const month = getSelectedMonth(req.query.month);
  const date = getSelectedDate(req.query.date);
  const weekDate = viewType === 'weekly'
    ? getSelectedDate(req.query.weekDate || (req.query.week ? getWeekStartDate(getSelectedWeek(req.query.week)) : ''))
    : date;
  const week = viewType === 'daily' ? getWeekForDate(date) : viewType === 'weekly' ? getWeekForDate(weekDate) : getSelectedWeek(req.query.week);
  const period = getPeriodConfig(viewType, week, month, date);
  const defaultTipsMonth = viewType === 'daily' ? date.slice(0, 7) : month;
  const tipsMonth = getSelectedMonth(req.query.tipsMonth || defaultTipsMonth);
  const allEmployees = await Employee.find().sort({ name: 1 });
  const departments = [...new Set(allEmployees.map((employee) => employee.department))].sort();
  const department = getSelectedDepartment(req.query.department, departments);
  const employees = department === 'all'
    ? allEmployees
    : allEmployees.filter((employee) => employee.department === department);
  const wageRecords = await WageRecord.find(period.recordQuery);
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
  const daysOfPeriod = period.daysOfPeriod;

  const employeeFigures = employees.map((employee) => {
    const record = recordsByEmployee.get(employee._id.toString());
    const dailyHours = daysOfPeriod.map((day) => Number(record?.dailyHours?.[day.sourceIndex]) || 0);
    const dailyTurnover = daysOfPeriod.map((day) => Number(record?.dailyTurnover?.[day.sourceIndex]) || 0);
    const leaveStatuses = daysOfPeriod.map((day) => record?.leaveStatuses?.[day.sourceIndex] || 'none');
    const paidHours = calculatePaidHours(dailyHours, leaveStatuses);

    return {
      employee,
      dailyHours,
      dailyTurnover,
      leaveStatuses,
      paidHours,
      tipAmount: Number(tipsByEmployee.get(employee._id.toString())?.amount) || 0
    };
  });

  const totalWage = employeeFigures.reduce((total, item) => {
    return total + item.paidHours * item.employee.salaryPerHour;
  }, 0);
  const totalTurnover = employeeFigures.reduce((total, item) => {
    return total + item.dailyTurnover.reduce((employeeTotal, amount) => employeeTotal + amount, 0);
  }, 0);

  const tipFigures = employees
    .filter((employee) => TIP_ELIGIBLE_DEPARTMENTS.includes(employee.department))
    .map((employee) => ({
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
    viewType,
    date,
    weekDate,
    month,
    week,
    weekLabel: period.periodLabel,
    periodLabel: period.periodLabel,
    recordType: period.recordType,
    recordPeriod: period.recordPeriod,
    department,
    departments,
    employeeCount: employees.length,
    totalWage,
    totalTurnover,
    wageGraph,
    graphMax: Math.max(...wageGraph.map((day) => day.amount), 1),
    daysOfPeriod,
    employeeFigures,
    employeeGroups: departments
      .map((item) => ({ department: item, employees: employeeFigures.filter(({ employee }) => employee.department === item) }))
      .filter((group) => group.employees.length),
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
    if (!employee || !TIP_ELIGIBLE_DEPARTMENTS.includes(employee.department)) {
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
  const viewType = getSelectedView(req.body.viewType);
  const date = getSelectedDate(req.body.date);
  const month = getSelectedMonth(req.body.month);
  const weekDate = viewType === 'weekly'
    ? getSelectedDate(req.body.weekDate || (req.body.week ? getWeekStartDate(getSelectedWeek(req.body.week)) : ''))
    : date;
  const week = viewType === 'daily' ? getWeekForDate(date) : viewType === 'weekly' ? getWeekForDate(weekDate) : getSelectedWeek(req.body.week);
  const period = getPeriodConfig(viewType, week, month, date);
  const department = req.body.department || 'all';
  const defaultTipsMonth = viewType === 'daily' ? date.slice(0, 7) : month;
  const selectedTipsMonth = getSelectedMonth(req.body.tipsMonth || defaultTipsMonth);
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
    const existing = await WageRecord.findOne({ ...period.recordQuery, employee: employeeId });
    const dailyHours = Array.from({ length: period.recordType === 'monthly' ? getDaysInMonth(month).length : 7 }, (_, index) => Number(existing?.dailyHours?.[index]) || 0);
    const dailyTurnover = Array.from({ length: dailyHours.length }, (_, index) => Number(existing?.dailyTurnover?.[index]) || 0);
    const leaveStatuses = Array.from({ length: dailyHours.length }, (_, index) => existing?.leaveStatuses?.[index] || 'none');
    period.daysOfPeriod.forEach((day, index) => {
      dailyHours[day.sourceIndex] = Number(input.dailyHours?.[index]) || 0;
      dailyTurnover[day.sourceIndex] = Number(input.dailyTurnover?.[index]) || 0;
      leaveStatuses[day.sourceIndex] = input.leaveStatuses?.[index] || 'none';
    });
    const hoursWorked = calculatePaidHours(dailyHours, leaveStatuses);

    await WageRecord.findOneAndUpdate(
      { ...period.recordQuery, employee: employeeId },
      {
        employee: employeeId,
        periodType: period.recordType,
        week: period.recordType === 'weekly' ? week : undefined,
        month: period.recordType === 'monthly' ? month : undefined,
        hoursWorked,
        dailyHours,
        dailyTurnover,
        leaveStatuses,
        totalWage: hoursWorked * employee.salaryPerHour
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    if (TIP_ELIGIBLE_DEPARTMENTS.includes(employee.department) && input.tips !== undefined) {
      const tipPeriod = getTipPeriod(selectedTipsMonth);
      const amount = Number(input.tips);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('Tip amount must be zero or more');
      }
      await TipRecord.findOneAndUpdate(
        { employee: employeeId, periodKey: tipPeriod.periodKey },
        { employee: employeeId, periodKey: tipPeriod.periodKey, periodStart: tipPeriod.periodStart, periodEnd: tipPeriod.periodEnd, amount, paidOn: tipPeriod.periodEnd },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    }
  }));

  const params = new URLSearchParams({ viewType, department });
  if (viewType === 'daily') params.set('date', date);
  if (viewType === 'monthly') params.set('month', month);
  if (viewType === 'weekly') params.set('weekDate', weekDate);
  params.set('tipsMonth', selectedTipsMonth);
  res.redirect(`/home?${params.toString()}`);
}

module.exports = { getHome, postHomeFigures, postTips };
