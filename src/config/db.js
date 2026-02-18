const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    port: config.db.port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
});

// Test the connection and fix collation
(async () => {
    try {
        const connection = await pool.getConnection();

        // Force session collation to prevent mismatch
        await connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_general_ci");

        // Fix all tables to use the same collation
        const [tables] = await connection.query("SHOW TABLES");
        const dbName = config.db.database;
        for (const row of tables) {
            const tableName = row[`Tables_in_${dbName}`] || Object.values(row)[0];
            try {
                await connection.query(`ALTER TABLE \`${tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
            } catch (e) {
                // Skip if already correct or locked
            }
        }

        connection.release();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
    }
})();

module.exports = pool;

