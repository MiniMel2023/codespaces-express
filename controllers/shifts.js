const Employee = require('../models/employees');
const ShiftTemplate = require('../models/shiftTemplates');
const ShiftSchedule = require('../models/shiftSchedules');
const WageRecord = require('../models/wageRecords');
const WageTracker = require('./wageTracker');

const DEFAULT_FORMULA = {
  hoursWeight: 70,
  shiftsWeight: 30,
  maxHours: 40
};

function getSelectedDepartment(department, departments) {
  return department && departments.includes(department) ? department : 'all';
}

function getShiftHours(template) {
  const [startHour, startMinute] = template.startTime.split(':').map(Number);
  const [endHour, endMinute] = template.endTime.split(':').map(Number);
  let minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  if (minutes <= 0) {
    minutes += 24 * 60;
  }
  return Math.max((minutes - (template.breakMinutes || 0)) / 60, 0);
}

function getFormula(schedule) {
  const hoursWeight = Number(schedule?.formula?.hoursWeight);
  const shiftsWeight = Number(schedule?.formula?.shiftsWeight);
  const maxHours = Number(schedule?.formula?.maxHours);
  return {
    hoursWeight: Number.isFinite(hoursWeight) ? Math.max(hoursWeight, 0) : DEFAULT_FORMULA.hoursWeight,
    shiftsWeight: Number.isFinite(shiftsWeight) ? Math.max(shiftsWeight, 0) : DEFAULT_FORMULA.shiftsWeight,
    maxHours: Number.isFinite(maxHours) ? Math.max(maxHours, 1) : DEFAULT_FORMULA.maxHours
  };
}

function getEmployeeDayStatus(wageRecords, employees) {
  const recordsByEmployee = new Map(wageRecords.map((record) => [record.employee.toString(), record]));
  const statusMap = new Map();

  employees.forEach((employee) => {
    const record = recordsByEmployee.get(employee._id.toString());
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const leaveStatus = record?.leaveStatuses?.[dayIndex] || 'none';
      const hours = Number(record?.dailyHours?.[dayIndex]) || 0;
      let status = hours > 0 ? 'Working' : 'Off';
      if (leaveStatus === 'annual') status = 'Annual leave';
      if (leaveStatus === 'sick') status = 'Sick leave';
      if (leaveStatus === 'unpaid') status = 'Unpaid leave';
      statusMap.set(`${employee._id}:${dayIndex}`, status);
    }
  });

  return statusMap;
}

function isLeaveStatus(status) {
  return ['Annual leave', 'Sick leave', 'Unpaid leave'].includes(status);
}

function getRecommendations(templates, employees, assignments, formula, employeeDayStatus) {
  const templatesById = new Map(templates.map((template) => [template._id.toString(), template]));
  const employeeStats = new Map(employees.map((employee) => [employee._id.toString(), { hours: 0, shifts: 0 }]));
  const bookedDays = new Map();

  assignments.forEach((assignment) => {
    const employeeId = assignment.employee.toString();
    const template = templatesById.get(assignment.shiftTemplate.toString());
    const stats = employeeStats.get(employeeId);
    if (!stats || !template) {
      return;
    }
    stats.hours += getShiftHours(template);
    stats.shifts += 1;
    if (!bookedDays.has(employeeId)) {
      bookedDays.set(employeeId, new Set());
    }
    bookedDays.get(employeeId).add(assignment.dayIndex);
  });

  const recommendations = new Map();
  templates.forEach((template) => {
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const candidates = employees
        .filter((employee) => employee.department === template.department)
        .filter((employee) => !employeeDayStatus.get(`${employee._id}:${dayIndex}`)?.endsWith('leave'))
        .filter((employee) => !bookedDays.get(employee._id.toString())?.has(dayIndex))
        .sort((left, right) => {
          const leftStats = employeeStats.get(left._id.toString());
          const rightStats = employeeStats.get(right._id.toString());
          const leftScore = (leftStats.hours / formula.maxHours) * formula.hoursWeight
            + (leftStats.shifts / 7) * formula.shiftsWeight;
          const rightScore = (rightStats.hours / formula.maxHours) * formula.hoursWeight
            + (rightStats.shifts / 7) * formula.shiftsWeight;
          return leftScore - rightScore || left.name.localeCompare(right.name);
        });

      if (candidates[0]) {
        recommendations.set(`${dayIndex}:${template._id}`, candidates[0]._id.toString());
      }
    }
  });

  return { recommendations, employeeStats };
}

