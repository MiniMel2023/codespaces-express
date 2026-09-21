const Employee = require('../models/employees');
const WageRecord = require('../models/wageRecords');

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getSelectedPayPeriod(payPeriod) {
  return payPeriod === 'second' ? 'second' : 'first';
}

function getSelectedDepartment(department, departments = []) {
  return department && departments.includes(department) ? department : 'all';
}

function getDaysInPayPeriod(month, payPeriod) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const startDay = payPeriod === 'second' ? 16 : 1;
  const endDay = payPeriod === 'second' ? lastDay : 15;

  return Array.from({ length: endDay - startDay + 1 }, (_, index) => ({
    key: String(index),
    label: `${WEEK_DAYS[index % 7]} ${startDay + index}`
  }));
}

function getDaysInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();

  return Array.from({ length: lastDay }, (_, index) => ({
    key: String(index),
    label: `${WEEK_DAYS[index % 7]} ${index + 1}`
  }));
}

function getWeekStartDate(week) {
  const [year, weekNumber] = week.split('-W').map(Number);
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - januaryFourthDay + 1 + ((weekNumber - 1) * 7));
  return monday;
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  });
}

function getWeekDateRange(week) {
  const start = getWeekStartDate(week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return `${formatDate(start)}-${formatDate(end)} ${end.getUTCFullYear()}`;
}

function getDaysInWeek(week) {
  const start = getWeekStartDate(week);
  return WEEK_DAYS.map((day, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      key: String(index),
      label: `${day} ${formatDate(date)}`,
      dateLabel: formatDate(date)
    };
  });
}

function buildDailyHoursArray(rawHours = {}, length = 14) {
  return Array.from({ length }, (_, index) => Number(rawHours[index] || 0));
}

function buildLeaveStatuses(rawStatuses = {}, length = 14) {
  const allowedStatuses = ['none', 'annual', 'sick', 'unpaid'];
  return Array.from({ length }, (_, index) => allowedStatuses.includes(rawStatuses[index]) ? rawStatuses[index] : 'none');
}

function getLeaveStatuses(record, length = 14) {
  if (record && Array.isArray(record.leaveStatuses)) {
    return buildLeaveStatuses(record.leaveStatuses, length);
  }

  return Array(length).fill('none');
}

function calculatePaidHours(dailyHours, leaveStatuses) {
  return dailyHours.reduce((total, workedHours, index) => {
    const leaveStatus = leaveStatuses[index];
    if (leaveStatus === 'annual' || leaveStatus === 'sick') {
      return total + 8;
    }
    if (leaveStatus === 'unpaid') {
      return total;
    }
    return total + (Number(workedHours) || 0);
  }, 0);
}

function getDailyHours(record, length = 14) {
  if (record && Array.isArray(record.dailyHours)) {
    return Array.from({ length }, (_, index) => Number(record.dailyHours[index] || 0));
  }

  return Array(length).fill(0);
}

function getPayrollValues(record, length, salaryPerHour) {
  const dailyHours = getDailyHours(record, length);
  const leaveStatuses = getLeaveStatuses(record, length);
  const paidHours = calculatePaidHours(dailyHours, leaveStatuses);

  return {
    dailyHours,
    leaveStatuses,
    paidHours,
    totalWage: paidHours * salaryPerHour
  };
}

function getSelectedMonth(month) {
  if (/^\d{4}-\d{2}$/.test(month || '')) {
    return month;
  }

  return new Date().toISOString().slice(0, 7);
}

