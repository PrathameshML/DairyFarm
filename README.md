# Mali Dairy Farm Website

A comprehensive web application for Mali Dairy Farm that combines e-commerce functionality with farmer training management and AI-powered analytics.

## Features

### E-commerce
- Product catalog for dairy products
- Shopping cart and checkout
- Razorpay payment integration
- Order management

### Training Center
- Farmer registration system
- Training session management
- Progress tracking (before/after training)
- Village-wise farmer grouping

### Admin Dashboard
- Analytics and reporting
- Farmer data management
- Training session scheduling
- AI-powered query system

### User Roles
- **Customers**: Browse and purchase products
- **Farmers**: Register for training, fill forms, track progress
- **Admins**: Full system management and analytics

## Tech Stack

- **Frontend**: React.js with responsive design
- **Backend**: Node.js with Express
- **Database**: MySQL
- **Payment**: Razorpay API
- **Charts**: Chart.js
- **AI**: OpenAI API integration
- **Authentication**: JWT tokens

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm run install-all
   ```

3. Set up environment variables (see `.env.example`)

4. Set up MySQL database:
   ```bash
   mysql -u root -p < database/schema.sql
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

## Database Schema

The application uses the following main tables:
- Users (authentication)
- Farmers (farmer profiles)
- FarmerForms (training data)
- Products (e-commerce)
- Orders (purchase history)
- TrainingSessions (training management)

## API Endpoints

### Authentication
- POST `/api/auth/register` - User registration
- POST `/api/auth/login` - User login
- GET `/api/auth/profile` - Get user profile

### Farmers
- POST `/api/farmers/register` - Farmer registration
- GET `/api/farmers/profile` - Get farmer profile
- POST `/api/farmers/form` - Submit training form

### Products
- GET `/api/products` - Get all products
- POST `/api/products` - Add new product (admin)
- PUT `/api/products/:id` - Update product (admin)

### Orders
- POST `/api/orders` - Create new order
- GET `/api/orders` - Get user orders

### Admin
- GET `/api/admin/dashboard` - Dashboard data
- GET `/api/admin/farmers` - All farmers data
- POST `/api/admin/ai-query` - AI-powered queries

## Environment Variables

Create a `.env` file with the following variables:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=mali_dairy_farm
JWT_SECRET=your_jwt_secret
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
OPENAI_API_KEY=your_openai_key
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.
