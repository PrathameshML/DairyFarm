const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdf-lib').PDFDocument;
const { askGemini } = require('../utils/ai');

const router = express.Router();

// @route   GET /api/admin/dashboard
// @desc    Get dashboard statistics
// @access  Private (Admin)
router.get('/dashboard', verifyToken, requireAdmin, async (req, res) => {
  try {
    // Get basic statistics
    const [userStats] = await Promise.all([
      executeQuery(`
        SELECT 
          COUNT(CASE WHEN role = 'customer' THEN 1 END) as total_customers,
          COUNT(CASE WHEN role = 'farmer' THEN 1 END) as total_farmers,
          COUNT(*) as total_users
        FROM users WHERE is_active = true
      `),
    ]);

    const [orderStats] = await Promise.all([
      executeQuery(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN payment_status = 'completed' THEN total_amount ELSE 0 END) as total_revenue,
          COUNT(CASE WHEN order_status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_orders
        FROM orders
      `),
    ]);

    const [productStats] = await Promise.all([
      executeQuery(`
        SELECT 
          COUNT(*) as total_products,
          COUNT(CASE WHEN stock < 10 THEN 1 END) as low_stock_products,
          AVG(price) as avg_price
        FROM products WHERE is_active = true
      `),
    ]);

    const [farmerStats] = await Promise.all([
      executeQuery(`
        SELECT 
          COUNT(*) as total_farmers,
          COUNT(CASE WHEN training_status = 'completed' THEN 1 END) as completed_training,
          COUNT(CASE WHEN training_status = 'in_progress' THEN 1 END) as in_progress_training
        FROM farmers
      `),
    ]);

    // Get recent orders
    const recentOrders = await executeQuery(`
      SELECT o.order_id, o.total_amount, o.order_status, o.created_at,
             u.name as customer_name
      FROM orders o
      JOIN users u ON o.user_id = u.user_id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    // Get monthly revenue data
    const monthlyRevenue = await executeQuery(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        SUM(CASE WHEN payment_status = 'completed' THEN total_amount ELSE 0 END) as revenue,
        COUNT(*) as orders
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month
    `);

    // Get product category sales
    const categorySales = await executeQuery(`
      SELECT p.category, 
             SUM(oi.quantity) as total_quantity,
             SUM(oi.quantity * oi.price) as total_revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.product_id
      JOIN orders o ON oi.order_id = o.order_id
      WHERE o.payment_status = 'completed'
      GROUP BY p.category
      ORDER BY total_revenue DESC
    `);

    // Get village-wise farmer distribution
    const villageDistribution = await executeQuery(`
      SELECT village, COUNT(*) as farmer_count
      FROM farmers
      GROUP BY village
      ORDER BY farmer_count DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        statistics: {
          users: userStats[0],
          orders: orderStats[0],
          products: productStats[0],
          farmers: farmerStats[0]
        },
        charts: {
          monthlyRevenue,
          categorySales,
          villageDistribution
        },
        recentOrders
      }
    });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching dashboard data'
    });
  }
});

