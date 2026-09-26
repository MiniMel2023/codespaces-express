const Employee = require('../models/employees');
const WageRecord = require('../models/wageRecords');
const TipRecord = require('../models/tipRecords');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const {
  getSelectedWeek,
  getDaysInWeek,
  getWeekDateRange,
  getSelectedDepartment
} = require('./wageTracker');

const KITCHEN_DEPARTMENTS = ['Kitchen', 'Kitchen Supervisor'];
const PAYSLIP_DOCUMENT_TEMPLATE = path.join(__dirname, '..', 'templates', 'Payslip_BootleggerTemplate.doc');
const LEGACY_PAYSLIP_TEMPLATE = path.join(__dirname, '..', 'templates', 'Payslip_BootleggerTemplate.pdf');

function isValidDateQuery(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function getWeekForDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getDatesForPeriod(dateValue, period) {
  const selectedDate = new Date(`${dateValue}T00:00:00Z`);
  if (period === 'daily') {
    return [{ date: dateValue, label: selectedDate.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), dateLabel: selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }];
  }

  const start = new Date(selectedDate);
  if (period === 'monthly') {
    start.setUTCDate(1);
  } else {
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
  }
  const end = new Date(start);
  if (period === 'monthly') {
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  } else {
    end.setUTCDate(end.getUTCDate() + 6);
  }

  const dates = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push({
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
      dateLabel: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    });
  }
  return dates;
}

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

async function getPayoutData(week, tipsMonth, department = 'all') {
  const allEmployees = await Employee.find().sort({ name: 1 });
  const departments = [...new Set(allEmployees.map((employee) => employee.department))].sort();
  const selectedDepartment = getSelectedDepartment(department, departments);
  const employees = selectedDepartment === 'all'
    ? allEmployees
    : allEmployees.filter((employee) => employee.department === selectedDepartment);
  const employeeIds = new Set(employees.map((employee) => employee._id.toString()));
  const tipPeriod = getTipPeriod(tipsMonth);
  const [wageRecords, tipRecords] = await Promise.all([
    WageRecord.find({ periodType: 'weekly', week }),
    TipRecord.find({ periodKey: tipPeriod.periodKey })
  ]);
  const wagesByEmployee = new Map(wageRecords.map((record) => [record.employee.toString(), record]));
  const tipsByEmployee = new Map(tipRecords.map((record) => [record.employee.toString(), record]));
  const waiterTips = allEmployees
    .filter((employee) => employee.department === 'Waiter')
    .reduce((total, employee) => total + (Number(tipsByEmployee.get(employee._id.toString())?.amount) || 0), 0);
  const kitchenEmployees = allEmployees.filter((employee) => KITCHEN_DEPARTMENTS.includes(employee.department));
  const kitchenTipShare = kitchenEmployees.length > 0 ? waiterTips * 0.1 / kitchenEmployees.length : 0;

  const payoutRows = employees.map((employee) => {
    const employeeId = employee._id.toString();
    const wageRecord = employeeIds.has(employeeId) ? wagesByEmployee.get(employeeId) : null;
    const tipRecord = tipsByEmployee.get(employeeId);
    const wageAmount = wageRecord ? Number(wageRecord.totalWage) || 0 : 0;
    const recordedTipAmount = tipRecord ? Number(tipRecord.amount) || 0 : 0;
    const tipAmount = employee.department === 'Waiter'
      ? recordedTipAmount * 0.9
      : employee.department === 'Barista'
        ? recordedTipAmount
        : KITCHEN_DEPARTMENTS.includes(employee.department)
          ? kitchenTipShare
          : 0;

    return {
      employee,
      wageRecord,
      wageAmount,
      tipAmount,
      totalPayout: wageAmount + tipAmount
    };
  });

  return {
    departments,
    department: selectedDepartment,
    tipPeriod,
    payoutRows,
    totalWages: payoutRows.reduce((total, row) => total + row.wageAmount, 0),
    totalTips: payoutRows.reduce((total, row) => total + row.tipAmount, 0),
    totalPayout: payoutRows.reduce((total, row) => total + row.totalPayout, 0)
  };
}

