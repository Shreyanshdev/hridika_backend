const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const verifyToken = require('../middlewares/authMiddleware');
const upload = require('../middleware/upload');

// Public
router.get('/products', productController.getProductsDash); // In Python: @app.route('/products', methods=['GET']) -> get_products_dash
router.get('/api/products', productController.getProducts); // @app.route('/api/products') -> get_products (with price)
router.get('/products/:id', productController.getProduct);
// Note: Python had @app.route('/products/<int:id>', methods=['GET']) -> get_product
// But it also had logic inside that returned detailed info with price.
// Wait, looking at app.py:
// Line 810: @app.route('/products/<int:id>', methods=['GET'])
// logic: joins with metal_rates, calculates price. 
// My controller impl matches this.

router.get('/categories', productController.getCategories);
router.get('/products/category/:category', productController.getProductsByCategory);

// Protected (Admin)
// upload.array('images', 10) allows up to 10 image files per product
router.post('/products', verifyToken, upload.array('images', 10), productController.createProduct);
router.put('/products/:id', verifyToken, upload.array('images', 10), productController.updateProduct);
router.delete('/products/:id', verifyToken, productController.deleteProduct);

module.exports = router;
