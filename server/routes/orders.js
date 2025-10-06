const express = require('express');
const { body, validationResult } = require('express-validator');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { executeQuery, getConnection } = require('../config/database');
const { verifyToken, requireCustomer, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Validation rules for order
const orderValidation = [
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('items.*.product_id').isInt({ min: 1 }).withMessage('Valid product ID required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('delivery_address').trim().isLength({ min: 10, max: 500 }).withMessage('Delivery address must be 10-500 characters'),
  body('phone').isMobilePhone().withMessage('Valid phone number required')
];

// @route   POST /api/orders/create
// @desc    Create new order
// @access  Private (Customer)
router.post('/create', verifyToken, requireCustomer, orderValidation, async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { items, delivery_address, phone } = req.body;
    let totalAmount = 0;
    const orderItems = [];

    // Validate products and calculate total
    for (const item of items) {
      const [product] = await connection.execute(
        'SELECT product_id, name, price, stock FROM products WHERE product_id = ? AND is_active = true',
        [item.product_id]
      );

      if (!product.length) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Product with ID ${item.product_id} not found`
        });
      }

      const productData = product[0];

      if (productData.stock < item.quantity) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${productData.name}. Available: ${productData.stock}`
        });
      }

      const itemTotal = productData.price * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        price: productData.price,
        name: productData.name
      });
    }

    // Create order in database
    const [orderResult] = await connection.execute(
      'INSERT INTO orders (user_id, total_amount, delivery_address, phone) VALUES (?, ?, ?, ?)',
      [req.user.user_id, totalAmount, delivery_address, phone]
    );

    const orderId = orderResult.insertId;

    // Insert order items and update stock
    for (const item of orderItems) {
      await connection.execute(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.quantity, item.price]
      );

      await connection.execute(
        'UPDATE products SET stock = stock - ? WHERE product_id = ?',
        [item.quantity, item.product_id]
      );
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: `order_${orderId}`,
      notes: {
        order_id: orderId,
        user_id: req.user.user_id
      }
    });

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order_id: orderId,
        total_amount: totalAmount,
        items: orderItems,
        razorpay_order: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency
        },
        razorpay_key_id: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating order'
    });
  } finally {
    connection.release();
  }
});

