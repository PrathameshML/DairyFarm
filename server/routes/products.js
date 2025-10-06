const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { executeQuery } = require('../config/database');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/products';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Validation rules for product
const productValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Product name must be 2-100 characters'),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description too long'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  body('category').isIn(['milk', 'paneer', 'buttermilk', 'ghee', 'curd', 'other']).withMessage('Invalid category'),
  body('unit').isIn(['liter', 'kg', 'piece', 'packet']).withMessage('Invalid unit')
];

// @route   GET /api/products
// @desc    Get all active products
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    const pageNum = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limitNum = Math.max(1, Math.min(parseInt(req.query.limit || '10', 10) || 10, 100));
    const offsetNum = (pageNum - 1) * limitNum;

    // Use explicit 1 for MySQL boolean TRUE
    let query = 'SELECT * FROM products WHERE is_active = 1';
    const queryParams = [];

    // Add category filter
    if (category && category !== 'all') {
      query += ' AND category = ?';
      queryParams.push(category);
    }

    // Add search filter
    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // Add pagination (inline validated numbers to avoid MySQL placeholder issue)
    query += ` ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const products = await executeQuery(query, queryParams);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM products WHERE is_active = 1';
    const countParams = [];

    if (category && category !== 'all') {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }

    if (search) {
      countQuery += ' AND (name LIKE ? OR description LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await executeQuery(countQuery, countParams);
    const totalProducts = countResult[0].total;

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalProducts / limitNum),
          totalProducts,
          hasNext: pageNum * limitNum < totalProducts,
          hasPrev: pageNum > 1
        }
      }
    });
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching products',
      ...(process.env.NODE_ENV !== 'production' ? { error: String(error?.message || error) } : {})
    });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const products = await executeQuery(
      'SELECT * FROM products WHERE product_id = ? AND is_active = true',
      [id]
    );

    if (!products.length) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: {
        product: products[0]
      }
    });
  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching product'
    });
  }
});

// @route   POST /api/products
// @desc    Add new product
// @access  Private (Admin only)
router.post('/', verifyToken, requireAdmin, upload.single('image'), productValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, description, price, stock, category, unit } = req.body;
    const image_url = req.file ? `/uploads/products/${req.file.filename}` : null;

    const result = await executeQuery(`
      INSERT INTO products (name, description, price, stock, category, unit, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [name, description, price, stock, category, unit, image_url]);

    res.status(201).json({
      success: true,
      message: 'Product added successfully',
      data: {
        product_id: result.insertId,
        name,
        description,
        price,
        stock,
        category,
        unit,
        image_url
      }
    });
  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating product'
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private (Admin only)
router.put('/:id', verifyToken, requireAdmin, upload.single('image'), productValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { name, description, price, stock, category, unit } = req.body;

    // Check if product exists
    const existingProduct = await executeQuery(
      'SELECT * FROM products WHERE product_id = ?',
      [id]
    );

    if (!existingProduct.length) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    let updateQuery = `
      UPDATE products 
      SET name = ?, description = ?, price = ?, stock = ?, category = ?, unit = ?
    `;
    let updateParams = [name, description, price, stock, category, unit];

    // Handle image update
    if (req.file) {
      updateQuery += ', image_url = ?';
      updateParams.push(`/uploads/products/${req.file.filename}`);

      // Delete old image if exists
      const oldImageUrl = existingProduct[0].image_url;
      if (oldImageUrl) {
        const oldImagePath = path.join(__dirname, '..', '..', oldImageUrl);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    }

    updateQuery += ' WHERE product_id = ?';
    updateParams.push(id);

    await executeQuery(updateQuery, updateParams);

    res.json({
      success: true,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating product'
    });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product (soft delete)
// @access  Private (Admin only)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await executeQuery(
      'UPDATE products SET is_active = false WHERE product_id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Product deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting product'
    });
  }
});

// @route   GET /api/products/categories/list
// @desc    Get product categories
// @access  Public
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await executeQuery(`
      SELECT category, COUNT(*) as count 
      FROM products 
      WHERE is_active = 1 
      GROUP BY category
    `);

    res.json({
      success: true,
      data: {
        categories: [
          { value: 'all', label: 'All Products', count: categories.reduce((sum, cat) => sum + cat.count, 0) },
          ...categories.map(cat => ({
            value: cat.category,
            label: cat.category.charAt(0).toUpperCase() + cat.category.slice(1),
            count: cat.count
          }))
        ]
      }
    });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching categories'
    });
  }
});

module.exports = router;