// @route   GET /api/admin/farmers
// @desc    Get all farmers with their data
// @access  Private (Admin)
router.get('/farmers', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, village, training_status } = req.query;

    let query = `
      SELECT f.*, u.name, u.email, u.phone, u.created_at as user_created_at
      FROM farmers f
      JOIN users u ON f.user_id = u.user_id
      WHERE u.is_active = true
    `;
    
    const queryParams = [];

    if (village) {
      query += ' AND f.village = ?';
      queryParams.push(village);
    }

    if (training_status) {
      query += ' AND f.training_status = ?';
      queryParams.push(training_status);
    }

    query += ' ORDER BY f.registration_date DESC';

    // Add pagination
    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), parseInt(offset));

    const farmers = await executeQuery(query, queryParams);

    // Get forms data for each farmer
    for (let farmer of farmers) {
      const forms = await executeQuery(`
        SELECT * FROM farmer_forms 
        WHERE farmer_id = ? 
        ORDER BY date_filled DESC
      `, [farmer.farmer_id]);
      
      farmer.forms = forms;
      farmer.baseline_form = forms.find(f => f.form_type === 'baseline');
      farmer.followup_form = forms.find(f => f.form_type === 'followup');
    }

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM farmers f 
      JOIN users u ON f.user_id = u.user_id 
      WHERE u.is_active = true
    `;
    const countParams = [];

    if (village) {
      countQuery += ' AND f.village = ?';
      countParams.push(village);
    }

    if (training_status) {
      countQuery += ' AND f.training_status = ?';
      countParams.push(training_status);
    }

    const countResult = await executeQuery(countQuery, countParams);
    const totalFarmers = countResult[0].total;

    res.json({
      success: true,
      data: {
        farmers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalFarmers / limit),
          totalFarmers,
          hasNext: page * limit < totalFarmers,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Farmers fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching farmers data'
    });
  }
});

// @route   GET /api/admin/farmers/:id/analysis
// @desc    Get farmer progress analysis
// @access  Private (Admin)
router.get('/farmers/:id/analysis', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get farmer details
    const farmer = await executeQuery(`
      SELECT f.*, u.name, u.email, u.phone
      FROM farmers f
      JOIN users u ON f.user_id = u.user_id
      WHERE f.farmer_id = ?
    `, [id]);

    if (!farmer.length) {
      return res.status(404).json({
        success: false,
        message: 'Farmer not found'
      });
    }

    // Get baseline and followup forms
    const forms = await executeQuery(`
      SELECT * FROM farmer_forms 
      WHERE farmer_id = ? 
      ORDER BY form_type, date_filled DESC
    `, [id]);

    const baseline = forms.find(f => f.form_type === 'baseline');
    const followup = forms.find(f => f.form_type === 'followup');

    let analysis = {
      farmer: farmer[0],
      baseline,
      followup,
      improvements: null
    };

    // Calculate improvements if both forms exist
    if (baseline && followup) {
      analysis.improvements = {
        milk_production: {
          before: baseline.milk_production,
          after: followup.milk_production,
          change: followup.milk_production - baseline.milk_production,
          percentage: ((followup.milk_production - baseline.milk_production) / baseline.milk_production * 100).toFixed(2)
        },
        total_animals: {
          before: baseline.cows + baseline.buffaloes,
          after: followup.cows + followup.buffaloes,
          change: (followup.cows + followup.buffaloes) - (baseline.cows + baseline.buffaloes)
        },
        practices_adopted: {
          vaccination: baseline.vaccination !== followup.vaccination ? 'Improved' : 'No change',
          rubber_mat: baseline.rubber_mat !== followup.rubber_mat ? 'Improved' : 'No change',
          milking_method: baseline.milking_method !== followup.milking_method ? 'Changed' : 'No change',
          breeding_method: baseline.breeding_method !== followup.breeding_method ? 'Changed' : 'No change'
        }
      };
    }

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Farmer analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching farmer analysis'
    });
  }
});

// @route   GET /api/admin/analytics/village-comparison
// @desc    Get village-wise comparison analytics
// @access  Private (Admin)
router.get('/analytics/village-comparison', verifyToken, requireAdmin, async (req, res) => {
  try {
    const villageStats = await executeQuery(`
      SELECT 
        f.village,
        COUNT(f.farmer_id) as total_farmers,
        COUNT(CASE WHEN f.training_status = 'completed' THEN 1 END) as completed_training,
        AVG(CASE WHEN ff.form_type = 'baseline' THEN ff.milk_production END) as avg_baseline_production,
        AVG(CASE WHEN ff.form_type = 'followup' THEN ff.milk_production END) as avg_followup_production,
        AVG(CASE WHEN ff.form_type = 'baseline' THEN ff.cows + ff.buffaloes END) as avg_baseline_animals,
        AVG(CASE WHEN ff.form_type = 'followup' THEN ff.cows + ff.buffaloes END) as avg_followup_animals
      FROM farmers f
      LEFT JOIN farmer_forms ff ON f.farmer_id = ff.farmer_id
      GROUP BY f.village
      ORDER BY total_farmers DESC
    `);

    // Calculate improvement percentages
    const villageComparison = villageStats.map(village => ({
      ...village,
      production_improvement: village.avg_followup_production && village.avg_baseline_production
        ? ((village.avg_followup_production - village.avg_baseline_production) / village.avg_baseline_production * 100).toFixed(2)
        : null,
      completion_rate: (village.completed_training / village.total_farmers * 100).toFixed(2)
    }));

    res.json({
      success: true,
      data: {
        villageComparison
      }
    });
  } catch (error) {
    console.error('Village comparison error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching village comparison'
    });
  }
});

// @route   POST /api/admin/training-sessions
// @desc    Create training session
// @access  Private (Admin)
router.post('/training-sessions', verifyToken, requireAdmin, [
  body('village').trim().isLength({ min: 2, max: 100 }).withMessage('Village name required'),
  body('session_date').isDate().withMessage('Valid session date required'),
  body('topic').trim().isLength({ min: 5, max: 200 }).withMessage('Topic must be 5-200 characters'),
  body('instructor_name').optional().trim().isLength({ max: 100 }),
  body('max_participants').optional().isInt({ min: 1, max: 200 }),
  body('description').optional().isLength({ max: 1000 })
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

    const { village, session_date, topic, instructor_name, max_participants, description } = req.body;

    const result = await executeQuery(`
      INSERT INTO training_sessions (village, session_date, topic, instructor_name, max_participants, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [village, session_date, topic, instructor_name, max_participants || 50, description]);

    res.status(201).json({
      success: true,
      message: 'Training session created successfully',
      data: {
        session_id: result.insertId
      }
    });
  } catch (error) {
    console.error('Training session creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating training session'
    });
  }
});