async function getPayrollPayout(req, res) {
  const week = getSelectedWeek(req.query.week);
  const tipsMonth = /^\d{4}-\d{2}$/.test(req.query.tipsMonth || '')
    ? req.query.tipsMonth
    : new Date().toISOString().slice(0, 7);
  const payoutData = await getPayoutData(week, tipsMonth, req.query.department);

  res.render('payrollPayout', {
    week,
    weekLabel: getWeekDateRange(week),
    tipsMonth,
    tipPeriodLabel: payoutData.tipPeriod.periodLabel,
    department: payoutData.department,
    departments: payoutData.departments,
    payoutRows: payoutData.payoutRows,
    totalWages: payoutData.totalWages,
    totalTips: payoutData.totalTips,
    totalPayout: payoutData.totalPayout,
    pageTitle: 'Payroll Payout',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

function formatPdfDate(value) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function formatMoney(value) {
  return `R ${(Number(value) || 0).toFixed(2)}`;
}

async function createFallbackPayslipPdf({ employee, row, wageRecord, week, grossSalary, hoursWorked, workDays, leaveTaken, leaveRemaining, monthName }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;

  page.drawText('Payslip', { x: margin, y: 780, size: 24, font: boldFont });
  page.drawText(`Week: ${week}`, { x: margin, y: 748, size: 11, font: regularFont });
  page.drawText(`Employee: ${employee.name}`, { x: margin, y: 726, size: 12, font: boldFont });
  page.drawText(`Department: ${employee.department}`, { x: margin, y: 706, size: 11, font: regularFont });
  page.drawText(`ID Number: ${employee.IDnumber ?? ''}`, { x: margin, y: 686, size: 11, font: regularFont });
  page.drawText(`Tax No: ${employee.incomeTaxNo ?? ''}`, { x: margin, y: 666, size: 11, font: regularFont });
  page.drawText(`Bank: ${employee.bankingDetails?.bankName ?? ''}`, { x: margin, y: 646, size: 11, font: regularFont });
  page.drawText(`Account: ${employee.bankingDetails?.accountNumber ?? ''}`, { x: margin, y: 626, size: 11, font: regularFont });
  page.drawText(`Branch: ${employee.bankingDetails?.branchCode ?? ''}`, { x: margin, y: 606, size: 11, font: regularFont });
  page.drawText(`UIF: ${employee.UIFregNo ?? ''}`, { x: margin, y: 586, size: 11, font: regularFont });
  page.drawText(`Hire Date: ${employee.hireDate ? formatPdfDate(employee.hireDate) : ''}`, { x: margin, y: 566, size: 11, font: regularFont });
  page.drawText(`Salary / hour: ${formatMoney(employee.salaryPerHour)}`, { x: margin, y: 546, size: 11, font: regularFont });

  page.drawText('Hours worked', { x: margin, y: 500, size: 11, font: boldFont });
  page.drawText(String(hoursWorked.toFixed(2)), { x: 220, y: 500, size: 11, font: regularFont });
  page.drawText('Wage', { x: margin, y: 480, size: 11, font: boldFont });
  page.drawText(formatMoney(row.wageAmount), { x: 220, y: 480, size: 11, font: regularFont });
  page.drawText('Tips', { x: margin, y: 460, size: 11, font: boldFont });
  page.drawText(formatMoney(row.tipAmount), { x: 220, y: 460, size: 11, font: regularFont });
  page.drawText('Gross Salary', { x: margin, y: 440, size: 12, font: boldFont });
  page.drawText(formatMoney(grossSalary), { x: 220, y: 440, size: 12, font: boldFont });

  page.drawText(`Work Days ${monthName}`, { x: 335, y: 500, size: 11, font: regularFont });
  page.drawText(String(workDays), { x: 510, y: 500, size: 11, font: regularFont });
  page.drawText(`OFF Days ${monthName}`, { x: 335, y: 480, size: 11, font: regularFont });
  page.drawText(String(Math.max(0, 7 - workDays)), { x: 510, y: 480, size: 11, font: regularFont });
  page.drawText('Annual leave / month', { x: 335, y: 460, size: 11, font: regularFont });
  page.drawText(String((Number(employee.annualLeaveDaysPerYear) || 0) / 12), { x: 510, y: 460, size: 11, font: regularFont });
  page.drawText('Leave taken', { x: 335, y: 440, size: 11, font: regularFont });
  page.drawText(String(leaveTaken), { x: 510, y: 440, size: 11, font: regularFont });
  page.drawText('Leave remaining', { x: 335, y: 420, size: 11, font: regularFont });
  page.drawText(String(leaveRemaining), { x: 510, y: 420, size: 11, font: regularFont });

  return pdfDoc.save();
}

function drawPdfCell(page, font, value, options = {}) {
  const {
    x,
    y,
    width,
    height = 9,
    size = 7,
    minSize = 5,
    align = 'left',
    color = rgb(0.08, 0.08, 0.08)
  } = options;
  const padding = 1;
  const availableWidth = Math.max(width - padding * 2, 1);
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  let textSize = size;

  while (textSize > minSize && font.widthOfTextAtSize(text, textSize) > availableWidth) {
    textSize = Math.max(minSize, textSize - 0.25);
  }

  if (font.widthOfTextAtSize(text, textSize) > availableWidth) {
    const suffix = '...';
    let end = text.length;
    while (end > 0 && font.widthOfTextAtSize(`${text.slice(0, end)}${suffix}`, textSize) > availableWidth) {
      end -= 1;
    }
    text = end > 0 ? `${text.slice(0, end).trimEnd()}${suffix}` : '';
  }

  page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1) });

  const textWidth = font.widthOfTextAtSize(text, textSize);
  const textX = align === 'right'
    ? x + width - padding - textWidth
    : align === 'center'
      ? x + (width - textWidth) / 2
      : x + padding;
  const textY = y + Math.max((height - textSize) / 2, 0) + 1;
  page.drawText(text, { x: textX, y: textY, size: textSize, font, color });
}

