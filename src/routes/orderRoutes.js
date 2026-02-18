const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const verifyToken = require('../middlewares/authMiddleware');

router.post('/orders', verifyToken, orderController.createOrder);
router.post('/verify-payment', verifyToken, orderController.verifyPayment);
router.get('/orders', verifyToken, orderController.getOrders); // @app.route('/orders')
router.get('/api/orders/:order_id', verifyToken, orderController.getOrderDetails); // @app.route('/api/orders/<int:order_id>')

module.exports = router;
