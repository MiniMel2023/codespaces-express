const express = require('express');
const router = express.Router();

function getHome(req, res) {
  res.render('homeDashboard', {
    message: 'Running on GitHub Codespaces!',
    pageTitle: 'Home Dashboard',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
}

module.exports = { getHome };






