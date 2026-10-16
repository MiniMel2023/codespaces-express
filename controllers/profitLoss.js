const mongoose = require('mongoose');
const Employee = require('../models/employees');
const Expense = require('../models/expenses');
const WageRecord = require('../models/wageRecords');
const WageTracker = require('./wageTracker');

const {
  getDaysInMonth,
  getDaysInWeek,
  getSelectedMonth,
  getWeekDateRange
} = WageTracker;

const listofSuppliers = [
  'Fresh Trading', 
  'Mushrooms & Things', 
  'Avo Lands', 
  'Foodstore', 
  ' Omega Fish', 
  'Ryan Boon', 
  'Gastro Foods', 
  'Gelizos Ice Cream Fusion', 
  'Brackenfell Oil', 
  'Raw Cape Honey', 
  'Solitaire Free Range Eggs', 
  'Elgin Free Range Chicken', 
  'Lausanne Dairies', 
  'Paulies', 
  'Morgenster', 
  'Off The Gluten Path', 
  'Greenfields', 
  'Grumpy Snacks', 
  'Oryx', 
  'Norman Good Fellows', 
  'Liquid Concepts', 
  'Spider Pig', 
  'Roastery', 
  'Mountain Falls']

const expenseDescriptionOptions = {
  COGS: listofSuppliers,
  Finance: ['Accounting fees', 'Credit Rates'],
  Franchise: ['Franchise fee', 'Marketing fee'],
  Management: ['Management fee'],
  Operations:[
    'Pantry stock', 
    'Cleaning supplies', 
    'Insurance', 
    'Legel Fee/ Licences - Liquor', 
    'Legal Fee/ Licences - Sampra', 
    'Legal Fee/ Licences - Sampro', 
    'Legal Fee/ Licences - Other, Capasso', 
    'Packing', 
    'Printing & Stationery', 
    'Rent', 
    'Ops Cost', 
    'Bootlegger App Fee - basic', 
    'Bootlegger App Fee - variable', 
    'Delivery App comission'
  ],
  Provisions:[ 
    'Computer Expenses', 
    'Workmen compensation', 
    'Repairs & Maintenance', 
    'Smalls items & Replacements'
  ],
  Staff: [
    'Salaries, incl PAYE, UIF & LEAVE ACC', 
    'Wages, incl PAYE UIF & LEAVE ACC', 
    'Staff Uniforms', 
    'Staff Training & Recuitment', 
    'Staff Welfare']
    ,
  Subscriptions: [
    'Radiomac', 
    'BBM', 
    'Internet AP', 
    'Staff Training LMS', 
    'Keytech', 
    'CapEx/Rental - Generation',
    'CapEx/Rental - POS Software'
  ],
  Utilities: [
    'Electricity', 
    'Water', 
    'Internet/phone, ', 
    'Gas', 
    'Municipal Expenses (Waste, Refuse)', 
    'Pest Control', 
    'Meter reading', 
    'Sewer'
  ]
};
const expenseCategoryOptions = Object.keys(expenseDescriptionOptions);

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getWeekForDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getWeekStart(week) {
  const [year, weekNumber] = week.split('-W').map(Number);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - januaryFourthDay + 1 + ((weekNumber - 1) * 7));
  return monday;
}

function getSelectedDate(value) {
  return isValidDate(value) ? value : new Date().toISOString().slice(0, 10);
}

function getValidMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '')
    ? getSelectedMonth(value)
    : new Date().toISOString().slice(0, 7);
}

