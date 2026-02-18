const db = require('../config/db');
const cloudinary = require('../config/cloudinary');

// Helper: upload a file buffer to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'hridika/products') => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image' },
            (error, result) => {
                if (error) return reject(error);
                resolve(result.secure_url);
            }
        );
        stream.end(fileBuffer);
    });
};

// Helper to calculate price
const calculatePrice = (product, metalRate) => {
    // formula: (weight * (base_rate + premium)) + making_charge
    // metal_name in product should match metal_type in metal_rates (case insensitive)

    if (!metalRate) return 0; // Or handle error

    const weight = parseFloat(product.weight) || 0;
    const baseRate = parseFloat(metalRate.base_rate) || 0;
    const premium = parseFloat(metalRate.premium) || 0;
    const makingCharge = parseFloat(product.making_charge) || 0;

    const finalPrice = (weight * (baseRate + premium)) + makingCharge;
    return parseFloat(finalPrice.toFixed(2));
};

exports.createProduct = async (req, res) => {
    try {
        const data = req.body;

        let stock = data.stock;
        stock = (stock && !isNaN(stock)) ? parseInt(stock) : 0;

        let quantity = data.quantity;
        quantity = (quantity && !isNaN(quantity)) ? parseInt(quantity) : 0;

        let weight = parseFloat(data.weight) || 0.0;
        let making_charge = parseFloat(data.making_charge) || 0.0;

        // Handle image uploads: multer files OR legacy base64/URL strings in body
        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            // Upload each file to Cloudinary
            for (const file of req.files) {
                const url = await uploadToCloudinary(file.buffer, 'hridika/products');
                imageUrls.push(url);
            }
        } else if (data.images) {
            // Backward compat: accept URL strings from body
            imageUrls = Array.isArray(data.images) ? data.images : [data.images];
        }
        const images_json = JSON.stringify(imageUrls);

        const query = `
            INSERT INTO products 
            (name, category, description, stock, images, quantity, metal_name, weight, making_charge)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.query(query, [
            data.name || 'Unnamed Piece',
            data.category || 'Uncategorized',
            data.description || '',
            stock,
            images_json,
            quantity,
            data.metal_name || 'Gold',
            weight,
            making_charge
        ]);

        return res.status(201).json({ msg: "Product created successfully" });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: `Archival failed: ${e.message}` });
    }
};

exports.getProductsDash = async (req, res) => {
    try {
        const query = `
            SELECT 
            p.id, p.name, p.category, p.description, p.stock, p.images,
            p.quantity, p.metal_name, p.weight, p.making_charge,
            m.base_rate, m.premium
            FROM products p
            JOIN metal_rates m 
            ON p.metal_name COLLATE utf8mb4_unicode_ci = m.metal_type COLLATE utf8mb4_unicode_ci
        `;

        const [rows] = await db.query(query);

        const result = rows.map(p => {
            const finalPrice = calculatePrice(p, { base_rate: p.base_rate, premium: p.premium });

            let images = [];
            try {
                images = p.images ? JSON.parse(p.images) : [];
                if (!Array.isArray(images)) images = [p.images];
            } catch (e) {
                images = p.images ? [p.images] : [];
            }

            return {
                id: p.id,
                name: p.name,
                category: p.category,
                description: p.description,
                stock: p.stock,
                images: images,
                quantity: p.quantity,
                metal_name: p.metal_name,
                weight: p.weight,
                making_charge: p.making_charge,
                price: finalPrice
            };
        });

        return res.status(200).json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

exports.getProducts = async (req, res) => {
    try {
        // public endpoint with pricing
        const query = `
            SELECT 
            p.id, p.name, p.category, p.description, p.stock, p.images,
            p.quantity, p.metal_name, p.weight, p.making_charge,
            m.base_rate, m.premium
            FROM products p
            JOIN metal_rates m 
            ON p.metal_name COLLATE utf8mb4_unicode_ci = m.metal_type COLLATE utf8mb4_unicode_ci
        `; // MySQL is generally case-insensitive but explicit match is safer if collation varies. Python used explicit regex/lower.

        const [rows] = await db.query(query);

        const result = rows.map(p => {
            const finalPrice = calculatePrice(p, { base_rate: p.base_rate, premium: p.premium });

            let images = [];
            try {
                images = p.images ? JSON.parse(p.images) : [];
                if (!Array.isArray(images)) images = [p.images];
            } catch (e) {
                images = p.images ? [p.images] : [];
            }

            return {
                id: p.id,
                name: p.name,
                category: p.category,
                description: p.description,
                stock: p.stock,
                images: images,
                quantity: p.quantity,
                metal_name: p.metal_name,
                weight: p.weight,
                making_charge: p.making_charge,
                price: finalPrice
            };
        });

        return res.status(200).json(result);

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};

exports.getProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT 
            p.*, m.base_rate, m.premium
            FROM products p
            JOIN metal_rates m 
            ON p.metal_name COLLATE utf8mb4_unicode_ci = m.metal_type COLLATE utf8mb4_unicode_ci
            WHERE p.id = ?
        `;

        const [rows] = await db.query(query, [id]);
        const p = rows[0];

        if (!p) {
            return res.status(404).json({ message: "Product not found" });
        }

        const finalPrice = calculatePrice(p, { base_rate: p.base_rate, premium: p.premium });

        let images = [];
        try {
            images = p.images ? JSON.parse(p.images) : [];
            if (!Array.isArray(images)) images = [p.images];
        } catch {
            images = p.images ? [p.images] : [];
        }

        // Remove DB internal fields if needed or just send cleaned obj
        // Python code removed base_rate and premium from response
        const responseUser = {
            ...p,
            images,
            price: finalPrice
        };
        delete responseUser.base_rate;
        delete responseUser.premium;

        return res.status(200).json(responseUser);

    } catch (e) {
        console.error(e);
        // Python returned 404 for product not found but here generic error 500
        return res.status(500).json({ error: e.message });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM products WHERE id=?", [id]);
        return res.json({ message: "Product deleted" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const [existing] = await db.query("SELECT * FROM products WHERE id=?", [id]);
        const product = existing[0];

        if (!product) return res.status(404).json({ msg: "Product not found" });

        // Logic from Python: update fields if present

        let stock = product.stock;
        if (data.stock !== undefined) {
            stock = (!isNaN(data.stock)) ? parseInt(data.stock) : 0;
        }

        let quantity = product.quantity;
        if (data.quantity !== undefined) {
            quantity = (!isNaN(data.quantity)) ? parseInt(data.quantity) : 0;
        }

        let weight = product.weight;
        if (data.weight !== undefined) {
            weight = parseFloat(data.weight) || 0.0;
        }

        let making_charge = product.making_charge;
        if (data.making_charge !== undefined) {
            making_charge = parseFloat(data.making_charge) || 0.0;
        }

        // Handle image uploads: multer files OR legacy strings in body
        let images_json = product.images;
        if (req.files && req.files.length > 0) {
            // Upload new files to Cloudinary
            const newUrls = [];
            for (const file of req.files) {
                const url = await uploadToCloudinary(file.buffer, 'hridika/products');
                newUrls.push(url);
            }
            // Merge with existing images if any were kept
            let existingImages = [];
            if (data.existingImages) {
                existingImages = Array.isArray(data.existingImages) ? data.existingImages : JSON.parse(data.existingImages || '[]');
            }
            images_json = JSON.stringify([...existingImages, ...newUrls]);
        } else if (data.images !== undefined) {
            // Backward compat: accept URL strings from body
            if (Array.isArray(data.images)) {
                images_json = JSON.stringify(data.images);
            } else {
                images_json = JSON.stringify([data.images]);
            }
        }

        const updateQuery = `
            UPDATE products SET
            name=?, category=?, description=?, stock=?, quantity=?, metal_name=?, images=?, weight=?, making_charge=?
            WHERE id=?
        `;

        await db.query(updateQuery, [
            data.name || product.name,
            data.category || product.category,
            data.description || product.description,
            stock,
            quantity,
            data.metal_name || product.metal_name,
            images_json,
            weight,
            making_charge,
            id
        ]);

        return res.status(200).json({ msg: "Product updated successfully" });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: `Update failed: ${e.message}` });
    }
};