// @route   GET /api/admin/training-sessions
// @desc    Get all training sessions
// @access  Private (Admin)
router.get('/training-sessions', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { village, date_from, date_to } = req.query;

    let query = `
      SELECT ts.*, 
             COUNT(ft.farmer_id) as registered_count,
             COUNT(CASE WHEN ft.attendance_status = 'attended' THEN 1 END) as attended_count
      FROM training_sessions ts
      LEFT JOIN farmer_training ft ON ts.session_id = ft.session_id
      WHERE 1=1
    `;
    
    const queryParams = [];

    if (village) {
      query += ' AND ts.village = ?';
      queryParams.push(village);
    }

    if (date_from) {
      query += ' AND ts.session_date >= ?';
      queryParams.push(date_from);
    }

    if (date_to) {
      query += ' AND ts.session_date <= ?';
      queryParams.push(date_to);
    }

    query += ' GROUP BY ts.session_id ORDER BY ts.session_date DESC';

    const sessions = await executeQuery(query, queryParams);

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

// @route   GET /api/admin/reports/export
// @desc    Export farmer data as Excel
// @access  Private (Admin)
router.get('/reports/export', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { format = 'excel', village, training_status } = req.query;

    // Get farmers data
    let query = `
      SELECT f.*, u.name, u.email, u.phone,
             bf.milk_production as baseline_production, bf.cows as baseline_cows, bf.buffaloes as baseline_buffaloes,
             ff.milk_production as followup_production, ff.cows as followup_cows, ff.buffaloes as followup_buffaloes
      FROM farmers f
      JOIN users u ON f.user_id = u.user_id
      LEFT JOIN farmer_forms bf ON f.farmer_id = bf.farmer_id AND bf.form_type = 'baseline'
      LEFT JOIN farmer_forms ff ON f.farmer_id = ff.farmer_id AND ff.form_type = 'followup'
      WHERE u.is_active = true
    `;
    
    const queryParams = [];

    if (village) {
      query += ' AND f.village = ?';
      queryParams.push(village);
    }

    if (training_status) {
      query += ' AND f.training_status = ?';
      queryParams.push(training_status);
    }

    const farmers = await executeQuery(query, queryParams);

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Farmers Data');

      // Add headers
      worksheet.columns = [
        { header: 'Farmer ID', key: 'farmer_id', width: 10 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Dairy Name', key: 'dairy_name', width: 20 },
        { header: 'Village', key: 'village', width: 15 },
        { header: 'Training Status', key: 'training_status', width: 15 },
        { header: 'Baseline Production', key: 'baseline_production', width: 18 },
        { header: 'Followup Production', key: 'followup_production', width: 18 },
        { header: 'Production Improvement', key: 'improvement', width: 20 }
      ];

      // Add data
      farmers.forEach(farmer => {
        const improvement = farmer.baseline_production && farmer.followup_production
          ? ((farmer.followup_production - farmer.baseline_production) / farmer.baseline_production * 100).toFixed(2) + '%'
          : 'N/A';

        worksheet.addRow({
          farmer_id: farmer.farmer_id,
          name: farmer.name,
          email: farmer.email,
          phone: farmer.phone,
          dairy_name: farmer.dairy_name,
          village: farmer.village,
          training_status: farmer.training_status,
          baseline_production: farmer.baseline_production || 'N/A',
          followup_production: farmer.followup_production || 'N/A',
          improvement: improvement
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=farmers_data.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.json({
        success: true,
        data: { farmers }
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error exporting data'
    });
  }
});

// @route   POST /api/admin/ai-query
// @desc    AI-powered analytics query
// @access  Private (Admin)
router.post('/ai-query', verifyToken, requireAdmin, [
  body('query').trim().isLength({ min: 5, max: 500 }).withMessage('Query must be 5-500 characters')
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

    const { query } = req.body;

    let response = {
      query: query,
      data: null,
      insights: [],
      charts: [],
      ai: null
    };

    // Simple keyword-based query handling
    const q = query.toLowerCase();
    if (q.includes('average milk') || q.includes('avg milk')) {
      // Monthly average milk production from farmer forms (baseline + followup)
      const avgMilkMonthly = await executeQuery(`
        SELECT DATE_FORMAT(date_filled, '%Y-%m') AS month,
               AVG(milk_production) AS avg_milk
        FROM farmer_forms
        WHERE date_filled >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(date_filled, '%Y-%m')
        ORDER BY month
      `);

      response.data = avgMilkMonthly;
      response.insights = [
        'Average milk production over the last 12 months computed from farmer forms.',
      ];
      response.charts = [{
        type: 'line',
        title: 'Average Milk Production Over Time',
        xKey: 'month',
        series: [{ dataKey: 'avg_milk', name: 'Avg Milk (L/day)', color: '#2e7d32' }],
        data: avgMilkMonthly
      }];
    } else if (q.includes('milk production') || q.includes('milk yield')) {
      const productionData = await executeQuery(`
        SELECT f.village,
               AVG(CASE WHEN ff.form_type = 'baseline' THEN ff.milk_production END) as avg_baseline,
               AVG(CASE WHEN ff.form_type = 'followup' THEN ff.milk_production END) as avg_followup
        FROM farmers f
        LEFT JOIN farmer_forms ff ON f.farmer_id = ff.farmer_id
        GROUP BY f.village
        HAVING avg_baseline IS NOT NULL OR avg_followup IS NOT NULL
      `);

      response.data = productionData;
      response.insights = [
        'Milk production analysis shows village-wise variations',
        'Training programs have shown positive impact on production'
      ];
      response.charts = [{
        type: 'bar',
        title: 'Village-wise Milk Production Comparison',
        xKey: 'village',
        series: [
          { dataKey: 'avg_baseline', name: 'Baseline', color: '#ff8f00' },
          { dataKey: 'avg_followup', name: 'Follow-up', color: '#2e7d32' }
        ],
        data: productionData
      }];
    } else if (query.toLowerCase().includes('village') && query.toLowerCase().includes('comparison')) {
      const villageData = await executeQuery(`
        SELECT village, COUNT(*) as farmer_count,
               COUNT(CASE WHEN training_status = 'completed' THEN 1 END) as completed_training
        FROM farmers
        GROUP BY village
        ORDER BY farmer_count DESC
      `);

      response.data = villageData;
      response.insights = [
        'Village-wise farmer distribution shows concentration in specific areas',
        'Training completion rates vary across villages'
      ];
    } else {
      response.insights = [
        'Query not recognized. Try asking about milk production, village comparison, or training statistics.'
      ];
    }

    // Try Gemini summarization over the structured data
    try {
      const aiResult = await askGemini(
        `You are helping a dairy farm admin analyze training and production data. In 4-6 bullet points, succinctly answer: ${query}. If charts are relevant, propose chart types and x/y fields.`,
        { structuredData: response.data }
      );
      response.ai = aiResult;
      if (aiResult?.text && response.insights?.length) {
        response.insights = [
          ...response.insights,
          'AI Summary: ' + aiResult.text.slice(0, 1000)
        ];
      } else if (aiResult?.text) {
        response.insights = ['AI Summary: ' + aiResult.text.slice(0, 1000)];
      }
    } catch (e) {
      // Non-fatal if AI fails
      console.error('AI summarization error:', e.message);
    }

    // Save query to database
    await executeQuery(
      'INSERT INTO admin_queries (admin_user_id, query_text, response_data) VALUES (?, ?, ?)',
      [req.user.user_id, query, JSON.stringify(response)]
    );

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('AI query error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing AI query'
    });
  }
});

module.exports = router;
