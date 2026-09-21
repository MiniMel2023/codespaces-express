require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const homeDashboardRoutes = require('./routes/homeDashboard');
const employeeRoutes = require('./routes/employeeRecords');
const authRoutes = require('./routes/auth');

const User = require('./models/user');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error('MONGO_URI is required');
}

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'development-only-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));
app.use((req, res, next) => {
  res.locals.isAuthenticated = Boolean(req.session.isLoggedIn);
  res.locals.path = req.path;
  next();
});

// Routes
app.use('/home', homeDashboardRoutes);
app.use('/auth', authRoutes);
app.use('/employee', employeeRoutes);



app.use((req, res) => {
  res.status(404).render('404', {
    pageTitle: 'Page Not Found',
    path: req.path,
    isAuthenticated: req.session.isLoggedIn
  });
});

async function startServer() {
  await mongoose.connect(MONGO_URI);

  const adminEmail = process.env.ADMIN_EMAIL || 'test@test.com';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const user = await User.findOne({ email: adminEmail });

    if (!user) {
      await User.create({
        name: 'Administrator',
        email: adminEmail,
        password: passwordHash,
        permission: { isAdmin: true }
      });
    } else if (!user.password) {
      user.password = passwordHash;
      await user.save();
    }
  }

  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});