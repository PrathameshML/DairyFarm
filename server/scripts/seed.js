/*
  Seeder for Mali Dairy Farm
  - Adds sample customers and 300 farmers
  - For each farmer: baseline + follow-up forms (randomized realistic values)
  - Adds training sessions and random registrations
  - Adds a broad product catalog with stock

  Safe to run multiple times: it checks existence by email and dairy_name+village combos.
*/

require('dotenv').config();
const { pool, executeQuery } = require('../config/database');
const bcrypt = require('bcryptjs');

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max, digits = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(digits));
const pick = (arr) => arr[rand(0, arr.length - 1)];

const VILLAGES = [
  'Maliwadi', 'Rajapur', 'Sangli', 'Tasgaon', 'Islampur', 'Karad', 'Satara', 'Kolhapur', 'Kadegaon', 'Palus',
  'Shirol', 'Miraj', 'Jaysingpur', 'Vadgaon', 'Madhavnagar', 'Nagaj', 'Manerajuri', 'Uran Islampur', 'Kupwad', 'Vita'
];

const FIRST_NAMES = ['Ramesh','Suresh','Mahesh','Ganesh','Prakash','Vikas','Nitin','Ajay','Sachin','Rahul','Sunil','Raju','Vijay','Anil','Rohit','Deepak'];
const LAST_NAMES = ['Mali','Patil','Deshmukh','Kulkarni','Jadhav','Shinde','Pawar','Chavan','More','Bhosale'];

const FEED_TYPES = ['Green','Dry','Mix'];
const BREEDING = ['Natural','Artificial Insemination','High-quality breed AI'];
const FARM_TYPES = ['Open','Closed','Mixed'];
const MILKING = ['Manual','Machine','Both'];
const FEED_BRANDS = ['Govardhan','Gokul','Samruddhi','Amul','Sudamini','Local'];

const PRODUCTS = [
  { name: 'Fresh Cow Milk', description: 'Pure cow milk', price: 60, unit: 'liter', category: 'milk', stock: 500 },
  { name: 'Buffalo Milk', description: 'Rich buffalo milk', price: 80, unit: 'liter', category: 'milk', stock: 300 },
  { name: 'Paneer', description: 'Fresh paneer', price: 380, unit: 'kg', category: 'paneer', stock: 120 },
  { name: 'Ghee', description: 'Traditional cow ghee', price: 850, unit: 'kg', category: 'ghee', stock: 60 },
  { name: 'Buttermilk', description: 'Refreshing chaas', price: 30, unit: 'liter', category: 'buttermilk', stock: 400 },
  { name: 'Curd', description: 'Thick curd', price: 70, unit: 'kg', category: 'curd', stock: 250 },
  { name: 'Flavoured Milk - Chocolate', description: 'Kids favorite', price: 35, unit: 'packet', category: 'other', stock: 300 },
  { name: 'Flavoured Milk - Strawberry', description: 'Refreshing', price: 35, unit: 'packet', category: 'other', stock: 300 },
  { name: 'Khimji Lassi', description: 'Sweet lassi', price: 40, unit: 'packet', category: 'other', stock: 200 }
];

async function ensureCustomer(i) {
  const name = `Customer ${i}`;
  const email = `customer${i}@example.com`;
  const exists = await executeQuery('SELECT user_id FROM users WHERE email = ?', [email]);
  if (exists.length) return exists[0].user_id;
  const hashed = await bcrypt.hash('password', 10);
  const res = await executeQuery(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    [name, email, hashed, 'customer']
  );
  return res.insertId;
}