function getSelectedWeek(week) {
  if (/^\d{4}-W\d{2}$/.test(week || '')) {
    return week;
  }

  const now = new Date();
  const currentWeek = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = currentWeek.getUTCDay() || 7;
  currentWeek.setUTCDate(currentWeek.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(currentWeek.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((currentWeek - yearStart) / 86400000) + 1) / 7);
  return `${currentWeek.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

async function getWageTracker(req, res) {
  const viewType = req.query.viewType === 'monthly' ? 'monthly' : 'weekly';
  const month = getSelectedMonth(req.query.month);
  const week = getSelectedWeek(req.query.week);
  const allEmployees = await Employee.find().sort({ name: 1 });
  const departments = [...new Set(allEmployees.map((employee) => employee.department))].sort();
  const department = getSelectedDepartment(req.query.department, departments);
  const employees = department === 'all'
    ? allEmployees
    : allEmployees.filter((employee) => employee.department === department);
  const selectedPeriod = viewType === 'weekly' ? week : month;
  const periodLabel = viewType === 'weekly' ? getWeekDateRange(week) : selectedPeriod;
  const daysOfPeriod = viewType === 'weekly'
    ? getDaysInWeek(week)
    : getDaysInMonth(month);
  const query = viewType === 'weekly'
    ? { periodType: 'weekly', week }
    : { periodType: 'monthly', month, $or: [{ payPeriod: { $exists: false } }, { payPeriod: null }] };

  const wageRecords = await WageRecord.find(query);
  const recordsByEmployee = new Map(
    wageRecords.map((record) => [record.employee.toString(), record])
  );

  const payrollByEmployee = new Map();
  const totalHours = employees.reduce((sum, employee) => {
    const record = recordsByEmployee.get(employee._id.toString());
    const payroll = getPayrollValues(record, daysOfPeriod.length, employee.salaryPerHour);
    payrollByEmployee.set(employee._id.toString(), payroll);
    return sum + payroll.paidHours;
  }, 0);
  const totalWages = employees.reduce((sum, employee) => {
    return sum + payrollByEmployee.get(employee._id.toString()).totalWage;
  }, 0);

  const dashboardStats = {
    totalEmployees: employees.length,
    totalHours,
    totalWages,
    averageHours: employees.length ? totalHours / employees.length : 0
  };

  const dailyTotals = daysOfPeriod.map((day, index) => ({
    ...day,
    hours: employees.reduce((sum, employee) => {
      const payroll = payrollByEmployee.get(employee._id.toString());
      const leaveStatus = payroll.leaveStatuses[index];
      const dayHours = leaveStatus === 'annual' || leaveStatus === 'sick'
        ? 8
        : leaveStatus === 'unpaid' ? 0 : payroll.dailyHours[index];
      return sum + dayHours;
    }, 0)
  }));

  const employeeBreakdown = employees.map((employee) => {
    const record = recordsByEmployee.get(employee._id.toString());
    const payroll = getPayrollValues(record, daysOfPeriod.length, employee.salaryPerHour);
    const overtimeHours = Math.max(payroll.paidHours - 40, 0);

    return {
      employee,
      dailyHours: payroll.dailyHours,
      leaveStatuses: payroll.leaveStatuses,
      hoursWorked: payroll.paidHours,
      totalWage: payroll.totalWage,
      overtimeHours
    };
  });

  res.render('wageTracker', {
    employees,
    recordsByEmployee,
    dashboardStats,
    daysOfPeriod,
    dailyTotals,
    employeeBreakdown,
    payrollByEmployee,
    month,
    week,
    department,
    departments,
    viewType,
    selectedPeriod,
    periodLabel,
    pageTitle: 'Wage Tracker',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

async function postWageRecord(req, res) {
  const { employeeId, viewType, month, week, department } = req.body;
  const activeType = viewType === 'weekly' ? 'weekly' : 'monthly';
  const selectedMonth = month || getSelectedMonth();
  const selectedPeriod = activeType === 'weekly' ? (week || getSelectedWeek()) : selectedMonth;
  const dailyHoursLength = activeType === 'weekly' ? 7 : getDaysInMonth(selectedMonth).length;
  const selectedEmployees = req.body.selectedEmployees
    ? (Array.isArray(req.body.selectedEmployees) ? req.body.selectedEmployees : [req.body.selectedEmployees])
    : employeeId
      ? [employeeId]
      : [];

  if (!selectedEmployees.length || (activeType === 'weekly' && !/^\d{4}-W\d{2}$/.test(selectedPeriod)) || (activeType === 'monthly' && !/^\d{4}-\d{2}$/.test(selectedPeriod))) {
    return res.status(400).send('Select at least one employee and a valid period');
  }

  const employeeInputs = req.body.employees || {};
  const updates = await Promise.all(selectedEmployees.map(async (selectedEmployeeId) => {
    const employee = await Employee.findById(selectedEmployeeId);
    const input = employeeInputs[selectedEmployeeId] || {};
    const dailyHours = buildDailyHoursArray(
      input.dailyHours || (selectedEmployeeId === employeeId ? req.body.dailyHours : {}),
      dailyHoursLength
    );
    const leaveStatuses = buildLeaveStatuses(
      input.leaveStatuses || (selectedEmployeeId === employeeId ? req.body.leaveStatuses : {}),
      dailyHoursLength
    );

    if (!employee) {
      throw new Error('Invalid employee');
    }

    const hours = calculatePaidHours(dailyHours, leaveStatuses);
    if (!Number.isFinite(hours) || hours < 0) {
      throw new Error('Hours worked must be a positive number');
    }

    const filter = { employee: selectedEmployeeId, periodType: activeType };
    if (activeType === 'weekly') {
      filter.week = selectedPeriod;
    } else {
      filter.month = selectedMonth;
      filter.$or = [{ payPeriod: { $exists: false } }, { payPeriod: null }];
    }

    return WageRecord.findOneAndUpdate(
      filter,
      {
        employee: selectedEmployeeId,
        periodType: activeType,
        month: activeType === 'monthly' ? selectedMonth : undefined,
        week: activeType === 'weekly' ? selectedPeriod : undefined,
        payPeriod: undefined,
        hoursWorked: hours,
        dailyHours,
        leaveStatuses,
        totalWage: hours * employee.salaryPerHour
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }));

  await Promise.all(updates);

  const redirectQuery = activeType === 'weekly'
    ? `viewType=weekly&week=${encodeURIComponent(selectedPeriod)}`
    : `viewType=monthly&month=${encodeURIComponent(selectedMonth)}`;
  const departmentQuery = department && department !== 'all'
    ? `&department=${encodeURIComponent(department)}`
    : '';

  res.redirect(`/wage-tracker?${redirectQuery}${departmentQuery}`);
}

module.exports = {
  getWageTracker,
  postWageRecord,
  getSelectedMonth,
  getSelectedWeek,
  getSelectedPayPeriod,
  getSelectedDepartment,
  getDaysInPayPeriod,
  getDaysInMonth,
  getDaysInWeek,
  getWeekDateRange,
  buildDailyHoursArray,
  buildLeaveStatuses,
  calculatePaidHours,
  getPayrollValues
}; 
