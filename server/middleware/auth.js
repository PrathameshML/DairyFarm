const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await executeQuery(
      'SELECT user_id, name, email, role, is_active FROM users WHERE user_id = ?',
      [decoded.userId]
    );

    if (!user.length || !user[0].is_active) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or user not active.'
      });
    }

    req.user = user[0];
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

// Check if user is farmer
const requireFarmer = (req, res, next) => {
  if (req.user.role !== 'farmer' && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Farmer privileges required.'
    });
  }
  next();
};

// Check if user is customer or admin
const requireCustomer = (req, res, next) => {
  if (req.user.role !== 'customer' && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Customer privileges required.'
    });
  }
  next();
};

module.exports = {
  verifyToken,
  requireAdmin,
  requireFarmer,
  requireCustomer
};