function getPeriod(req) {
  const viewType = ['daily', 'weekly', 'monthly'].includes(req.query.viewType)
    ? req.query.viewType
    : 'weekly';
  const today = new Date().toISOString().slice(0, 10);
  const date = getSelectedDate(req.query.date);
  const weekDate = getSelectedDate(req.query.weekDate || today);
  const month = getValidMonth(req.query.month);
  const week = getWeekForDate(weekDate);

  if (viewType === 'daily') {
    const selectedDay = new Date(`${date}T00:00:00.000Z`);
    const dayIndex = (selectedDay.getUTCDay() + 6) % 7;
    const weekKey = getWeekForDate(date);
    return {
      viewType,
      date,
      weekDate,
      month,
      week: weekKey,
      periodLabel: selectedDay.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      }),
      recordQuery: { periodType: 'weekly', week: weekKey },
      days: [{ sourceIndex: dayIndex }],
      expenseStart: selectedDay,
      expenseEnd: new Date(selectedDay.getTime() + 86400000)
    };
  }

  if (viewType === 'monthly') {
    const [year, monthNumber] = month.split('-').map(Number);
    const expenseStart = new Date(Date.UTC(year, monthNumber - 1, 1));
    const expenseEnd = new Date(Date.UTC(year, monthNumber, 1));
    return {
      viewType,
      date,
      weekDate,
      month,
      week,
      periodLabel: expenseStart.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
      }),
      recordQuery: {
        periodType: 'monthly',
        month,
        $or: [{ payPeriod: { $exists: false } }, { payPeriod: null }]
      },
      days: getDaysInMonth(month).map((day, sourceIndex) => ({ sourceIndex })),
      expenseStart,
      expenseEnd
    };
  }

  const expenseStart = getWeekStart(week);
  const expenseEnd = new Date(expenseStart);
  expenseEnd.setUTCDate(expenseEnd.getUTCDate() + 7);
  return {
    viewType,
    date,
    weekDate,
    month,
    week,
    periodLabel: getWeekDateRange(week),
    recordQuery: { periodType: 'weekly', week },
    days: getDaysInWeek(week).map((day, sourceIndex) => ({ sourceIndex })),
    expenseStart,
    expenseEnd
  };
}

