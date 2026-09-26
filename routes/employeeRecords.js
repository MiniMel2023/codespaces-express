const express = require('express');
const employeeController = require('../controllers/employeeRecords');
const shiftsController = require('../controllers/shifts');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

router.use(isAuth);
router.get('/add-employee', employeeController.getAddEmployee);
router.post('/add-employee', employeeController.postAddEmployee);
router.get('/records', employeeController.getEmployeeRecords);
router.get('/shifts', shiftsController.getShifts);
router.post('/shifts', shiftsController.postShifts);
router.post('/shifts/templates', shiftsController.postShiftTemplate);
router.get('/edit/:employeeId', employeeController.getEditEmployee);
router.post('/edit/:employeeId', employeeController.postEditEmployee);
router.post('/delete/:employeeId', employeeController.postDeleteEmployee);


module.exports = router;