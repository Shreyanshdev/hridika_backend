const db = require('../config/db');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const config = require('../config/config');

const razorpay = new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret
});

exports.createOrder = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const userId = req.user_id;
        const { address, payment_method = 'razorpay' } = req.body;

        if (!address) {
            await connection.rollback();
            return res.status(400).json({ msg: "Address is required" });
        }

        // Fetch cart items
        const query = `
            SELECT c.product_id, c.quantity, p.weight, p.making_charge, m.base_rate, m.premium
            FROM cart c
            JOIN products p ON c.product_id = p.id
            JOIN metal_rates m 
            ON LOWER(p.metal_name) = LOWER(m.metal_type)
            WHERE c.user_id = ?
        `;
        const [cartItems] = await connection.query(query, [userId]);

        if (cartItems.length === 0) {
            await connection.rollback();
            return res.status(400).json({ msg: "Cart is empty" });
        }

        // Calculate total
        let totalAmount = 0;
        for (const item of cartItems) {
            const unitPrice = (parseFloat(item.weight) * (parseFloat(item.base_rate) + parseFloat(item.premium))) + parseFloat(item.making_charge);
            totalAmount += unitPrice * item.quantity;
        }

        totalAmount = parseFloat(totalAmount.toFixed(2));
        const amountInPaise = Math.round(totalAmount * 100);

        if (payment_method.toLowerCase() === 'cod') {
            const [orderResult] = await connection.query(
                "INSERT INTO orders (user_id, address, payment_method, status, total_amount) VALUES (?, ?, 'COD', 'Placed', ?)",
                [userId, address, totalAmount]
            );
            const orderId = orderResult.insertId;

            for (const item of cartItems) {
                const unitPrice = (parseFloat(item.weight) * (parseFloat(item.base_rate) + parseFloat(item.premium))) + parseFloat(item.making_charge);
                await connection.query(
                    "INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)",
                    [orderId, item.product_id, item.quantity, parseFloat(unitPrice.toFixed(2))]
                );
            }

            await connection.query("DELETE FROM cart WHERE user_id = ?", [userId]);
            await connection.commit();

            return res.status(201).json({ msg: "COD Order Placed", order_id: orderId });

        } else {
            // Razorpay
            const razorpayOrder = await razorpay.orders.create({
                amount: amountInPaise,
                currency: "INR",
                payment_capture: 1
            });

            const [orderResult] = await connection.query(
                "INSERT INTO orders (user_id, address, payment_method, status, razorpay_order_id, total_amount) VALUES (?, ?, 'Online', 'Pending', ?, ?)",
                [userId, address, razorpayOrder.id, totalAmount]
            );
            const orderId = orderResult.insertId;

            await connection.commit(); // Retrieve connection commit? Python commits here too.
            // Note: In python, it didn't move items to order_items yet for online payment. It waited for verification.

            return res.status(200).json({
                order_id: orderId,
                razorpay_order_id: razorpayOrder.id,
                amount: amountInPaise
            });
        }

    } catch (e) {
        await connection.rollback();
        console.error(e);
        return res.status(500).json({ error: e.message });
    } finally {
        connection.release();
    }
};

exports.verifyPayment = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const userId = req.user_id;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            await connection.rollback();
            return res.status(400).json({ msg: "Missing payment details" });
        }

        // Verify signature
        const hmac = crypto.createHmac('sha256', config.razorpay.keySecret);
        hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
        const generatedSignature = hmac.digest('hex');

        if (generatedSignature !== razorpay_signature) {
            await connection.rollback();
            // Razorpay lib also has utility.verify_payment_signature, but manual check is fine/clearer
            return res.status(400).json({ msg: "Invalid signature" });
        }

        // Check order
        const [orders] = await connection.query(
            "SELECT id FROM orders WHERE razorpay_order_id = ? AND user_id = ?",
            [razorpay_order_id, userId]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ msg: "Order not found" });
        }

        const orderId = orders[0].id;

        // Move cart to order items
        const [cartItems] = await connection.query(`
            SELECT c.product_id, c.quantity, p.weight, p.making_charge, m.base_rate, m.premium
            FROM cart c
            JOIN products p ON c.product_id = p.id
            JOIN metal_rates m 
            ON LOWER(p.metal_name) = LOWER(m.metal_type)
            WHERE c.user_id = ?
        `, [userId]);

        for (const item of cartItems) {
            const unitPrice = (parseFloat(item.weight) * (parseFloat(item.base_rate) + parseFloat(item.premium))) + parseFloat(item.making_charge);
            await connection.query(
                "INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)",
                [orderId, item.product_id, item.quantity, parseFloat(unitPrice.toFixed(2))]
            );
        }

        await connection.query(`
            UPDATE orders SET status='Paid', razorpay_payment_id=?, razorpay_signature=? WHERE id=?
        `, [razorpay_payment_id, razorpay_signature, orderId]);

        await connection.query("DELETE FROM cart WHERE user_id=?", [userId]);

        await connection.commit();

        return res.status(200).json({
            msg: "Payment verified and order placed",
            order_id: orderId
        });

    } catch (e) {
        await connection.rollback();
        console.error(e);
        return res.status(500).json({ msg: e.message });
    } finally {
        connection.release();
    }
};

exports.getOrders = async (req, res) => {
    try {
        const userId = req.user_id;
        // Filter out 'Pending' orders (created for online payment but never completed)
        const [orders] = await db.query(
            "SELECT id, address, payment_method, status, created_at, total_amount FROM orders WHERE user_id=? AND status != 'Pending' ORDER BY created_at DESC",
            [userId]
        );

        return res.status(200).json(orders);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.getOrderDetails = async (req, res) => {
    try {
        const userId = req.user_id;
        const { order_id } = req.params;

        const [orders] = await db.query(`
            SELECT o.id, o.status, o.total_amount, o.created_at, o.address, 
                   o.payment_method, o.razorpay_payment_id,
                   u.username as customer_name, u.email as customer_email, u.Phone as customer_phone
            FROM orders o
            JOIN users u ON o.user_id = u.user_id
            WHERE o.id = ? AND o.user_id = ?
        `, [order_id, userId]);

        if (orders.length === 0) {
            return res.status(404).json({ msg: "Order not found" });
        }

        const order = orders[0];

        const [items] = await db.query(`
            SELECT p.name, oi.quantity, oi.price_at_purchase as price
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `, [order.id]);

        order.items = items;

        return res.status(200).json(order);

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
