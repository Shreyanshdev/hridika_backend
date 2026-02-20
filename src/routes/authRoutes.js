const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const verifyToken = require('../middlewares/authMiddleware');
const { verifyRefreshToken } = require('../middlewares/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/request-phone-otp', authController.requestPhoneOtp);
router.post('/verify-phone-otp', authController.verifyPhoneOtp);
router.post('/forgetpassword', authController.forgetPassword);
router.post('/verify-reset-otp', authController.verifyResetOtp);
router.post('/resetpassword', authController.resetPassword);

// Email OTP
router.post('/request-email-otp', authController.requestEmailOtp);
router.post('/verify-email-otp', authController.verifyEmailOtp);
router.post('/google-login', authController.googleLogin);
router.post('/google-verify', authController.verifyGoogleToken);

// Protected Routes
router.post('/refresh', verifyRefreshToken, authController.refresh);
router.get('/profile', verifyToken, authController.getProfile);
router.get('/profile/full', verifyToken, authController.getFullProfile);
router.put('/update-profile', verifyToken, authController.updateProfile);
router.get('/protected', verifyToken, (req, res) => {
    // Replicating @app.route('/protected') logic
    // current_user = get_jwt_identity() -> req.user_id
    return res.json({ logged_in_as: req.user_id });
});

module.exports = router;
