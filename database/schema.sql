-- Mali Dairy Farm Database Schema
CREATE DATABASE IF NOT EXISTS mali_dairy_farm;
USE mali_dairy_farm;

-- Users table for authentication
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(15),
    role ENUM('customer', 'farmer', 'admin') NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Farmers table for farmer-specific information
CREATE TABLE farmers (
    farmer_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    dairy_name VARCHAR(100) NOT NULL,
    village VARCHAR(100) NOT NULL,
    farm_size DECIMAL(10,2), -- in acres (for future use)
    registration_date DATE DEFAULT (CURRENT_DATE),
    training_status ENUM('not_started', 'in_progress', 'completed') DEFAULT 'not_started',
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Farmer forms for before and after training data
CREATE TABLE farmer_forms (
    form_id INT PRIMARY KEY AUTO_INCREMENT,
    farmer_id INT NOT NULL,
    form_type ENUM('baseline', 'followup') NOT NULL,
    date_filled DATE DEFAULT (CURRENT_DATE),
    cows INT NOT NULL DEFAULT 0,
    buffaloes INT NOT NULL DEFAULT 0,
    milk_production DECIMAL(8,2) NOT NULL, -- liters per day
    feed_type ENUM('Green', 'Dry', 'Mix') NOT NULL,
    breeding_method ENUM('Natural', 'Artificial Insemination', 'High-quality breed AI') NOT NULL,
    farm_type ENUM('Open', 'Closed', 'Mixed') NOT NULL,
    vaccination BOOLEAN NOT NULL,
    rubber_mat BOOLEAN NOT NULL,
    milking_method ENUM('Manual', 'Machine', 'Both') NOT NULL,
    feed_brand ENUM('Govardhan', 'Gokul', 'Samruddhi', 'Amul', 'Sudamini', 'Local') NOT NULL,
    additional_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id) ON DELETE CASCADE
);

-- Products table for e-commerce
CREATE TABLE products (
    product_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    image_url VARCHAR(255),
    category ENUM('milk', 'paneer', 'buttermilk', 'ghee', 'curd', 'other') NOT NULL,
    unit ENUM('liter', 'kg', 'piece', 'packet') NOT NULL DEFAULT 'liter',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Orders table for purchase history
CREATE TABLE orders (
    order_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    payment_id VARCHAR(100), -- Razorpay payment ID
    order_status ENUM('placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'placed',
    delivery_address TEXT NOT NULL,
    phone VARCHAR(15) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Order items for detailed order information
CREATE TABLE order_items (
    item_id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL, -- price at time of order
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
);

-- Training sessions table
CREATE TABLE training_sessions (
    session_id INT PRIMARY KEY AUTO_INCREMENT,
    village VARCHAR(100) NOT NULL,
    session_date DATE NOT NULL,
    topic VARCHAR(200) NOT NULL,
    instructor_name VARCHAR(100),
    max_participants INT DEFAULT 50,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Many-to-many relationship between farmers and training sessions
CREATE TABLE farmer_training (
    id INT PRIMARY KEY AUTO_INCREMENT,
    farmer_id INT NOT NULL,
    session_id INT NOT NULL,
    attendance_status ENUM('registered', 'attended', 'absent') DEFAULT 'registered',
    feedback TEXT,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES training_sessions(session_id) ON DELETE CASCADE,
    UNIQUE KEY unique_farmer_session (farmer_id, session_id)
);

-- Admin queries log for AI system
CREATE TABLE admin_queries (
    query_id INT PRIMARY KEY AUTO_INCREMENT,
    admin_user_id INT NOT NULL,
    query_text TEXT NOT NULL,
    response_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Insert default admin user
INSERT INTO users (name, email, password, role) VALUES 
('Admin', 'admin@malidairyfarm.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- Insert sample products
INSERT INTO products (name, description, price, stock, category, unit) VALUES
('Fresh Cow Milk', 'Pure and fresh cow milk, delivered daily', 60.00, 100, 'milk', 'liter'),
('Buffalo Milk', 'Rich and creamy buffalo milk', 80.00, 50, 'milk', 'liter'),
('Paneer', 'Fresh homemade paneer from pure milk', 400.00, 20, 'paneer', 'kg'),
('Buttermilk', 'Refreshing traditional buttermilk', 30.00, 30, 'buttermilk', 'liter'),
('Pure Ghee', 'Traditional cow ghee made from fresh cream', 800.00, 15, 'ghee', 'kg'),
('Fresh Curd', 'Thick and creamy curd made from pure milk', 70.00, 25, 'curd', 'kg');

-- Create indexes for better performance
CREATE INDEX idx_farmers_village ON farmers(village);
CREATE INDEX idx_farmer_forms_farmer_id ON farmer_forms(farmer_id);
CREATE INDEX idx_farmer_forms_type ON farmer_forms(form_type);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_training_sessions_village ON training_sessions(village);
CREATE INDEX idx_training_sessions_date ON training_sessions(session_date);
