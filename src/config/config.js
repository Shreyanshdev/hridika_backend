require('dotenv').config();

module.exports = {
    db: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
    },
    jwt: {
        secret: process.env.JWT_SECRET_KEY,
        accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
        refreshExpires: process.env.JWT_REFRESH_EXPIRES || '30d',
    },
    razorpay: {
        keyId: process.env.RAZORPAY_TEST_KEY_ID,
        keySecret: process.env.RAZORPAY_TEST_KEY_SECRET,
    },
    email: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
    },
    resend: {
        apiKey: process.env.RESEND_API_KEY,
        fromEmail: process.env.RESEND_FROM_EMAIL,
    },
    app: {
        port: process.env.PORT || 5001,
        url: process.env.APP_URL,
        allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
        goldApiKey: process.env.GOLD_API_KEY,
    },
};
