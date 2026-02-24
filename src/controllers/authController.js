const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const config = require('../config/config');
const emailService = require('../utils/emailService');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');

// In-memory store for phone and email OTPs
const phoneOtpStore = {};
const emailOtpStore = {};
const resetOtpStore = {};

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


const generateTokens = (userId) => {
    const accessToken = jwt.sign({ sub: userId, type: 'access' }, config.jwt.secret, { expiresIn: config.jwt.accessExpires });
    const refreshToken = jwt.sign({ sub: userId, type: 'refresh' }, config.jwt.secret, { expiresIn: config.jwt.refreshExpires });
    return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
    try {
        const { username, email, password, phone } = req.body;
        let user_id = req.body.user_id || username;

        if (!username || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Check existing user
        const [existing] = await db.query("SELECT * FROM users WHERE username=? OR email=?", [username, email]);
        if (existing.length > 0) {
            return res.status(409).json({ message: "User already exists. Please login." });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Python used create_access_token(identity=user_id) 
        // And user_id in DB is distinct, but here logic says user_id = data.get('user_id') or username
        // So if no user_id sent, username is used as ID.

        await db.query(
            `INSERT INTO users (user_id, username, password, org_password, email, role, Phone) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, username, hashedPassword, password, email, 'user', phone || null]
        );


        // Send Welcome Email (Non-blocking)
        emailService.sendWelcomeEmail(email).catch(e => console.error("Welcome email failed", e));

        const { accessToken, refreshToken } = generateTokens(user_id);

        return res.status(201).json({
            message: "User registered successfully",
            access_token: accessToken,
            refresh_token: refreshToken,
            user: {
                user_id: user_id,
                username: username,
                email: email,
                phone: phone || null,
                role: "user"
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Registration failed", error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }

        if (email.trim() === "admin123@gmail.com") {
            await db.query("UPDATE users SET role='admin' WHERE email=?", [email]);
        }

        const [users] = await db.query("SELECT * FROM users WHERE email=?", [email]);
        const user = users[0];

        if (user && await bcrypt.compare(password, user.password)) {
            // Python code specifically logs in with user['user_id'] as identity
            const { accessToken, refreshToken } = generateTokens(user.user_id);


            return res.status(200).json({
                access_token: accessToken,
                refresh_token: refreshToken,
                user: {
                    id: user.username,
                    username: user.username,
                    email: user.email,
                    phone: user.Phone || null,
                    role: user.role
                }
            });
        }

        return res.status(401).json({ msg: "Invalid email or password" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};

exports.refresh = async (req, res) => {
    const userId = req.user_id;
    const newAccessToken = jwt.sign({ sub: userId, type: 'access' }, config.jwt.secret, { expiresIn: config.jwt.accessExpires });
    return res.status(200).json({ access_token: newAccessToken });
};

const messageCentralService = require('../utils/messageCentralService');

exports.requestPhoneOtp = async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });

    // Use Message Central to SEND OTP
    const result = await messageCentralService.sendSmsOtp(phone);

    if (result.success && result.verificationId) {
        const sessionToken = uuidv4();
        // Store verificationId mapped to sessionToken
        phoneOtpStore[sessionToken] = {
            phone,
            verificationId: result.verificationId,
            expires: Date.now() + 300000 // 5 mins (failsafe, though MC handles expiry too)
        };

        return res.json({
            message: "OTP sent via SMS",
            sessionToken: sessionToken
        });
    } else {
        // Fallback for dev/testing if credentials fail or not set
        // Remove this in pure production if strict
        if (!process.env.MESSAGE_CENTRAL_AUTH_TOKEN) {
            const sessionToken = uuidv4();
            const otp = Math.floor(1000 + Math.random() * 9000);
            phoneOtpStore[sessionToken] = {
                phone,
                otp, // Local OTP
                type: 'local',
                expires: Date.now() + 300000
            };
            return res.json({
                message: "OTP sent (Dev Mode)",
                otp, // Send back for dev
                sessionToken
            });
        }

        return res.status(500).json({ error: "Failed to send OTP via SMS Provider" });
    }
};

exports.verifyPhoneOtp = async (req, res) => {
    try {
        const { otp, sessionToken, context } = req.body;
        if (!otp || !sessionToken) return res.status(400).json({ msg: "missing_data" });

        const data = phoneOtpStore[sessionToken];
        if (!data) return res.status(400).json({ msg: "expired" });

        if (Date.now() > data.expires) return res.status(400).json({ msg: "expired" });

        let isVerified = false;

        if (data.type === 'local') {
            if (Number(otp) === data.otp) isVerified = true;
        } else if (data.verificationId) {
            const mcResult = await messageCentralService.verifySmsOtp(data.verificationId, otp, data.phone);
            if (mcResult.success) isVerified = true;
        }

        if (!isVerified) {
            return res.status(400).json({ msg: "invalid" });
        }

        const phone = data.phone;
        delete phoneOtpStore[sessionToken];

        // If context is "login", look up user by phone and return tokens
        if (context === 'login') {
            const [users] = await db.query("SELECT * FROM users WHERE Phone=?", [phone]);
            if (users.length > 0) {
                const user = users[0];
                const { accessToken, refreshToken } = generateTokens(user.user_id);
                return res.status(200).json({
                    message: "Login successful",
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    user: {
                        id: user.username,
                        username: user.username,
                        email: user.email,
                        phone: user.Phone || null,
                        role: user.role
                    }
                });
            } else {
                return res.status(404).json({ msg: "user_not_found", verified: true });
            }
        }

        // Default: just verification (for registration / profile update)
        return res.status(200).json({
            message: "Phone verification successful",
            verified: true
        });

    } catch (error) {
        console.error("OTP Error:", error);
        return res.status(500).json({ msg: "error", error: error.message });
    }
};

exports.forgetPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ msg: "email is required" });

        const [users] = await db.query("SELECT user_id FROM users WHERE LOWER(email)=?", [email.toLowerCase()]);
        if (users.length === 0) return res.status(404).json({ msg: "No account found with this email" });

        const otp = Math.floor(100000 + Math.random() * 900000);
        resetOtpStore[email.toLowerCase()] = {
            otp,
            userId: users[0].user_id,
            expires: Date.now() + 600000 // 10 mins
        };

        await emailService.sendResetOtpEmail(email, otp);

        return res.status(200).json({ msg: "OTP sent to your email" });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ msg: "internal server error" });
    }
};

exports.verifyResetOtp = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) return res.status(400).json({ msg: "email, otp and newPassword required" });

        const data = resetOtpStore[email.toLowerCase()];
        if (!data) return res.status(400).json({ msg: "expired" });
        if (Date.now() > data.expires) {
            delete resetOtpStore[email.toLowerCase()];
            return res.status(400).json({ msg: "expired" });
        }
        if (Number(otp) !== data.otp) return res.status(400).json({ msg: "invalid" });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query(
            "UPDATE users SET password=?, org_password=?, reset_token=NULL, reset_token_expiry=NULL WHERE user_id=?",
            [hashedPassword, newPassword, data.userId]
        );

        delete resetOtpStore[email.toLowerCase()];

        return res.status(200).json({ msg: "Password reset successful" });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ msg: "internal server error" });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ msg: "token and new_password required" });

        const [users] = await db.query("SELECT user_id FROM users WHERE reset_token=? AND reset_token_expiry > NOW()", [token]);
        const user = users[0];

        if (!user) return res.status(400).json({ msg: "Invalid or expired token" });

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
            "UPDATE users SET password=?, org_password=?, reset_token=NULL, reset_token_expiry=NULL WHERE user_id=?",
            [hashedPassword, password, user.user_id]
        );

        return res.status(200).json({ msg: "Password reset successful" });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ msg: "internal server error" });
    }
};

exports.getProfile = async (req, res) => {
    return res.status(200).json({ user_id: req.user_id });
};

exports.requestEmailOtp = async (req, res) => {
    const { email, context } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    // Skip "already registered" check when context is 'update' (user is updating their own email)
    if (context !== 'update') {
        const existingUser = await db.query("SELECT * FROM users WHERE email=?", [email]);
        if (existingUser[0].length > 0) {
            return res.status(409).json({ message: "Email already registered" });
        }
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    emailOtpStore[email] = {
        otp,
        expires: Date.now() + 600000 // 10 mins
    };


    // Send via email service
    await emailService.sendOtpEmail(email, otp);

    return res.json({ message: "OTP sent to email" });
};

exports.verifyEmailOtp = async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ msg: "missing_data" });

    const data = emailOtpStore[email];
    if (!data) return res.status(400).json({ msg: "expired" });

    if (Date.now() > data.expires) return res.status(400).json({ msg: "expired" });
    if (Number(otp) !== data.otp) return res.status(400).json({ msg: "invalid" });

    delete emailOtpStore[email];
    return res.json({ message: "Email verified successfully" });
};

exports.getFullProfile = async (req, res) => {
    try {
        const userId = req.user_id;
        const [users] = await db.query("SELECT user_id, username, email, Phone, role, created_at FROM users WHERE user_id=?", [userId]);
        if (users.length === 0) return res.status(404).json({ error: "User not found" });
        const user = users[0];
        console.log("DB User from getFullProfile:", user);
        return res.status(200).json({
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            phone: user.Phone,
            role: user.role,
            created_at: user.created_at
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user_id;
        const { username, email, phone } = req.body;

        if (!username && !email && !phone) {
            return res.status(400).json({ error: "At least one field is required" });
        }

        // Check if email is already taken by another user
        if (email) {
            const [existing] = await db.query("SELECT user_id FROM users WHERE email=? AND user_id != ?", [email, userId]);
            if (existing.length > 0) {
                return res.status(409).json({ error: "Email already in use by another account" });
            }
        }

        // Check if phone is already taken by another user
        if (phone) {
            const [existing] = await db.query("SELECT user_id FROM users WHERE Phone=? AND user_id != ?", [phone, userId]);
            if (existing.length > 0) {
                return res.status(409).json({ error: "Phone number already in use by another account" });
            }
        }

        // Build dynamic update query
        const fields = [];
        const values = [];
        if (username) { fields.push("username=?"); values.push(username); }
        if (email) { fields.push("email=?"); values.push(email); }
        if (phone) { fields.push("Phone=?"); values.push(phone); }

        values.push(userId);

        await db.query(`UPDATE users SET ${fields.join(", ")} WHERE user_id=?`, values);

        // Fetch updated user
        const [updated] = await db.query("SELECT user_id, username, email, Phone, role, created_at FROM users WHERE user_id=?", [userId]);
        const user = updated[0];

        return res.status(200).json({
            message: "Profile updated successfully",
            user: {
                user_id: user.user_id,
                username: user.username,
                email: user.email,
                phone: user.Phone,
                role: user.role,
                created_at: user.created_at
            }
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

exports.googleLogin = async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const { name, email, sub } = ticket.getPayload(); // sub is google user id

        let [users] = await db.query("SELECT * FROM users WHERE email=?", [email]);
        let user = users[0];

        if (!user) {
            // Create new user if not exists
            const randomPassword = crypto.randomBytes(16).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            // Generate a username from email if needed, or use name
            // Ensuring uniqueness might be needed, but for now simple approach:
            const username = name || email.split('@')[0];

            await db.query(
                `INSERT INTO users (user_id, username, password, org_password, email, role) VALUES (?, ?, ?, ?, ?, ?)`,
                [sub, username, hashedPassword, randomPassword, email, 'user']
            );

            [users] = await db.query("SELECT * FROM users WHERE email=?", [email]);
            user = users[0];
        }

        const { accessToken, refreshToken } = generateTokens(user.user_id);

        return res.status(200).json({
            message: "Login successful",
            access_token: accessToken,
            refresh_token: refreshToken,
            user: {
                id: user.username,
                username: user.username,
                email: user.email,
                phone: user.Phone || null,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Google Login Error:", error);
        return res.status(401).json({ message: "Google login failed", error: error.message });
    }
};
exports.verifyGoogleToken = async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        return res.json({
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
            email_verified: payload.email_verified
        });
    } catch (error) {
        console.error("Google Verify Error:", error);
        return res.status(400).json({ error: "Invalid Google Token" });
    }
};

