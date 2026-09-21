const express = require('express');
const payrollPayoutController = require('../controllers/payrollPayout');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

router.use(isAuth);
router.get('/', payrollPayoutController.getPayrollPayout);

module.exports = router;