async function getPayslipPdf(req, res) {
  const week = getSelectedWeek(req.query.week);
  const tipsMonth = /^\d{4}-\d{2}$/.test(req.query.tipsMonth || '')
    ? req.query.tipsMonth
    : new Date().toISOString().slice(0, 7);
  const payoutData = await getPayoutData(week, tipsMonth);
  const row = payoutData.payoutRows.find(({ employee }) => employee._id.toString() === req.params.employeeId);

  if (!row) {
    return res.status(404).render('404', {
      pageTitle: 'Payslip Not Found',
      path: req.path,
      isAuthenticated: req.session.isLoggedIn
    });
  }

  const employee = row.employee;
  const wageRecord = row.wageRecord;
  const grossSalary = row.totalPayout;
  const hoursWorked = Number(wageRecord?.hoursWorked) || 0;
  const workDays = (wageRecord?.dailyHours || []).filter((hours) => Number(hours) > 0).length;
  const leaveTaken = (wageRecord?.leaveStatuses || []).filter((status) => status !== 'none').length;
  const leaveRemaining = Math.max((Number(employee.annualLeaveDaysPerYear) || 0) - leaveTaken, 0);
  const monthName = new Date(`${tipsMonth}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });

  let pdfBytes;

  const templatePath = fs.existsSync(PAYSLIP_DOCUMENT_TEMPLATE)
    ? PAYSLIP_DOCUMENT_TEMPLATE
    : LEGACY_PAYSLIP_TEMPLATE;

  if (!fs.existsSync(templatePath)) {
    pdfBytes = await createFallbackPayslipPdf({
      employee,
      row,
      wageRecord,
      week,
      grossSalary,
      hoursWorked,
      workDays,
      leaveTaken,
      leaveRemaining,
      monthName
    });
  } else {
    try {
      const pdf = await PDFDocument.load(fs.readFileSync(templatePath));
      const page = pdf.getPages()[0];
      const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
      const drawCell = (font, value, x, y, width, options = {}) => drawPdfCell(page, font, value, {
        x,
        y,
        width,
        ...options
      });

      drawCell(boldFont, employee.name, 150, 648, 390, { height: 10 });
      drawCell(regularFont, getWeekDateRange(week), 160, 639, 390);

      drawCell(regularFont, employee.IDnumber, 172, 622, 110);
      drawCell(regularFont, employee.bankingDetails?.bankName, 464, 622, 75);
      drawCell(regularFont, employee.incomeTaxNo, 172, 614, 110);
      drawCell(regularFont, employee.bankingDetails?.accountNumber, 464, 614, 75);
      drawCell(regularFont, employee.UIFregNo, 172, 605, 110);
      drawCell(regularFont, employee.bankingDetails?.branchCode, 464, 605, 75);
      drawCell(regularFont, formatPdfDate(employee.hireDate), 172, 596, 110);
      drawCell(regularFont, formatMoney(employee.salaryPerHour), 464, 596, 75);

      drawCell(regularFont, hoursWorked.toFixed(2), 125, 527, 35, { align: 'right' });
      drawCell(regularFont, formatMoney(employee.salaryPerHour), 173, 527, 40, { align: 'right' });
      drawCell(regularFont, formatMoney(row.wageAmount), 220, 527, 35, { align: 'right' });
      drawCell(regularFont, 'Tips', 52, 518, 35);
      drawCell(regularFont, formatMoney(row.tipAmount), 220, 518, 35, { align: 'right' });
      drawCell(boldFont, formatMoney(grossSalary), 220, 501, 35, { align: 'right' });
      drawCell(regularFont, '0.00', 498, 527, 35, { align: 'right' });
      drawCell(boldFont, '0.00', 498, 501, 35, { align: 'right' });
      drawCell(boldFont, formatMoney(grossSalary), 494, 464, 40, { size: 9, align: 'right' });

      drawCell(regularFont, '0.00', 220, 413, 35, { align: 'right' });
      drawCell(regularFont, '0.00', 220, 404, 35, { align: 'right' });
      drawCell(regularFont, String(workDays), 468, 413, 75, { align: 'right' });
      drawCell(regularFont, String(Math.max(0, 7 - workDays)), 468, 404, 75, { align: 'right' });
      drawCell(regularFont, String((Number(employee.annualLeaveDaysPerYear) || 0) / 12), 530, 395, 25, { align: 'right' });
      drawCell(regularFont, String(leaveTaken), 530, 386, 25, { align: 'right' });
      drawCell(regularFont, String(leaveRemaining), 530, 378, 25, { align: 'right' });
      drawCell(regularFont, `Work Days ${monthName}`, 322, 413, 135);
      drawCell(regularFont, `OFF Days ${monthName}`, 322, 404, 135);

      pdfBytes = await pdf.save();
    } catch (error) {
      console.error('Error loading payslip template, using fallback PDF:', error);
      pdfBytes = await createFallbackPayslipPdf({
        employee,
        row,
        wageRecord,
        week,
        grossSalary,
        hoursWorked,
        workDays,
        leaveTaken,
        leaveRemaining,
        monthName
      });
    }
  }

  const filename = `payslip-${employee.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${week}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(Buffer.from(pdfBytes));
}

async function getTurnover(req, res) {
  const period = ['daily', 'weekly', 'monthly'].includes(req.query.period) ? req.query.period : 'daily';
  const selectedDate = isValidDateQuery(req.query.date)
    ? req.query.date
    : new Date().toISOString().slice(0, 10);
  const week = getWeekForDate(selectedDate);
  const allEmployees = await Employee.find().sort({ name: 1 });
  const departments = [...new Set(allEmployees.map((employee) => employee.department))].sort();
  const department = getSelectedDepartment(req.query.department, departments);
  const employees = department === 'all'
    ? allEmployees
    : allEmployees.filter((employee) => employee.department === department);
  const daysOfPeriod = getDatesForPeriod(selectedDate, period);
  const weeks = [...new Set(daysOfPeriod.map((day) => getWeekForDate(day.date)))];
  const monthDates = getDatesForPeriod(selectedDate, 'monthly');
  const selectedWeek = getWeekForDate(selectedDate);
  const monthWeeks = [...new Set(monthDates.map((day) => getWeekForDate(day.date)))];
  const wageWeeks = [...new Set([...weeks, selectedWeek, ...monthWeeks])];
  const wageRecords = await WageRecord.find({ periodType: 'weekly', week: { $in: wageWeeks } });
  const wagesByEmployeeAndWeek = new Map(wageRecords.map((record) => [`${record.employee.toString()}_${record.week}`, record]));

  const turnoverRows = employees.map((employee) => {
    const employeeId = employee._id.toString();
    const dailyTurnover = daysOfPeriod.map((day) => {
      const dayDate = new Date(`${day.date}T00:00:00Z`);
      const dayIndex = (dayDate.getUTCDay() + 6) % 7;
      const wageRecord = wagesByEmployeeAndWeek.get(`${employeeId}_${getWeekForDate(day.date)}`);
      return Number(wageRecord?.dailyTurnover?.[dayIndex]) || 0;
    });
    const totalTurnover = dailyTurnover.reduce((total, amount) => total + amount, 0);
    const turnoverTarget = (Number(employee.turnoverTarget) || 0) * (period === 'monthly' ? daysOfPeriod.length / 7 : period === 'daily' ? 1 / 7 : 1);

    return {
      employee,
      dailyTurnover,
      totalTurnover,
      turnoverTarget,
      targetVariance: totalTurnover - turnoverTarget,
      targetAchievement: turnoverTarget > 0 ? (totalTurnover / turnoverTarget) * 100 : null
    };
  });
  const dailyTotals = daysOfPeriod.map((day, index) => ({
    ...day,
    amount: turnoverRows.reduce((total, row) => total + row.dailyTurnover[index], 0)
  }));
  const totalTurnover = dailyTotals.reduce((total, day) => total + day.amount, 0);
  const selectedEmployeeIds = new Set(employees.map((employee) => employee._id.toString()));
  const getLabourCost = (recordWeeks) => wageRecords
    .filter((record) => selectedEmployeeIds.has(record.employee.toString()) && recordWeeks.includes(record.week))
    .reduce((total, record) => total + (Number(record.totalWage) || 0), 0);
  const weeklyLabourCost = getLabourCost([selectedWeek]);
  const monthlyLabourCost = getLabourCost(monthWeeks);
  const dailyLabourCost = weeklyLabourCost / 7;
  const totalTurnoverTarget = turnoverRows.reduce((total, row) => total + row.turnoverTarget, 0);

  res.render('turnover', {
    week,
    selectedDate,
    period,
    weekLabel: getWeekDateRange(week),
    department,
    departments,
    daysOfPeriod,
    turnoverRows,
    dailyTotals,
    totalTurnover,
    totalTurnoverTarget,
    targetAchievement: totalTurnoverTarget > 0 ? (totalTurnover / totalTurnoverTarget) * 100 : null,
    dailyLabourCost,
    weeklyLabourCost,
    monthlyLabourCost,
    averageDailyTurnover: daysOfPeriod.length > 0 ? totalTurnover / daysOfPeriod.length : 0,
    pageTitle: 'Turnover',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

module.exports = { getPayrollPayout, getPayslipPdf, getTurnover };
