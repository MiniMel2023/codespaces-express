const express = require('express');
const payrollController = require('../controllers/payroll');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

router.use(isAuth);
router.get('/payout', payrollController.getPayrollPayout);
router.get('/payout/:employeeId/pdf', payrollController.getPayslipPdf);
router.get('/turnover', payrollController.getTurnover);

module.exports = router;
