const db = require('../config/db');
const emailService = require('../utils/emailService');
const cloudinary = require('../config/cloudinary');

// Helper: upload a file buffer to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'hridika/bespoke') => {
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

exports.sendMail = async (req, res) => {
    try {
        const { name, mobile, email, subject, message } = req.body;

        const body = `My name is ${name} and my Contact_no is ${mobile}, please review my query and reply this mail as soon as possibile, ` + message;

        // Python sends to "shirishdivedi951@gmail.com" hardcoded
        await emailService.sendEmail("shirishdivedi951@gmail.com", subject || "New Inquiry", body);

        return res.status(200).json({ msg: "Welcome email sent successfully" });
    } catch (e) {
        console.error(e);
        return res.status(400).json({ msg: "Email sending failed" });
    }
};

exports.submitContact = async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const [result] = await db.query(
            "INSERT INTO contacts (name, email, phone, message, status) VALUES (?, ?, ?, ?, 'new')",
            [name, email, phone || '', message]
        );

        return res.status(201).json({
            message: 'Contact form submitted successfully',
            id: result.insertId
        });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.subscribeNewsletter = async (req, res) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ error: "Email is required" });

        // Check if table exists (Auto-migration logic from python)
        // SHOW TABLES LIKE 'newsletter_subscriptions'
        // If not exists, create it.
        // For efficiency, I'll assume it exists or try to create it if error?
        // Let's just run CREATE IF NOT EXISTS at start?
        // Or replicate the check.

        const [tables] = await db.query("SHOW TABLES LIKE 'newsletter_subscriptions'");
        if (tables.length === 0) {
            await db.query(`
                CREATE TABLE newsletter_subscriptions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }

        const [existing] = await db.query("SELECT * FROM newsletter_subscriptions WHERE email=?", [email]);
        if (existing.length > 0) {
            return res.status(200).json({ message: "You are already subscribed to our newsletter." });
        }

        await db.query("INSERT INTO newsletter_subscriptions (email) VALUES (?)", [email]);
        return res.status(201).json({ message: "Thank you for subscribing to our heritage archive." });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

exports.createBespokeRequest = async (req, res) => {
    try {
        const { name, phone, product, details, size } = req.body;

        if (!name || !phone || !product) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Handle image: multer file upload OR legacy base64/URL string in body
        let imageUrl = '';
        if (req.file) {
            imageUrl = await uploadToCloudinary(req.file.buffer, 'hridika/bespoke');
        } else if (req.body.image) {
            imageUrl = req.body.image;
        }

        const [result] = await db.query(
            "INSERT INTO bespoke_requests (full_name, phone, product_type, design_details, size, image_url) VALUES (?, ?, ?, ?, ?, ?)",
            [name, phone, product, details || '', size || '', imageUrl]
        );

        return res.status(201).json({
            msg: "Bespoke request submitted successfully",
            id: result.insertId
        });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