// @route   GET /api/orders/razorpay-key
// @desc    Public key for Razorpay Checkout (client-side)
// @access  Private (Customer)
router.get('/razorpay-key', verifyToken, requireCustomer, async (req, res) => {
  try {
    res.json({ success: true, key_id: process.env.RAZORPAY_KEY_ID || '' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/orders/verify-payment
// @desc    Verify Razorpay payment
// @access  Private (Customer)
router.post('/verify-payment', verifyToken, requireCustomer, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Update order status
    await executeQuery(
      'UPDATE orders SET payment_status = ?, payment_id = ?, order_status = ? WHERE order_id = ? AND user_id = ?',
      ['completed', razorpay_payment_id, 'confirmed', order_id, req.user.user_id]
    );

    res.json({
      success: true,
      message: 'Payment verified successfully'
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error verifying payment'
    });
  }
});

// @route   GET /api/orders
// @desc    Get user's orders
// @access  Private (Customer)
router.get('/', verifyToken, requireCustomer, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    let query = `
      SELECT o.*, 
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'product_id', oi.product_id,
            'product_name', p.name,
            'quantity', oi.quantity,
            'price', oi.price,
            'image_url', p.image_url
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.product_id
      WHERE o.user_id = ?
    `;
    
    const queryParams = [req.user.user_id];

    if (status) {
      query += ' AND o.order_status = ?';
      queryParams.push(status);
    }

    query += ' GROUP BY o.order_id ORDER BY o.created_at DESC';

    // Add pagination
    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), parseInt(offset));

    const orders = await executeQuery(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM orders WHERE user_id = ?';
    const countParams = [req.user.user_id];

    if (status) {
      countQuery += ' AND order_status = ?';
      countParams.push(status);
    }

    const countResult = await executeQuery(countQuery, countParams);
    const totalOrders = countResult[0].total;

    res.json({
      success: true,
      data: {
        orders: orders.map(order => ({
          ...order,
          items: JSON.parse(order.items)
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalOrders / limit),
          totalOrders,
          hasNext: page * limit < totalOrders,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching orders'
    });
  }
});

// @route   GET /api/orders/:id
// @desc    Get single order
// @access  Private (Customer)
router.get('/:id', verifyToken, requireCustomer, async (req, res) => {
  try {
    const { id } = req.params;

    const orders = await executeQuery(`
      SELECT o.*, 
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'product_id', oi.product_id,
            'product_name', p.name,
            'quantity', oi.quantity,
            'price', oi.price,
            'image_url', p.image_url,
            'category', p.category,
            'unit', p.unit
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.product_id
      WHERE o.order_id = ? AND o.user_id = ?
      GROUP BY o.order_id
    `, [id, req.user.user_id]);

    if (!orders.length) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const order = orders[0];
    order.items = JSON.parse(order.items);

    res.json({
      success: true,
      data: { order }
    });
  } catch (error) {
    console.error('Order fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching order'
    });
  }
});

// @route   PUT /api/orders/:id/cancel
// @desc    Cancel order
// @access  Private (Customer)
router.put('/:id/cancel', verifyToken, requireCustomer, async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Get order details
    const [order] = await connection.execute(
      'SELECT * FROM orders WHERE order_id = ? AND user_id = ?',
      [id, req.user.user_id]
    );

    if (!order.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const orderData = order[0];

    if (!['placed', 'confirmed'].includes(orderData.order_status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    // Get order items to restore stock
    const [orderItems] = await connection.execute(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
      [id]
    );

    // Restore stock
    for (const item of orderItems) {
      await connection.execute(
        'UPDATE products SET stock = stock + ? WHERE product_id = ?',
        [item.quantity, item.product_id]
      );
    }

    // Update order status
    await connection.execute(
      'UPDATE orders SET order_status = ? WHERE order_id = ?',
      ['cancelled', id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Order cancellation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error cancelling order'
    });
  } finally {
    connection.release();
  }
});

// Admin routes for order management

// @route   GET /api/orders/admin/all
// @desc    Get all orders (Admin)
// @access  Private (Admin)
router.get('/admin/all', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, user_id } = req.query;

    let query = `
      SELECT o.*, u.name as customer_name, u.email as customer_email,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'product_id', oi.product_id,
            'product_name', p.name,
            'quantity', oi.quantity,
            'price', oi.price
          )
        ) as items
      FROM orders o
      JOIN users u ON o.user_id = u.user_id
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.product_id
      WHERE 1=1
    `;
    
    const queryParams = [];

    if (status) {
      query += ' AND o.order_status = ?';
      queryParams.push(status);
    }

    if (user_id) {
      query += ' AND o.user_id = ?';
      queryParams.push(user_id);
    }

    query += ' GROUP BY o.order_id ORDER BY o.created_at DESC';

    // Add pagination
    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), parseInt(offset));

    const orders = await executeQuery(query, queryParams);

    res.json({
      success: true,
      data: {
        orders: orders.map(order => ({
          ...order,
          items: JSON.parse(order.items)
        }))
      }
    });
  } catch (error) {
    console.error('Admin orders fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching orders'
    });
  }
});

// @route   PUT /api/orders/admin/:id/status
// @desc    Update order status (Admin)
// @access  Private (Admin)
router.put('/admin/:id/status', verifyToken, requireAdmin, [
  body('status').isIn(['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Invalid status')
], async (req, res) => {
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
    const { status } = req.body;

    const result = await executeQuery(
      'UPDATE orders SET order_status = ? WHERE order_id = ?',
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    console.error('Order status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating order status'
    });
  }
});

module.exports = router;
