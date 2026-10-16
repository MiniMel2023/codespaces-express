const express = require('express');
const profitLossController = require('../controllers/profitLoss');

const router = express.Router();

router.get('/', profitLossController.getProfitLoss);
router.get('/expenses', profitLossController.getExpenseProjection);
router.post('/expenses', profitLossController.postExpense);
router.post('/expenses/:expenseId/delete', profitLossController.deleteExpense);

module.exports = router;