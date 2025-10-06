const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { verifyToken, requireFarmer, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Validation rules for farmer registration
const farmerRegistrationValidation = [
  body('dairy_name').trim().isLength({ min: 2, max: 100 }).withMessage('Dairy name must be 2-100 characters'),
  body('village').trim().isLength({ min: 2, max: 100 }).withMessage('Village name must be 2-100 characters'),
  body('farm_size').optional().isFloat({ min: 0 }).withMessage('Farm size must be a positive number')
];

// Public follow-up form (no login)
const publicFollowupValidation = [
  body('dairy_name').trim().isLength({ min: 2, max: 100 }).withMessage('Dairy name must be 2-100 characters'),
  body('village').trim().isLength({ min: 2, max: 100 }).withMessage('Village name must be 2-100 characters'),
  body('farmer_name').trim().isLength({ min: 2, max: 100 }).withMessage('Farmer name must be 2-100 characters'),
  body('cows').isInt({ min: 0 }).withMessage('Number of cows must be a non-negative integer'),
  body('buffaloes').isInt({ min: 0 }).withMessage('Number of buffaloes must be a non-negative integer'),
  body('milk_production').isFloat({ min: 0 }).withMessage('Milk production must be a positive number'),
  body('breeding_method').isIn(['Natural', 'Artificial Insemination', 'High-quality breed AI']).withMessage('Invalid breeding method'),
  body('feed_type').isIn(['Green', 'Dry', 'Mix']).withMessage('Invalid feed type'),
  body('farm_type').isIn(['Open', 'Closed', 'Mixed']).withMessage('Invalid farm type'),
  body('vaccination').isBoolean().withMessage('Vaccination must be true or false'),
  body('rubber_mat').isBoolean().withMessage('Rubber mat must be true or false'),
  body('milking_method').isIn(['Manual', 'Machine', 'Both']).withMessage('Invalid milking method'),
  body('feed_brand').isIn(['Govardhan', 'Gokul', 'Samruddhi', 'Amul', 'Sudamini']).withMessage('Invalid feed brand')
];

// @route   POST /api/farmers/public-followup
// @desc    Public follow-up form submission (no login)
// @access  Public
router.post('/public-followup', publicFollowupValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS farmer_public_followups (
        id INT PRIMARY KEY AUTO_INCREMENT,
        dairy_name VARCHAR(100) NOT NULL,
        village VARCHAR(100) NOT NULL,
        farmer_name VARCHAR(100) NOT NULL,
        cows INT NOT NULL DEFAULT 0,
        buffaloes INT NOT NULL DEFAULT 0,
        milk_production DECIMAL(8,2) NOT NULL,
        feed_type ENUM('Green','Dry','Mix') NOT NULL,
        breeding_method ENUM('Natural','Artificial Insemination','High-quality breed AI') NOT NULL,
        farm_type ENUM('Open','Closed','Mixed') NOT NULL,
        vaccination BOOLEAN NOT NULL,
        rubber_mat BOOLEAN NOT NULL,
        milking_method ENUM('Manual','Machine','Both') NOT NULL,
        feed_brand ENUM('Govardhan','Gokul','Samruddhi','Amul','Sudamini') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const {
      dairy_name,
      village,
      farmer_name,
      cows,
      buffaloes,
      milk_production,
      feed_type,
      breeding_method,
      farm_type,
      vaccination,
      rubber_mat,
      milking_method,
      feed_brand
    } = req.body;

    const result = await executeQuery(
      `INSERT INTO farmer_public_followups (
        dairy_name, village, farmer_name, cows, buffaloes, milk_production,
        feed_type, breeding_method, farm_type, vaccination, rubber_mat, milking_method, feed_brand
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dairy_name, village, farmer_name, cows, buffaloes, milk_production,
        feed_type, breeding_method, farm_type, vaccination, rubber_mat, milking_method, feed_brand
      ]
    );

    res.status(201).json({ success: true, message: 'Follow-up submitted. Thank you!', data: { submission_id: result.insertId } });
  } catch (error) {
    console.error('Public follow-up error:', error);
    res.status(500).json({ success: false, message: 'Server error during public follow-up submission' });
  }
});
// Public farmer registration (no login)
const publicFarmerValidation = [
  body('dairy_name').trim().isLength({ min: 2, max: 100 }).withMessage('Dairy name must be 2-100 characters'),
  body('village').trim().isLength({ min: 2, max: 100 }).withMessage('Village name must be 2-100 characters'),
  body('farmer_name').trim().isLength({ min: 2, max: 100 }).withMessage('Farmer name must be 2-100 characters'),
  body('cows').isInt({ min: 0 }).withMessage('Number of cows must be a non-negative integer'),
  body('buffaloes').isInt({ min: 0 }).withMessage('Number of buffaloes must be a non-negative integer'),
  body('milk_production').isFloat({ min: 0 }).withMessage('Milk production must be a positive number'),
  body('breeding_method').isIn(['Natural', 'Artificial Insemination', 'High-quality breed AI']).withMessage('Invalid breeding method'),
  body('feed_type').isIn(['Green', 'Dry', 'Mix']).withMessage('Invalid feed type'),
  body('farm_type').isIn(['Open', 'Closed', 'Mixed']).withMessage('Invalid farm type'),
  body('vaccination').isBoolean().withMessage('Vaccination must be true or false'),
  body('rubber_mat').isBoolean().withMessage('Rubber mat must be true or false'),
  body('milking_method').isIn(['Manual', 'Machine', 'Both']).withMessage('Invalid milking method'),
  body('feed_brand').isIn(['Govardhan', 'Gokul', 'Samruddhi', 'Amul', 'Sudamini']).withMessage('Invalid feed brand')
];

// @route   POST /api/farmers/public-register
// @desc    Public farmer registration (stores submission only, no login required)
// @access  Public
router.post('/public-register', publicFarmerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    // Ensure submissions table exists
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS farmer_public_submissions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        dairy_name VARCHAR(100) NOT NULL,
        village VARCHAR(100) NOT NULL,
        farmer_name VARCHAR(100) NOT NULL,
        cows INT NOT NULL DEFAULT 0,
        buffaloes INT NOT NULL DEFAULT 0,
        milk_production DECIMAL(8,2) NOT NULL,
        feed_type ENUM('Green','Dry','Mix') NOT NULL,
        breeding_method ENUM('Natural','Artificial Insemination','High-quality breed AI') NOT NULL,
        farm_type ENUM('Open','Closed','Mixed') NOT NULL,
        vaccination BOOLEAN NOT NULL,
        rubber_mat BOOLEAN NOT NULL,
        milking_method ENUM('Manual','Machine','Both') NOT NULL,
        feed_brand ENUM('Govardhan','Gokul','Samruddhi','Amul','Sudamini') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const {
      dairy_name,
      village,
      farmer_name,
      cows,
      buffaloes,
      milk_production,
      feed_type,
      breeding_method,
      farm_type,
      vaccination,
      rubber_mat,
      milking_method,
      feed_brand
    } = req.body;

    const result = await executeQuery(
      `INSERT INTO farmer_public_submissions (
        dairy_name, village, farmer_name, cows, buffaloes, milk_production,
        feed_type, breeding_method, farm_type, vaccination, rubber_mat, milking_method, feed_brand
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dairy_name, village, farmer_name, cows, buffaloes, milk_production,
        feed_type, breeding_method, farm_type, vaccination, rubber_mat, milking_method, feed_brand
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Submission received. Thank you!',
      data: { submission_id: result.insertId }
    });
  } catch (error) {
    console.error('Public farmer registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during public farmer registration' });
  }
});

