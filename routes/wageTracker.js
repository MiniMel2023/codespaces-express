const express = require('express');
const wageTrackerController = require('../controllers/wageTracker');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

router.use(isAuth);
router.get('/', wageTrackerController.getWageTracker);
router.post('/', wageTrackerController.postWageRecord);

module.exports = router;