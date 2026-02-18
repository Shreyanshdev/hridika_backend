const jwt = require('jsonwebtoken');
const config = require('../config/config');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ msg: "No token provided" });
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    if (!token) {
        return res.status(401).json({ msg: "No token provided" });
    }

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = decoded;
        req.user_id = decoded.sub;
        next();
    } catch (err) {
        return res.status(401).json({ msg: "Invalid or expired token" });
    }
};

// Separate middleware for refresh token validation
const verifyRefreshToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ msg: "No refresh token provided" });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ msg: "No refresh token provided" });
    }

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        if (decoded.type !== 'refresh') {
            return res.status(401).json({ msg: "Invalid token type, expected refresh token" });
        }
        req.user = decoded;
        req.user_id = decoded.sub;
        next();
    } catch (err) {
        return res.status(401).json({ msg: "Invalid or expired refresh token" });
    }
};

module.exports = verifyToken;
module.exports.verifyRefreshToken = verifyRefreshToken;

