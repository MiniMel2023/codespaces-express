const express = require('express');
const router = express.Router();
const Employee = require('../models/employees');

function getSelectedDepartment(department, departments) {
  return department && departments.includes(department) ? department : 'all';
}

function getAddEmployee(req, res) {
  res.render('addEmployee', {
    message: 'Add a new employee.',
    pageTitle: 'Add Employee',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

function postAddEmployee(req, res) {
  const {
    name,
    department,
    salaryPerHour,
    hireDate,
    IDnumber,
    incomeTaxNo,
    bankingDetails
  } = req.body;

  const newEmployee = new Employee({
    name,
    department,
    salaryPerHour,
    hireDate,
    IDnumber,
    incomeTaxNo,
    bankingDetails
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

async function getEmployeeRecords(req, res) {
  try {
    const allEmployees = await Employee.find().sort({ name: 1 });
    const departments = [...new Set(allEmployees.map((employee) => employee.department))].sort();
    const department = getSelectedDepartment(req.query.department, departments);
    const employees = department === 'all'
      ? allEmployees
      : allEmployees.filter((employee) => employee.department === department);

      res.render('employeeRecord', {
        employees,
        department,
        departments,
        pageTitle: 'Employee Records',
        path: req.path,
        isAuthenticated: req.session.isLoggedIn
      });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving employee records');
  }
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
  const {
    name,
    department,
    salaryPerHour,
    hireDate,
    IDnumber,
    incomeTaxNo,
    bankingDetails
  } = req.body;

  Employee.findByIdAndUpdate(
    req.params.employeeId,
    {
      name,
      department,
      salaryPerHour,
      hireDate,
      IDnumber,
      incomeTaxNo,
      bankingDetails
    },
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