// Validation rules for farmer form
const farmerFormValidation = [
  body('form_type').isIn(['baseline', 'followup']).withMessage('Form type must be baseline or followup'),
  body('cows').isInt({ min: 0 }).withMessage('Number of cows must be a non-negative integer'),
  body('buffaloes').isInt({ min: 0 }).withMessage('Number of buffaloes must be a non-negative integer'),
  body('milk_production').isFloat({ min: 0 }).withMessage('Milk production must be a positive number'),
  body('feed_type').isIn(['Green', 'Dry', 'Mix']).withMessage('Invalid feed type'),
  body('breeding_method').isIn(['Natural', 'Artificial Insemination', 'High-quality breed AI']).withMessage('Invalid breeding method'),
  body('farm_type').isIn(['Open', 'Closed', 'Mixed']).withMessage('Invalid farm type'),
  body('vaccination').isBoolean().withMessage('Vaccination must be true or false'),
  body('rubber_mat').isBoolean().withMessage('Rubber mat must be true or false'),
  body('milking_method').isIn(['Manual', 'Machine', 'Both']).withMessage('Invalid milking method'),
  body('feed_brand').isIn(['Govardhan', 'Gokul', 'Samruddhi', 'Amul', 'Sudamini', 'Local']).withMessage('Invalid feed brand'),
  body('additional_notes').optional().isLength({ max: 1000 }).withMessage('Additional notes too long')
];

