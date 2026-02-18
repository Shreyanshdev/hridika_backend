const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const verifyToken = require('../middlewares/authMiddleware');

router.post('/cart', verifyToken, cartController.addToCart);
router.get('/cart', verifyToken, cartController.getCart);
router.put('/cart/update', verifyToken, cartController.updateCartQuantity);
router.put('/cart/update/min', verifyToken, cartController.updateCartQuantityMin);
router.delete('/cart/:product_id', verifyToken, cartController.removeFromCart);

module.exports = router;
