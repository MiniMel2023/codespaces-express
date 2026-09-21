const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/user');

function renderAuthPage(res, req, { pageTitle, path, mode, errorMessage, successMessage }) {
    res.render('auth', {
        pageTitle,
        path,
        mode,
        isAuthenticated: Boolean(req.session.isLoggedIn),
        errorMessage,
        successMessage
    });
}

function getLogin(req, res) {
    if (req.session.isLoggedIn) {
        return res.redirect('/home?alreadyLoggedIn=1');
    }

    const successMessage = req.query.loggedOut === '1'
        ? 'You have been logged out.'
        : req.session.successMessage;

    delete req.session.successMessage;

    renderAuthPage(res, req, {
        pageTitle: 'Login',
        path: '/auth/login',
        mode: 'login',
        errorMessage: undefined,
        successMessage
    });
}

function getSignup(req, res) {
    if (req.session.isLoggedIn) {
        return res.redirect('/home?alreadyLoggedIn=1');
    }

    renderAuthPage(res, req, {
        pageTitle: 'Sign Up',
        path: '/auth/signup',
        mode: 'signup',
        errorMessage: undefined,
        successMessage: undefined
    });
}

async function postLogin(req, res) {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password || '';
    let user;

    try {
        user = email ? await User.findOne({ email }) : null;
    } catch (err) {
        console.error(err);
        renderAuthPage(res, req, {
            pageTitle: 'Login',
            path: '/auth/login',
            mode: 'login',
            errorMessage: 'Unable to log in. Please try again.'
        });
        return;
    }

    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
        renderAuthPage(res, req, {
            pageTitle: 'Login',
            path: '/auth/login',
            mode: 'login',
            errorMessage: 'Invalid email or password'
        });
        return;
    }

    req.session.regenerate((err) => {
        if (err) {
            renderAuthPage(res, req, {
                pageTitle: 'Login',
                path: '/auth/login',
                mode: 'login',
                errorMessage: 'Unable to log in. Please try again.'
            });
            return;
        }

        req.session.isLoggedIn = true;
        req.session.userId = user._id.toString();
        res.redirect('/home');
    });
}

async function postSignup(req, res) {
    const name = req.body.name?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password || '';

    if (!name || !email || !password) {
        renderAuthPage(res, req, {
            pageTitle: 'Sign Up',
            path: '/auth/signup',
            mode: 'signup',
            errorMessage: 'Name, email, and password are required.'
        });
        return;
    }

    if (password.length < 6) {
        renderAuthPage(res, req, {
            pageTitle: 'Sign Up',
            path: '/auth/signup',
            mode: 'signup',
            errorMessage: 'Password must be at least 6 characters long.'
        });
        return;
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            renderAuthPage(res, req, {
                pageTitle: 'Sign Up',
                path: '/auth/signup',
                mode: 'signup',
                errorMessage: 'An account with that email already exists.'
            });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        await User.create({
            name,
            email,
            password: hashedPassword,
            permission: { isAdmin: false }
        });

        req.session.regenerate((err) => {
            if (err) {
                renderAuthPage(res, req, {
                    pageTitle: 'Sign Up',
                    path: '/auth/signup',
                    mode: 'signup',
                    errorMessage: 'Unable to create account. Please try again.'
                });
                return;
            }

            req.session.isLoggedIn = false;
            req.session.successMessage = 'Account created successfully. Please log in.';
            res.redirect('/auth/login');
        });
    } catch (err) {
        console.error(err);
        renderAuthPage(res, req, {
            pageTitle: 'Sign Up',
            path: '/auth/signup',
            mode: 'signup',
            errorMessage: 'Unable to create account. Please try again.'
        });
    }
}

function postLogout(req, res) {
    req.session.destroy((err) => {
        if (err) {
            res.status(500).send('Unable to log out');
            return;
        }

        res.clearCookie('connect.sid');
        res.redirect('/auth/login?loggedOut=1');
    });
}

module.exports = { getLogin, getSignup, postLogin, postSignup, postLogout };