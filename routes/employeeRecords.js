const express = require('express');
const employeeController = require('../controllers/employeeRecords');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

router.use(isAuth);
router.get('/add-employee', employeeController.getAddEmployee);
router.post('/add-employee', employeeController.postAddEmployee);
router.get('/records', employeeController.getEmployeeRecords);
router.get('/edit/:employeeId', employeeController.getEditEmployee);
router.post('/edit/:employeeId', employeeController.postEditEmployee);
router.post('/delete/:employeeId', employeeController.postDeleteEmployee);

module.exports = router;
