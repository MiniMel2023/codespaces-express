const Supplier = require('../models/supplier');

function getSelectedCategory(category, categories) {
  return typeof category === 'string' && categories.includes(category)
    ? category
    : 'all';
}

function getAddSupplier(req, res) {
  res.render('addSupplier', {
    message: 'Add a new supplier.',
    pageTitle: 'Add Supplier',
    path: req.path,
    basePath: req.baseUrl,
    isAuthenticated: req.session.isLoggedIn
  });
}

function postAddSupplier(req, res) {
  const {
    name,
    category,
    customerAccountNumber,
    contactPerson,
    contactEmail,
    phoneOne,
    phoneTwo,
    deliveryDays,
    orderLeadTime,
    MOQWithoutDeliveryFee,
    OnlineOrderPlattform,
    platformPassword,
    orderEmail,
    orderEmail2,
    paymentTerms,
    accountingContact,
    accountingEmail,
    accountingPhone,
    bankingDetails
  } = req.body;

  const newSupplier = new Supplier({
    name,
    category,
    customerAccountNumber,
    contactPerson,
    contactEmail,
    phoneOne,
    phoneTwo,
    deliveryDays,
    orderLeadTime,
    MOQWithoutDeliveryFee,
    OnlineOrderPlattform,
    platformPassword,
    orderEmail,
    orderEmail2,
    paymentTerms,
    accountingContact,
    accountingEmail,
    accountingPhone,
    bankingDetails
  });

  newSupplier.save()
    .then(() => {
      res.redirect(req.baseUrl);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).render('addSupplier', {
        message: 'Error adding supplier!',
        pageTitle: 'Add Supplier',
        path: `${req.baseUrl}/add`,
        basePath: req.baseUrl,
        isAuthenticated: req.session.isLoggedIn
      });
    });
}

async function getSupplierDetails(req, res) {
  try {
    const allSuppliers = await Supplier.find().sort({ name: 1 });
    const categories = [...new Set(
      allSuppliers
        .map((supplier) => supplier.category)
        .filter((category) => typeof category === 'string' && category.length > 0)
    )].sort();
    const category = getSelectedCategory(req.query.category, categories);
    const suppliers = category === 'all'
      ? allSuppliers
      : allSuppliers.filter((supplier) => supplier.category === category);

    res.render('supplierDetailsDashboard', {
      suppliers,
      category,
      categories,
      pageTitle: 'Supplier Details',
      path: req.path,
      basePath: req.baseUrl,
      isAuthenticated: req.session.isLoggedIn
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving supplier records');
  }
}

function getEditSupplier(req, res) {
  Supplier.findById(req.params.supplierId)
    .then((supplier) => {
      if (!supplier) {
        return res.status(404).send('Supplier not found');
      }

      res.render('editSupplier', {
        supplier,
        pageTitle: 'Edit Supplier',
        path: req.path,
        basePath: req.baseUrl,
        isAuthenticated: req.session.isLoggedIn
      });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send('Error loading supplier');
    });
}

function postEditSupplier(req, res) {
  const {
    name,
    category,
    customerAccountNumber,
    contactPerson,
    contactEmail,
    phoneOne,
    phoneTwo,
    deliveryDays,
    orderLeadTime,
    MOQWithoutDeliveryFee,
    OnlineOrderPlattform,
    platformPassword,
    orderEmail,
    orderEmail2,
    paymentTerms,
    accountingContact,
    accountingEmail,
    accountingPhone,
    bankingDetails
  } = req.body;

  Supplier.findByIdAndUpdate(
    req.params.supplierId,
  {
    name,
    category,
    customerAccountNumber,
    contactPerson,
    contactEmail,
    phoneOne,
    phoneTwo,
    deliveryDays,
    orderLeadTime,
    MOQWithoutDeliveryFee,
    OnlineOrderPlattform,
    platformPassword,
    orderEmail,
    orderEmail2,
    paymentTerms,
    accountingContact,
    accountingEmail,
    accountingPhone,
    bankingDetails
    },
    { new: true, runValidators: true }
  )
    .then((supplier) => {
      if (!supplier) {
        return res.status(404).send('Supplier not found');
      }

      res.redirect(req.baseUrl);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send('Error updating supplier');
    });
}

function postDeleteSupplier(req, res) {
  Supplier.findByIdAndDelete(req.params.supplierId)
    .then((supplier) => {
      if (!supplier) {
        return res.status(404).send('Supplier not found');
      }

      res.redirect(req.baseUrl);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send('Error deleting supplier');
    });
}

module.exports = {
  getAddSupplier,
  postAddSupplier,
  getSupplierDetails,
  getEditSupplier,
  postEditSupplier,
  postDeleteSupplier
};