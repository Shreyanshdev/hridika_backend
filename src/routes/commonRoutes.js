const express = require('express');
const router = express.Router();
const commonController = require('../controllers/commonController');
const verifyToken = require('../middlewares/authMiddleware');
const upload = require('../middleware/upload');

router.post('/sendmail', commonController.sendMail);
router.post('/api/contact', commonController.submitContact);
router.post('/api/newsletter/subscribe', commonController.subscribeNewsletter);
router.post('/api/bespoke-request', verifyToken, upload.single('image'), commonController.createBespokeRequest);

module.exports = router;
