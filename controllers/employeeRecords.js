const express = require('express');
const router = express.Router();
const Employee = require('../models/employees');

function getAddEmployee(req, res) {
  res.render('addEmployee', {
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
      res.status(500).render('addEmployee', {
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

function getEditEmployee(req, res) {
  Employee.findById(req.params.employeeId)
    .then((employee) => {
      if (!employee) {
        return res.status(404).send('Employee not found');
      }

      res.render('editEmployee', {
        employee,
        pageTitle: 'Edit Employee',
        path: req.path,
        isAuthenticated: req.session.isLoggedIn
      });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send('Error loading employee');
    });
}

function postEditEmployee(req, res) {
  const { name, position, department, salary, hireDate } = req.body;

  Employee.findByIdAndUpdate(
    req.params.employeeId,
    { name, position, department, salary, hireDate },
    { new: true, runValidators: true }
  )
    .then((employee) => {
      if (!employee) {
        return res.status(404).send('Employee not found');
      }

      res.redirect('/employee/records');
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send('Error updating employee');
    });
}

function postDeleteEmployee(req, res) {
  Employee.findByIdAndDelete(req.params.employeeId)
    .then(() => {
      res.redirect('/employee/records');
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send('Error deleting employee');
    });
}

module.exports = {
  getAddEmployee,
  postAddEmployee,
  getEmployeeRecords,
  getEditEmployee,
  postEditEmployee,
  postDeleteEmployee
};