// @route   POST /api/farmers/register
// @desc    Register farmer profile
// @access  Private (Farmer role)
router.post('/register', verifyToken, requireFarmer, farmerRegistrationValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { dairy_name, village, farm_size } = req.body;

    // Check if farmer profile already exists
    const existingFarmer = await executeQuery(
      'SELECT farmer_id FROM farmers WHERE user_id = ?',
      [req.user.user_id]
    );

    if (existingFarmer.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Farmer profile already exists'
      });
    }

    // Create farmer profile
    const result = await executeQuery(
      'INSERT INTO farmers (user_id, dairy_name, village, farm_size) VALUES (?, ?, ?, ?)',
      [req.user.user_id, dairy_name, village, farm_size || null]
    );

    res.status(201).json({
      success: true,
      message: 'Farmer profile created successfully',
      data: {
        farmer_id: result.insertId,
        dairy_name,
        village,
        farm_size
      }
    });
  } catch (error) {
    console.error('Farmer registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during farmer registration'
    });
  }
});

// @route   GET /api/farmers/profile
// @desc    Get farmer profile
// @access  Private (Farmer role)
router.get('/profile', verifyToken, requireFarmer, async (req, res) => {
  try {
    const farmer = await executeQuery(`
      SELECT f.*, u.name, u.email, u.phone 
      FROM farmers f 
      JOIN users u ON f.user_id = u.user_id 
      WHERE f.user_id = ?
    `, [req.user.user_id]);

    if (!farmer.length) {
      return res.status(404).json({
        success: false,
        message: 'Farmer profile not found'
      });
    }

    // Get latest forms
    const forms = await executeQuery(`
      SELECT * FROM farmer_forms 
      WHERE farmer_id = ? 
      ORDER BY date_filled DESC
    `, [farmer[0].farmer_id]);

    res.json({
      success: true,
      data: {
        farmer: farmer[0],
        forms
      }
    });
  } catch (error) {
    console.error('Farmer profile fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching farmer profile'
    });
  }
});

// @route   POST /api/farmers/form
// @desc    Submit farmer form (baseline or followup)
// @access  Private (Farmer role)
router.post('/form', verifyToken, requireFarmer, farmerFormValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Get farmer ID
    const farmer = await executeQuery(
      'SELECT farmer_id FROM farmers WHERE user_id = ?',
      [req.user.user_id]
    );

    if (!farmer.length) {
      return res.status(404).json({
        success: false,
        message: 'Farmer profile not found. Please register first.'
      });
    }

    const farmerId = farmer[0].farmer_id;
    const {
      form_type,
      cows,
      buffaloes,
      milk_production,
      feed_type,
      breeding_method,
      farm_type,
      vaccination,
      rubber_mat,
      milking_method,
      feed_brand,
      additional_notes
    } = req.body;

    // Check if form type already exists
    const existingForm = await executeQuery(
      'SELECT form_id FROM farmer_forms WHERE farmer_id = ? AND form_type = ?',
      [farmerId, form_type]
    );

    if (existingForm.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${form_type} form already submitted. Use update endpoint to modify.`
      });
    }

    // Insert form data
    const result = await executeQuery(`
      INSERT INTO farmer_forms (
        farmer_id, form_type, cows, buffaloes, milk_production, 
        feed_type, breeding_method, farm_type, vaccination, 
        rubber_mat, milking_method, feed_brand, additional_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      farmerId, form_type, cows, buffaloes, milk_production,
      feed_type, breeding_method, farm_type, vaccination,
      rubber_mat, milking_method, feed_brand, additional_notes
    ]);

    // Update training status if this is a followup form
    if (form_type === 'followup') {
      await executeQuery(
        'UPDATE farmers SET training_status = ? WHERE farmer_id = ?',
        ['completed', farmerId]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Form submitted successfully',
      data: {
        form_id: result.insertId,
        form_type
      }
    });
  } catch (error) {
    console.error('Form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during form submission'
    });
  }
});

