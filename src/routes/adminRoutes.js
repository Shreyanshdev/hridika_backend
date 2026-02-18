const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const verifyToken = require('../middlewares/authMiddleware');

// In a real app, we'd check for req.user.role === 'admin'
router.get('/api/admin/users', verifyToken, adminController.getAllUsers);
router.get('/api/admin/orders', verifyToken, adminController.getOrdersAdmin);
router.get('/api/admin/orders/:order_id', verifyToken, adminController.getAdminOrderDetails);
router.put('/api/admin/orders/:order_id', verifyToken, adminController.updateOrderStatus);
router.get('/api/admin/metal-rates', verifyToken, adminController.getMetalRates);
router.post('/api/admin/metal-rates', verifyToken, adminController.updateMetalRate);
router.get('/api/bespoke-requests', verifyToken, adminController.getBespokeRequests);

module.exports = router;
