const express = require('express');
const cors = require('cors');
const config = require('./config/config');

const app = express();

// Middleware
app.use(cors({
    origin: config.app.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Import Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const commonRoutes = require('./routes/commonRoutes');

// Use Routes
app.use('/auth', authRoutes);
app.use('/', productRoutes);
app.use('/', cartRoutes);
app.use('/', orderRoutes);
app.use('/', adminRoutes);
app.use('/', commonRoutes);

app.get('/', (req, res) => {
    res.status(200).json({ message: "welcome to Jewell_shop_node" });
});

app.get('/testdb', async (req, res) => {
    try {
        const db = require('./config/db');
        const [rows] = await db.query('SELECT 1');
        res.send("DB Connected!");
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});


module.exports = app;
