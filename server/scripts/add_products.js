/*
  Bulk add extended product catalog
  - Safe to run multiple times (checks by product name)
*/

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const { pool, executeQuery } = require('../config/database');

const PRODUCTS = [
  // Milk variants
  { name: 'Cow Milk 500ml', description: 'Fresh cow milk 500ml pouch', price: 32, unit: 'packet', category: 'milk', stock: 800 },
  { name: 'Cow Milk 1L', description: 'Fresh cow milk 1L pouch', price: 60, unit: 'liter', category: 'milk', stock: 600 },
  { name: 'Buffalo Milk 500ml', description: 'Rich buffalo milk 500ml pouch', price: 42, unit: 'packet', category: 'milk', stock: 500 },
  { name: 'Buffalo Milk 1L', description: 'Rich buffalo milk 1L pouch', price: 80, unit: 'liter', category: 'milk', stock: 400 },
  { name: 'A2 Gir Cow Milk 1L', description: 'A2 milk from Gir cows', price: 120, unit: 'liter', category: 'milk', stock: 150 },

  // Curd / Yogurt
  { name: 'Curd 200g', description: 'Thick curd 200g cup', price: 25, unit: 'packet', category: 'curd', stock: 700 },
  { name: 'Curd 400g', description: 'Thick curd 400g cup', price: 45, unit: 'packet', category: 'curd', stock: 500 },
  { name: 'Greek Yogurt 100g', description: 'High-protein Greek yogurt', price: 35, unit: 'packet', category: 'curd', stock: 300 },

  // Paneer
  { name: 'Paneer 200g', description: 'Fresh soft paneer 200g', price: 90, unit: 'packet', category: 'paneer', stock: 350 },
  { name: 'Paneer 500g', description: 'Fresh soft paneer 500g', price: 220, unit: 'packet', category: 'paneer', stock: 200 },

  // Ghee
  { name: 'Cow Ghee 200ml', description: 'Traditional cow ghee 200ml', price: 220, unit: 'packet', category: 'ghee', stock: 180 },
  { name: 'Cow Ghee 500ml', description: 'Traditional cow ghee 500ml', price: 520, unit: 'packet', category: 'ghee', stock: 120 },
  { name: 'Gir Cow A2 Ghee 500ml', description: 'A2 ghee from Gir cows', price: 950, unit: 'packet', category: 'ghee', stock: 60 },

  // Buttermilk & Lassi
  { name: 'Masala Buttermilk 200ml', description: 'Spiced chaas 200ml', price: 15, unit: 'packet', category: 'buttermilk', stock: 900 },
  { name: 'Plain Buttermilk 500ml', description: 'Traditional chaas 500ml', price: 30, unit: 'liter', category: 'buttermilk', stock: 700 },
  { name: 'Sweet Lassi 200ml', description: 'Refreshing sweet lassi', price: 20, unit: 'packet', category: 'other', stock: 500 },
  { name: 'Mango Lassi 200ml', description: 'Mango-flavored lassi', price: 25, unit: 'packet', category: 'other', stock: 400 },

  // Flavoured Milk
  { name: 'Flavoured Milk Chocolate 200ml', description: 'Chocolate flavored milk', price: 30, unit: 'packet', category: 'other', stock: 500 },
  { name: 'Flavoured Milk Strawberry 200ml', description: 'Strawberry flavored milk', price: 30, unit: 'packet', category: 'other', stock: 500 },
  { name: 'Flavoured Milk Kesar Pista 200ml', description: 'Kesar pista flavored milk', price: 35, unit: 'packet', category: 'other', stock: 400 },

  // Butter / Cream (as other)
  { name: 'White Butter 200g', description: 'Homemade white butter', price: 120, unit: 'packet', category: 'other', stock: 200 },
  { name: 'Malai 200g', description: 'Fresh cream for desserts', price: 80, unit: 'packet', category: 'other', stock: 250 }
];

async function upsertProducts() {
  let added = 0;
  for (const p of PRODUCTS) {
    const exists = await executeQuery('SELECT product_id FROM products WHERE name = ?', [p.name]);
    if (exists.length) continue;
    await executeQuery(
      'INSERT INTO products (name, description, price, stock, image_url, category, unit, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, true)',
      [p.name, p.description, p.price, p.stock, null, p.category, p.unit]
    );
    added++;
  }
  return added;
}

(async function main() {
  try {
    console.log('Adding extended product catalog...');
    const added = await upsertProducts();
    console.log(`Done. Added ${added} new products.`);
  } catch (e) {
    console.error('Bulk add products error:', e);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
})();
