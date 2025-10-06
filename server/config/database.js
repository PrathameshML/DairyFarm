const mysql = require('mysql2/promise');
const path = require('path');
// Load .env explicitly from project root to avoid path issues when running scripts
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mali_dairy_farm',
  port: process.env.DB_PORT || 3306,
  // Valid mysql2 pool options
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    if (!process.env.DB_PASSWORD) {
      console.error('Hint: DB_PASSWORD is empty or not loaded from .env. Ensure .env exists at project root and has DB_PASSWORD set.');
    }
    return false;
  }
};

// Execute query with error handling
const executeQuery = async (query, params = []) => {
  try {
    const [results] = await pool.execute(query, params);
    return results;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Get a single connection for transactions
const getConnection = async () => {
  return await pool.getConnection();
};

module.exports = {
  pool,
  executeQuery,
  getConnection,
  testConnection
};
