const express = require('express');
const homeController = require('../controllers/home');

const router = express.Router();

router.get('/', homeController.getHome);
router.post('/', homeController.postHomeFigures);
router.post('/tips', homeController.postTips);

module.exports = router;