async function ensureFarmer(i) {
  const fname = pick(FIRST_NAMES);
  const lname = pick(LAST_NAMES);
  const name = `${fname} ${lname}`;
  const email = `farmer${i}@example.com`;
  const village = pick(VILLAGES);
  const dairy = `${lname} Dairy ${rand(1, 999)}`;

  // user
  const u = await executeQuery('SELECT user_id FROM users WHERE email = ?', [email]);
  let userId;
  if (u.length) {
    userId = u[0].user_id;
  } else {
    const hashed = await bcrypt.hash('password', 10);
    const resU = await executeQuery(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, 'farmer']
    );
    userId = resU.insertId;
  }

  // farmer profile
  const f = await executeQuery('SELECT farmer_id FROM farmers WHERE user_id = ?', [userId]);
  let farmerId;
  if (f.length) {
    farmerId = f[0].farmer_id;
  } else {
    const resF = await executeQuery(
      'INSERT INTO farmers (user_id, dairy_name, village, farm_size, training_status) VALUES (?, ?, ?, ?, ?)',
      [userId, dairy, village, randFloat(0.5, 10.0), 'in_progress']
    );
    farmerId = resF.insertId;
  }

  // forms
  const forms = await executeQuery('SELECT form_type FROM farmer_forms WHERE farmer_id = ?', [farmerId]);
  const hasBaseline = forms.some(r => r.form_type === 'baseline');
  const hasFollowup = forms.some(r => r.form_type === 'followup');

  if (!hasBaseline) {
    const cows = rand(0, 12);
    const buffaloes = rand(0, 8);
    const milk = randFloat(5, 45);
    await executeQuery(
      `INSERT INTO farmer_forms (farmer_id, form_type, cows, buffaloes, milk_production, feed_type, breeding_method, farm_type, vaccination, rubber_mat, milking_method, feed_brand) 
       VALUES (?, 'baseline', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [farmerId, cows, buffaloes, milk, pick(FEED_TYPES), pick(BREEDING), pick(FARM_TYPES), rand(0,1)===1, rand(0,1)===1, pick(MILKING), pick(FEED_BRANDS)]
    );
  }

  if (!hasFollowup) {
    const cows = rand(0, 14);
    const buffaloes = rand(0, 10);
    const milk = randFloat(6, 60);
    await executeQuery(
      `INSERT INTO farmer_forms (farmer_id, form_type, cows, buffaloes, milk_production, feed_type, breeding_method, farm_type, vaccination, rubber_mat, milking_method, feed_brand) 
       VALUES (?, 'followup', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [farmerId, cows, buffaloes, milk, pick(FEED_TYPES), pick(BREEDING), pick(FARM_TYPES), rand(0,1)===1, rand(0,1)===1, pick(MILKING), pick(FEED_BRANDS)]
    );

    // mark completed sometimes
    if (rand(0,1)===1) {
      await executeQuery('UPDATE farmers SET training_status = ? WHERE farmer_id = ?', ['completed', farmerId]);
    }
  }

  return farmerId;
}

async function ensureProducts() {
  for (const p of PRODUCTS) {
    const exists = await executeQuery('SELECT product_id FROM products WHERE name = ?', [p.name]);
    if (exists.length) continue;
    await executeQuery(
      'INSERT INTO products (name, description, price, stock, image_url, category, unit, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, true)',
      [p.name, p.description, p.price, p.stock, null, p.category, p.unit]
    );
  }
}

async function ensureTrainingSessions() {
  // create 10 sessions spread across villages
  for (let i = 0; i < 10; i++) {
    const village = pick(VILLAGES);
    const date = new Date();
    date.setDate(date.getDate() - rand(0, 120));
    const session_date = date.toISOString().slice(0,10);
    const topic = pick(['Milk Hygiene','Balanced Feeding','AI Breeding','Housing & Comfort','Mastitis Prevention']);
    const exists = await executeQuery(
      'SELECT session_id FROM training_sessions WHERE village = ? AND session_date = ? AND topic = ?',
      [village, session_date, topic]
    );
    if (exists.length) continue;
    await executeQuery(
      'INSERT INTO training_sessions (village, session_date, topic, instructor_name, max_participants, description) VALUES (?, ?, ?, ?, ?, ?)',
      [village, session_date, topic, 'Trainer Team', 60, 'Group training session']
    );
  }
}

async function main() {
  console.log('Seeding started...');
  await ensureProducts();

  // create a few customers
  for (let i = 1; i <= 10; i++) {
    await ensureCustomer(i);
  }

  // create 300 farmers
  for (let i = 1; i <= 300; i++) {
    if (i % 25 === 0) console.log(`Farmers seeded: ${i}`);
    await ensureFarmer(i);
  }

  await ensureTrainingSessions();

  console.log('Seeding completed.');
  await pool.end();
}

main().catch(async (e) => {
  console.error('Seeding error:', e);
  try { await pool.end(); } catch {}
  process.exit(1);
});
