const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function testDatabaseConnection() {
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.query("SELECT 1");
    console.log("MySQL database connection successful");
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = pool;
module.exports.testDatabaseConnection = testDatabaseConnection;
