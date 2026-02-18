const db = require('../config/db');

exports.addToCart = async (req, res) => {
    try {
        const userId = req.user_id;
        const { product_id, quantity = 10 } = req.body;

        // Enforce minimum quantity of 10
        const qty = Math.max(10, parseInt(quantity) || 10);

        // Check if item exists in cart
        const [existing] = await db.query(
            "SELECT quantity FROM cart WHERE user_id=? AND product_id=?",
            [userId, product_id]
        );

        if (existing.length > 0) {
            // Add requested quantity to existing
            await db.query(
                "UPDATE cart SET quantity=quantity+? WHERE user_id=? AND product_id=?",
                [qty, userId, product_id]
            );
        } else {
            await db.query(
                "INSERT INTO cart (user_id, product_id, quantity) VALUES (?,?,?)",
                [userId, product_id, qty]
            );
        }

        return res.status(201).json({ msg: "Product added to cart", quantity: qty });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

exports.getCart = async (req, res) => {
    try {
        const userId = req.user_id;
        const query = `
            SELECT 
                c.product_id,
                c.quantity AS cart_quantity,
                p.name,
                p.images,
                p.weight,
                p.making_charge,
                m.base_rate,
                m.premium
            FROM cart c
            JOIN products p ON c.product_id = p.id
            JOIN metal_rates m 
              ON LOWER(p.metal_name) = LOWER(m.metal_type)
            WHERE c.user_id = ?
        `;

        const [rows] = await db.query(query, [userId]);

        const result = rows.map(item => {
            const unitPrice = (parseFloat(item.weight) * (parseFloat(item.base_rate) + parseFloat(item.premium))) + parseFloat(item.making_charge);

            // Python code specifically sends images as is?
            // Line 986: "images": i["images"]

            return {
                product_id: item.product_id,
                name: item.name,
                images: item.images, // JSON string or what DB has
                quantity: item.cart_quantity,
                price: parseFloat(unitPrice.toFixed(2)),
                total_price: parseFloat((unitPrice * item.cart_quantity).toFixed(2))
            };
        });

        return res.status(200).json(result);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.updateCartQuantity = async (req, res) => {
    try {
        const userId = req.user_id;
        const { product_id, quantity } = req.body; // quantity in body is required check

        if (!product_id || !quantity) {
            return res.status(400).json({ msg: "Product ID and quantity required" });
        }

        // Python logic: "UPDATE cart SET quantity=quantity+%s", (1, ...)
        // It adds 1? 
        // Line 1015: quantity=quantity+%s, param (1, ...)
        // The endpoint is /cart/update. 
        // Logic seems to be "increment by 1".

        await db.query("UPDATE cart SET quantity=quantity+1 WHERE user_id=? AND product_id=?", [userId, product_id]);
        return res.status(200).json({ msg: "Quantity updated successfully" });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.updateCartQuantityMin = async (req, res) => {
    try {
        const userId = req.user_id;
        const { product_id, quantity } = req.body;

        if (!product_id || !quantity) {
            return res.status(400).json({ msg: "Product ID and quantity required" });
        }

        // Check current quantity - enforce minimum 10
        const [existing] = await db.query(
            "SELECT quantity FROM cart WHERE user_id=? AND product_id=?",
            [userId, product_id]
        );

        if (existing.length > 0 && existing[0].quantity <= 10) {
            return res.status(400).json({ msg: "Minimum order quantity is 10" });
        }

        await db.query("UPDATE cart SET quantity=quantity-1 WHERE user_id=? AND product_id=?", [userId, product_id]);
        return res.status(200).json({ msg: "Quantity updated successfully" });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.removeFromCart = async (req, res) => {
    try {
        const userId = req.user_id;
        const { product_id } = req.params;

        await db.query("DELETE FROM cart WHERE user_id=? AND product_id=?", [userId, product_id]);
        return res.status(200).json({ msg: "Removed from cart" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
