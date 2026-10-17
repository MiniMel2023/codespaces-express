const express = require('express');
const supplierDetailsController = require('../controllers/supplierDetails');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

router.use(isAuth);
router.get('/add', supplierDetailsController.getAddSupplier);
router.post('/add', supplierDetailsController.postAddSupplier);
router.get('/', supplierDetailsController.getSupplierDetails);
router.get('/edit/:supplierId', supplierDetailsController.getEditSupplier);
router.post('/edit/:supplierId', supplierDetailsController.postEditSupplier);
router.post('/delete/:supplierId', supplierDetailsController.postDeleteSupplier);


module.exports = router;