exports.getCategories = async (req, res) => {
    try {
        // Python: cursor.execute("SELECT DISTINCT category FROM products")
        // categories = [c[0] for c in cursor.fetchall()]
        const [rows] = await db.query("SELECT DISTINCT category FROM products");
        const categories = rows.map(r => r.category).filter(c => c); // filter nulls
        return res.status(200).json(categories);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.getProductsByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        const query = `
             SELECT 
            p.*, m.base_rate, m.premium
            FROM products p
            JOIN metal_rates m 
            ON p.metal_name COLLATE utf8mb4_unicode_ci = m.metal_type COLLATE utf8mb4_unicode_ci
            WHERE LOWER(p.category) = LOWER(?)
        `;
        const [rows] = await db.query(query, [category]);

        const result = rows.map(p => {
            const finalPrice = calculatePrice(p, { base_rate: p.base_rate, premium: p.premium });

            let images = [];
            try {
                images = p.images ? JSON.parse(p.images) : [];
                if (!Array.isArray(images)) images = [p.images];
            } catch (e) {
                images = p.images ? [p.images] : [];
            }

            return {
                id: p.id,
                name: p.name,
                category: p.category,
                description: p.description,
                stock: p.stock,
                images: images,
                quantity: p.quantity,
                price: finalPrice
            };
        });

        return res.status(200).json(result);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