// @route   GET /api/farmers/forms
// @desc    Get farmer's forms
// @access  Private (Farmer role)
router.get('/forms', verifyToken, requireFarmer, async (req, res) => {
  try {
    // Get farmer ID
    const farmer = await executeQuery(
      'SELECT farmer_id FROM farmers WHERE user_id = ?',
      [req.user.user_id]
    );

    if (!farmer.length) {
      return res.status(404).json({
        success: false,
        message: 'Farmer profile not found'
      });
    }

    const forms = await executeQuery(
      'SELECT * FROM farmer_forms WHERE farmer_id = ? ORDER BY date_filled DESC',
      [farmer[0].farmer_id]
    );

    res.json({
      success: true,
      data: { forms }
    });
  } catch (error) {
    console.error('Forms fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching forms'
    });
  }
});

// @route   GET /api/farmers/training-sessions
// @desc    Get available training sessions for farmer's village
// @access  Private (Farmer role)
router.get('/training-sessions', verifyToken, requireFarmer, async (req, res) => {
  try {
    // Get farmer's village
    const farmer = await executeQuery(
      'SELECT farmer_id, village FROM farmers WHERE user_id = ?',
      [req.user.user_id]
    );

    if (!farmer.length) {
      return res.status(404).json({
        success: false,
        message: 'Farmer profile not found'
      });
    }

    const { farmer_id, village } = farmer[0];

    // Get training sessions for farmer's village
    const sessions = await executeQuery(`
      SELECT ts.*, 
        CASE WHEN ft.farmer_id IS NOT NULL THEN ft.attendance_status ELSE NULL END as registration_status
      FROM training_sessions ts
      LEFT JOIN farmer_training ft ON ts.session_id = ft.session_id AND ft.farmer_id = ?
      WHERE ts.village = ? OR ts.village = 'All'
      ORDER BY ts.session_date DESC
    `, [farmer_id, village]);

    res.json({
      success: true,
      data: { sessions }
    });
  } catch (error) {
    console.error('Training sessions fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching training sessions'
    });
  }
});

// @route   POST /api/farmers/training-sessions/:sessionId/register
// @desc    Register for a training session
// @access  Private (Farmer role)
router.post('/training-sessions/:sessionId/register', verifyToken, requireFarmer, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get farmer ID
    const farmer = await executeQuery(
      'SELECT farmer_id FROM farmers WHERE user_id = ?',
      [req.user.user_id]
    );

    if (!farmer.length) {
      return res.status(404).json({
        success: false,
        message: 'Farmer profile not found'
      });
    }

    const farmerId = farmer[0].farmer_id;

    // Check if session exists
    const session = await executeQuery(
      'SELECT * FROM training_sessions WHERE session_id = ?',
      [sessionId]
    );

    if (!session.length) {
      return res.status(404).json({
        success: false,
        message: 'Training session not found'
      });
    }

    // Check if already registered
    const existingRegistration = await executeQuery(
      'SELECT id FROM farmer_training WHERE farmer_id = ? AND session_id = ?',
      [farmerId, sessionId]
    );

    if (existingRegistration.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Already registered for this session'
      });
    }

    // Register for session
    await executeQuery(
      'INSERT INTO farmer_training (farmer_id, session_id) VALUES (?, ?)',
      [farmerId, sessionId]
    );

    res.json({
      success: true,
      message: 'Successfully registered for training session'
    });
  } catch (error) {
    console.error('Training registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during training registration'
    });
  }
});

module.exports = router;
