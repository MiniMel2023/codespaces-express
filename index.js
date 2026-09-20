require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const homeRoutes = require('./controllers/home');

const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('Database connection error:', err));

// Routes
app.use('/', homeRoutes);


app.use((req, res) => {
  res.status(404).render('404', {
    pageTitle: 'Page Not Found',
    path: req.path,
    isAuthenticated: false
  });
});

// Port binding for Codespaces
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));