async function getShifts(req, res) {
  const week = WageTracker.getSelectedWeek(req.query.week);
  const allEmployees = await Employee.find().sort({ name: 1 });
  const departments = [...new Set(allEmployees.map((employee) => employee.department))].sort();
  const department = getSelectedDepartment(req.query.department, departments);
  const employees = department === 'all'
    ? allEmployees
    : allEmployees.filter((employee) => employee.department === department);
  const templates = await ShiftTemplate.find({ active: true }).sort({ department: 1, startTime: 1, name: 1 });
  const wageRecords = await WageRecord.find({ week, periodType: 'weekly' });
  const employeeDayStatus = getEmployeeDayStatus(wageRecords, allEmployees);
  const schedule = await ShiftSchedule.findOne({ week }).lean();
  const assignments = (schedule?.assignments || []).filter((assignment) => {
    const templateExists = templates.some((template) => template._id.toString() === assignment.shiftTemplate.toString());
    const employeeStatus = employeeDayStatus.get(`${assignment.employee}:${assignment.dayIndex}`);
    return templateExists && !isLeaveStatus(employeeStatus);
  });
  const formula = getFormula(schedule);
  const assignmentMap = new Map(assignments.map((assignment) => [
    `${assignment.dayIndex}:${assignment.shiftTemplate.toString()}`,
    assignment.employee.toString()
  ]));
  const { recommendations, employeeStats } = getRecommendations(templates, allEmployees, assignments, formula, employeeDayStatus);
  const scheduledCount = assignments.filter((assignment) => employees.some(
    (employee) => employee._id.toString() === assignment.employee.toString()
  )).length;
  const totalSlots = templates.length * 7;

  res.render('shifts', {
    week,
    weekLabel: WageTracker.getWeekDateRange(week),
    daysOfWeek: WageTracker.getDaysInWeek(week),
    department,
    departments,
    employees,
    allEmployees,
    templates,
    assignmentMap,
    recommendations,
    employeeStats,
    employeeDayStatus,
    formula,
    totalSlots,
    scheduledCount,
    pageTitle: 'Shift Scheduling',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

async function postShifts(req, res) {
  const week = WageTracker.getSelectedWeek(req.body.week);
  const templateIds = (await ShiftTemplate.find({ active: true })).map((template) => template._id.toString());
  const allEmployees = await Employee.find();
  const employeeIds = new Set(allEmployees.map((employee) => employee._id.toString()));
  const wageRecords = await WageRecord.find({ week, periodType: 'weekly' });
  const employeeDayStatus = getEmployeeDayStatus(wageRecords, allEmployees);
  const assignments = [];
  const submittedSchedule = req.body.schedule || {};

  Object.entries(submittedSchedule).forEach(([templateId, days]) => {
    if (!templateIds.includes(templateId) || !days || typeof days !== 'object') {
      return;
    }
    Object.entries(days).forEach(([dayIndex, employeeId]) => {
      const numericDay = Number(dayIndex);
      const employeeStatus = employeeDayStatus.get(`${employeeId}:${numericDay}`);
      if (employeeId && employeeIds.has(employeeId) && Number.isInteger(numericDay) && numericDay >= 0 && numericDay <= 6 && !isLeaveStatus(employeeStatus)) {
        assignments.push({ dayIndex: numericDay, shiftTemplate: templateId, employee: employeeId });
      }
    });
  });

  const formula = {
    hoursWeight: Math.max(Number.isFinite(Number(req.body.hoursWeight)) ? Number(req.body.hoursWeight) : DEFAULT_FORMULA.hoursWeight, 0),
    shiftsWeight: Math.max(Number.isFinite(Number(req.body.shiftsWeight)) ? Number(req.body.shiftsWeight) : DEFAULT_FORMULA.shiftsWeight, 0),
    maxHours: Math.max(Number.isFinite(Number(req.body.maxHours)) ? Number(req.body.maxHours) : DEFAULT_FORMULA.maxHours, 1)
  };
  await ShiftSchedule.findOneAndUpdate(
    { week },
    { week, assignments, formula },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  const departmentQuery = req.body.department && req.body.department !== 'all'
    ? `&department=${encodeURIComponent(req.body.department)}`
    : '';
  res.redirect(`/employee/shifts?week=${encodeURIComponent(week)}${departmentQuery}`);
}

async function postShiftTemplate(req, res) {
  const templateData = {
    name: req.body.name,
    department: req.body.department,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    breakMinutes: req.body.breakMinutes,
    color: req.body.color || '#2563eb'
  };
  if (req.body.templateId) {
    await ShiftTemplate.findByIdAndUpdate(req.body.templateId, templateData, { runValidators: true });
  } else {
    await ShiftTemplate.create(templateData);
  }
  res.redirect(`/employee/shifts?week=${encodeURIComponent(WageTracker.getSelectedWeek(req.body.week))}`);
}

module.exports = { getShifts, postShifts, postShiftTemplate };