async function getProfitLoss(req, res) {
  const period = getPeriod(req);
  const allEmployees = await Employee.find().sort({ name: 1 });
  const [wageRecords, expenses] = await Promise.all([
    WageRecord.find(period.recordQuery),
    Expense.find({
      incurredAt: { $gte: period.expenseStart, $lt: period.expenseEnd }
    }).sort({ incurredAt: -1, createdAt: -1 })
  ]);
  const recordsByEmployee = new Map(
    wageRecords.map((record) => [record.employee.toString(), record])
  );
  const employeeRows = allEmployees.map((employee) => {
    const record = recordsByEmployee.get(employee._id.toString());
    const dailyTurnover = period.days.map((day) => Number(record?.dailyTurnover?.[day.sourceIndex]) || 0);
    const dailyLabourCost = period.days.map((day) => {
      const leaveStatus = record?.leaveStatuses?.[day.sourceIndex] || 'none';
      const hours = leaveStatus === 'annual' || leaveStatus === 'sick'
        ? 8
        : leaveStatus === 'unpaid' ? 0 : Number(record?.dailyHours?.[day.sourceIndex]) || 0;
      return hours * employee.salaryPerHour;
    });

    return {
      employee,
      dailyTurnover,
      dailyLabourCost,
      turnover: dailyTurnover.reduce((total, amount) => total + amount, 0),
      labourCost: dailyLabourCost.reduce((total, amount) => total + amount, 0)
    };
  });
  const totalTurnover = employeeRows.reduce((total, row) => total + row.turnover, 0);
  const totalLabourCost = employeeRows.reduce((total, row) => total + row.labourCost, 0);
  const totalExpenses = expenses.reduce((total, expense) => total + expense.amount, 0);
  const expenseDate = period.viewType === 'daily'
    ? period.date
    : period.viewType === 'monthly'
      ? `${period.month}-01`
      : period.weekDate;
  const dailySummaries = period.days.map((day, index) => {
    const date = new Date(period.expenseStart);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    const turnover = employeeRows.reduce((total, row) => total + row.dailyTurnover[index], 0);
    const labourCost = employeeRows.reduce((total, row) => total + row.dailyLabourCost[index], 0);
    const dailyExpenses = expenses
      .filter((expense) => expense.incurredAt.toISOString().slice(0, 10) === dateKey)
      .reduce((total, expense) => total + expense.amount, 0);

    return {
      date: dateKey,
      label: date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
      dateLabel: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      turnover,
      labourCost,
      expenses: dailyExpenses,
      net: turnover - labourCost - dailyExpenses
    };
  });
  const liveExpenses = expenses.filter((expense) => expense.incurredAt.toISOString().slice(0, 10) === expenseDate);
  const liveExpenseTotal = liveExpenses.reduce((total, expense) => total + expense.amount, 0);
  const chartMax = Math.max(...dailySummaries.flatMap((day) => [day.turnover, day.labourCost, day.expenses]), 1);

  res.render('profitLossDashboard', {
    ...period,
    expenseDate,
    employeeRows,
    expenseCategoryOptions,
    expenseDescriptionOptions,
    dailySummaries,
    chartMax,
    liveExpenses,
    liveExpenseTotal,
    totalTurnover,
    totalLabourCost,
    totalExpenses,
    netProfit: totalTurnover - totalLabourCost - totalExpenses,
    pageTitle: 'Profit & Loss',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

async function getExpenseProjection(req, res) {
  const period = getPeriod(req);
  const expenseCategories = await Expense.distinct('category');
  expenseCategories.sort((left, right) => left.localeCompare(right));
  const categoryFilter = typeof req.query.categoryFilter === 'string' &&
    expenseCategories.includes(req.query.categoryFilter)
    ? req.query.categoryFilter
    : 'all';
  const query = {
    incurredAt: { $gte: period.expenseStart, $lt: period.expenseEnd }
  };
  if (categoryFilter !== 'all') query.category = categoryFilter;

  const expenses = await Expense.find(query).sort({ incurredAt: -1, createdAt: -1 });
  const totalExpenses = expenses.reduce((total, expense) => total + expense.amount, 0);

  res.render('expenseProjection', {
    ...period,
    expenses,
    expenseCategories,
    categoryFilter,
    totalExpenses,
    pageTitle: 'Expense Projection',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

async function postExpense(req, res) {
  const { category, description, amount, incurredAt } = req.body;
  const parsedAmount = Number(amount);

  if (
    typeof category !== 'string' || !expenseCategoryOptions.includes(category) ||
    typeof description !== 'string' || !expenseDescriptionOptions[category].includes(description) ||
    typeof req.body.invoiceNumber !== 'string' || !req.body.invoiceNumber.trim() || req.body.invoiceNumber.trim().length > 80 ||
    typeof amount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(amount) ||
    !Number.isFinite(parsedAmount) || parsedAmount <= 0 ||
    !Number.isSafeInteger(Math.round(parsedAmount * 100)) ||
    !isValidDate(incurredAt)
  ) {
    if (req.accepts('json')) {
      return res.status(400).json({
        error: 'Choose a valid expense category and description, and enter an invoice number, positive amount, and valid date.'
      });
    }
    return res.status(400).send('Choose a valid expense category and description, and enter an invoice number, positive amount, and valid date.');
  }

  const expense = await Expense.create({
    category: category.trim(),
    description: description.trim(),
    amount: parsedAmount,
    invoiceNumber: req.body.invoiceNumber.trim(),
    incurredAt: new Date(`${incurredAt}T00:00:00.000Z`)
  });
  if (req.accepts('json')) {
    return res.status(201).json({
      id: expense._id.toString(),
      category: expense.category,
      description: expense.description,
      invoiceNumber: expense.invoiceNumber,
      amount: expense.amount,
      incurredAt: expense.incurredAt.toISOString()
    });
  }
  return res.redirect(`/profitLoss?${buildFilterQuery(req.body)}`);
}

async function deleteExpense(req, res) {
  if (!mongoose.isValidObjectId(req.params.expenseId)) {
    return res.status(400).send('Invalid expense.');
  }

  const expense = await Expense.findByIdAndDelete(req.params.expenseId);
  if (!expense) {
    return res.status(404).send('Expense not found.');
  }

  const destination = req.body.returnTo === 'dashboard' ? '/profitLoss' : '/profitLoss/expenses';
  return res.redirect(`${destination}?${buildFilterQuery(req.body)}`);
}

function buildFilterQuery(filters) {
  const params = new URLSearchParams();
  ['viewType', 'date', 'weekDate', 'month'].forEach((key) => {
    if (typeof filters[key] === 'string' && filters[key]) {
      params.set(key, filters[key]);
    }
  });
  if (typeof filters.categoryFilter === 'string' && filters.categoryFilter) {
    params.set('categoryFilter', filters.categoryFilter);
  }
  return params.toString();
}

module.exports = {
  getProfitLoss: asyncHandler(getProfitLoss),
  getExpenseProjection: asyncHandler(getExpenseProjection),
  postExpense: asyncHandler(postExpense),
  deleteExpense: asyncHandler(deleteExpense)
};
