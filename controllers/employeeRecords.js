const express = require('express');
const router = express.Router();
const Employee = require('../models/employees');

function getAddEmployee(req, res) {
  res.render('homeDashboard', {
    message: 'Add a new employee.',
    pageTitle: 'Add Employee',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

function postAddEmployee(req, res) {
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
      res.redirect('/employee/records');
    })
    .catch((err) => {
      console.error(err);
      res.status(500).render('homeDashboard', {
        message: 'Error adding employee!',
        pageTitle: 'Add Employee',
        path: '/employee/add-employee',
        isAuthenticated: req.session.isLoggedIn
      });
    });
}

function getEmployeeRecords(req, res) {
  Employee.find()
    .then((employees) => {
      res.render('employeeRecord', {
        employees,
        pageTitle: 'Employee Records',
        path: req.path,
        isAuthenticated: req.session.isLoggedIn
      });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send('Error retrieving employee records');
    });
}

module.exports = {
  getAddEmployee,
  postAddEmployee,
  getEmployeeRecords
};