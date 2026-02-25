const db = require('../config/db');

exports.getAllUsers = async (req, res) => {
    try {
        const [users] = await db.query("SELECT user_id, username, email, Phone, created_at FROM users");
        return res.status(200).json(users);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.getOrdersAdmin = async (req, res) => {
    try {
        const [orders] = await db.query("SELECT id, address, payment_method, status, created_at, total_amount FROM orders ORDER BY created_at DESC");
        return res.status(200).json(orders);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.getAdminOrderDetails = async (req, res) => {
    try {
        const { order_id } = req.params;

        const [orders] = await db.query(`
            SELECT
                o.id,
                o.address,
                o.status,
                o.payment_method,
                o.total_amount,
                o.razorpay_payment_id,
                o.created_at,
                u.username AS customer_name,
                u.email AS customer_email,
                u.Phone AS customer_phone
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.user_id
            WHERE o.id = ?
        `, [order_id]);

        if (orders.length === 0) {
            return res.status(404).json({ msg: "Order not found" });
        }

        const order = orders[0];

        const [items] = await db.query(`
            SELECT
                p.name,
                p.images,
                oi.quantity,
                oi.price_at_purchase AS price
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `, [order_id]);

        order.items = items;
        return res.status(200).json(order);

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const { order_id } = req.params;
        const { status } = req.body;

        await db.query("UPDATE orders SET status=? WHERE id=?", [status, order_id]);
        return res.status(200).json({ msg: "Order updated" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.getMetalRates = async (req, res) => {
    try {
        const [rows] = await db.query("SELECT metal_type, base_rate, premium FROM metal_rates");
        const rates = {};
        rows.forEach(row => {
            rates[row.metal_type] = {
                base_rate: parseFloat(row.base_rate),
                premium: parseFloat(row.premium)
            };
        });
        return res.status(200).json(rates);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.updateMetalRate = async (req, res) => {
    try {
        const { metal_type, base_rate, premium } = req.body;

        if (!['gold', 'silver'].includes(metal_type)) {
            return res.status(400).json({ message: "Invalid metal type" });
        }

        await db.query(
            "UPDATE metal_rates SET base_rate=?, premium=? WHERE metal_type=?",
            [base_rate, premium, metal_type]
        );

        return res.status(200).json({ message: "Metal rate updated!" });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.getBespokeRequests = async (req, res) => {
    try {
        const [requests] = await db.query("SELECT id, full_name AS name, phone, product_type AS product, design_details AS details, size, image_url AS image, created_at FROM bespoke_requests ORDER BY created_at DESC");
        return res.status(200).json(requests);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.deleteBespokeRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.query("DELETE FROM bespoke_requests WHERE id=?", [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ msg: "Bespoke request not found" });
        }
        return res.status(200).json({ msg: "Bespoke request deleted successfully" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
