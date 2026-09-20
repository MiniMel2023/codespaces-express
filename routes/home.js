const express = require('express');
const router = express.Router();
const Employee = require('../models/employees');

// Home route
router.get('/', (req, res) => {
  res.render('homeDashboard', { message: 'Running on GitHub Codespaces!' });
});

router.post('/add-employee', (req, res) => {
  const { name, position, department, salary, hireDate } = req.body;          
  const newEmployee = new Employee({
    name,
    position,
    department,
    salary,
    hireDate
  });
  newEmployee.save()
    .then(() => {
      res.render('homeDashboard', { message: 'Employee added successfully!' });
    })
    .catch((err) => {
      console.error(err);
      res.render('homeDashboard', { message: 'Error adding employee!' });
    });
    res.redirect('/');
    });


module.exports = router;