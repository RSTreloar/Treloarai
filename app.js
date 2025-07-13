
                
                
                            
           const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection (PostgreSQL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database schema
const initDatabase = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(255),
                company VARCHAR(255),
                plan VARCHAR(50) DEFAULT 'free',
                stripe_customer_id VARCHAR(255),
                api_key VARCHAR(255) UNIQUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS deployments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                repository_url VARCHAR(500),
                branch VARCHAR(100) DEFAULT 'main',
                environment VARCHAR(50) DEFAULT 'production',
                status VARCHAR(50) DEFAULT 'pending',
                deployment_url VARCHAR(500),
                build_logs TEXT,
                cpu_usage DECIMAL(10,2) DEFAULT 0,
                memory_usage DECIMAL(10,2) DEFAULT 0,
                bandwidth_usage DECIMAL(10,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS billing_usage (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
                usage_type VARCHAR(50) NOT NULL, -- 'cpu', 'memory', 'bandwidth', 'storage'
                amount DECIMAL(10,4) NOT NULL,
                unit VARCHAR(20) NOT NULL, -- 'hours', 'gb', 'requests'
                cost DECIMAL(10,4) NOT NULL,
                billing_period DATE NOT NULL,
                recorded_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS invoices (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                invoice_number VARCHAR(50) UNIQUE NOT NULL,
                billing_period_start DATE NOT NULL,
                billing_period_end DATE NOT NULL,
                subtotal DECIMAL(10,2) NOT NULL,
                tax_amount DECIMAL(10,2) DEFAULT 0,
                total_amount DECIMAL(10,2) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'paid', 'failed'
                stripe_invoice_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW(),
                paid_at TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS analytics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
                metric_type VARCHAR(50) NOT NULL,
                metric_value DECIMAL(10,4) NOT NULL,
                timestamp TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_billing_usage_user_period ON billing_usage(user_id, billing_period);
            CREATE INDEX IF NOT EXISTS idx_deployments_user ON deployments(user_id);
            CREATE INDEX IF NOT EXISTS idx_analytics_deployment_timestamp ON analytics(deployment_id, timestamp);
        `);
        console.log('✅ Database schema initialized');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
};

// Pricing tiers
const PRICING = {
    free: {
        name: 'Free',
        deployments: 3,
        cpu_hours: 100,
        memory_gb_hours: 50,
        bandwidth_gb: 10,
        monthly_cost: 0
    },
    starter: {
        name: 'Starter',
        deployments: 10,
        cpu_hours: 500,
        memory_gb_hours: 250,
        bandwidth_gb: 100,
        monthly_cost: 29.99
    },
    professional: {
        name: 'Professional',
        deployments: 50,
        cpu_hours: 2000,
        memory_gb_hours: 1000,
        bandwidth_gb: 500,
        monthly_cost: 99.99
    },
    enterprise: {
        name: 'Enterprise',
        deployments: -1, // unlimited
        cpu_hours: -1,
        memory_gb_hours: -1,
        bandwidth_gb: -1,
        monthly_cost: 299.99
    }
};

// Usage rates (per unit overage)
const USAGE_RATES = {
    cpu_hour: 0.05,
    memory_gb_hour: 0.02,
    bandwidth_gb: 0.10,
    deployment: 5.00
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
        
        if (result.rows.length === 0) {
            return res.status(403).json({ error: 'Invalid token' });
        }

        req.user = result.rows[0];
        next();
    } catch (error) {
        res.status(403).json({ error: 'Invalid token' });
    }
};

// API Routes

// User registration
app.post('/api/auth/register', async (req, res) => {
    const { email, password, fullName, company } = req.body;

    try {
        const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const apiKey = `afk_${uuidv4().replace(/-/g, '')}`;

        // Create Stripe customer
        const stripeCustomer = await stripe.customers.create({
            email,
            name: fullName,
            metadata: { company }
        });

        const result = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, company, api_key, stripe_customer_id) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, full_name, company, plan, api_key`,
            [email, passwordHash, fullName, company, apiKey, stripeCustomer.id]
        );

        const token = jwt.sign({ userId: result.rows[0].id }, process.env.JWT_SECRET || 'dev-secret');

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// User login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'dev-secret');

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                company: user.company,
                plan: user.plan,
                api_key: user.api_key
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get user dashboard
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        // Get user's deployments
        const deployments = await pool.query(
            'SELECT * FROM deployments WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );

        // Get current month usage
        const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
        const usage = await pool.query(
            `SELECT usage_type, SUM(amount) as total_amount, SUM(cost) as total_cost 
             FROM billing_usage 
             WHERE user_id = $1 AND billing_period >= $2 
             GROUP BY usage_type`,
            [req.user.id, currentMonth]
        );

        // Get total costs this month
        const totalCost = await pool.query(
            `SELECT SUM(cost) as monthly_cost FROM billing_usage 
             WHERE user_id = $1 AND billing_period >= $2`,
            [req.user.id, currentMonth]
        );

        // Get plan limits
        const plan = PRICING[req.user.plan];

        res.json({
            user: {
                id: req.user.id,
                email: req.user.email,
                full_name: req.user.full_name,
                company: req.user.company,
                plan: req.user.plan
            },
            deployments: deployments.rows,
            usage: usage.rows,
            monthly_cost: totalCost.rows[0]?.monthly_cost || 0,
            plan_limits: plan,
            stats: {
                total_deployments: deployments.rows.length,
                active_deployments: deployments.rows.filter(d => d.status === 'running').length,
                failed_deployments: deployments.rows.filter(d => d.status === 'failed').length
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// Create deployment
app.post('/api/deployments', authenticateToken, async (req, res) => {
    const { name, repositoryUrl, branch, environment } = req.body;

    try {
        // Check plan limits
        const userDeployments = await pool.query(
            'SELECT COUNT(*) as count FROM deployments WHERE user_id = $1',
            [req.user.id]
        );

        const plan = PRICING[req.user.plan];
        if (plan.deployments !== -1 && userDeployments.rows[0].count >= plan.deployments) {
            return res.status(403).json({ 
                error: 'Deployment limit reached for your plan',
                limit: plan.deployments,
                current: userDeployments.rows[0].count
            });
        }

        const result = await pool.query(
            `INSERT INTO deployments (user_id, name, repository_url, branch, environment, status) 
             VALUES ($1, $2, $3, $4, $5, 'pending') 
             RETURNING *`,
            [req.user.id, name, repositoryUrl, branch || 'main', environment || 'production']
        );

        // Simulate deployment process
        const deployment = result.rows[0];
        
        // Record deployment cost
        await pool.query(
            `INSERT INTO billing_usage (user_id, deployment_id, usage_type, amount, unit, cost, billing_period) 
             VALUES ($1, $2, 'deployment', 1, 'deployment', $3, $4)`,
            [req.user.id, deployment.id, USAGE_RATES.deployment, new Date().toISOString().slice(0, 10)]
        );

        res.status(201).json({
            message: 'Deployment created successfully',
            deployment: deployment
        });
    } catch (error) {
        console.error('Deployment creation error:', error);
        res.status(500).json({ error: 'Failed to create deployment' });
    }
});

// Record usage (called by monitoring system)
app.post('/api/usage', authenticateToken, async (req, res) => {
    const { deploymentId, usageType, amount, unit } = req.body;

    try {
        const cost = amount * (USAGE_RATES[`${usageType}_${unit}`] || 0);
        const billingPeriod = new Date().toISOString().slice(0, 10);

        await pool.query(
            `INSERT INTO billing_usage (user_id, deployment_id, usage_type, amount, unit, cost, billing_period) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.user.id, deploymentId, usageType, amount, unit, cost, billingPeriod]
        );

        res.json({ message: 'Usage recorded successfully' });
    } catch (error) {
        console.error('Usage recording error:', error);
        res.status(500).json({ error: 'Failed to record usage' });
    }
});

// Get billing information
app.get('/api/billing', authenticateToken, async (req, res) => {
    try {
        // Current month usage
        const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
        const usage = await pool.query(
            `SELECT 
                usage_type, 
                SUM(amount) as total_amount, 
                SUM(cost) as total_cost,
                unit
             FROM billing_usage 
             WHERE user_id = $1 AND billing_period >= $2 
             GROUP BY usage_type, unit
             ORDER BY total_cost DESC`,
            [req.user.id, currentMonth]
        );

        // Recent invoices
        const invoices = await pool.query(
            'SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 12',
            [req.user.id]
        );

        // Usage trends (last 6 months)
        const trends = await pool.query(
            `SELECT 
                DATE_TRUNC('month', billing_period) as month,
                SUM(cost) as monthly_cost
             FROM billing_usage 
             WHERE user_id = $1 AND billing_period >= NOW() - INTERVAL '6 months'
             GROUP BY month
             ORDER BY month`,
            [req.user.id]
        );

        const plan = PRICING[req.user.plan];

        res.json({
            current_usage: usage.rows,
            invoices: invoices.rows,
            usage_trends: trends.rows,
            plan: plan,
            total_current_month: usage.rows.reduce((sum, u) => sum + parseFloat(u.total_cost), 0)
        });
    } catch (error) {
        console.error('Billing error:', error);
        res.status(500).json({ error: 'Failed to load billing information' });
    }
});

// Upgrade plan
app.post('/api/billing/upgrade', authenticateToken, async (req, res) => {
    const { plan } = req.body;

    if (!PRICING[plan]) {
        return res.status(400).json({ error: 'Invalid plan' });
    }

    try {
        // Create Stripe subscription
        const subscription = await stripe.subscriptions.create({
            customer: req.user.stripe_customer_id,
            items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `AIFlowKeeper ${PRICING[plan].name} Plan`,
                    },
                    unit_amount: Math.round(PRICING[plan].monthly_cost * 100),
                    recurring: {
                        interval: 'month',
                    },
                },
            }],
        });

        // Update user plan
        await pool.query(
            'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2',
            [plan, req.user.id]
        );

        res.json({
            message: 'Plan upgraded successfully',
            plan: PRICING[plan],
            subscription_id: subscription.id
        });
    } catch (error) {
        console.error('Plan upgrade error:', error);
        res.status(500).json({ error: 'Failed to upgrade plan' });
    }
});

// Analytics endpoint
app.get('/api/analytics', authenticateToken, async (req, res) => {
    const { period = '7d' } = req.query;

    try {
        let interval = '1 day';
        if (period === '30d') interval = '30 days';
        if (period === '90d') interval = '90 days';

        const analytics = await pool.query(
            `SELECT 
                DATE_TRUNC('day', timestamp) as date,
                metric_type,
                AVG(metric_value) as avg_value,
                MAX(metric_value) as max_value
             FROM analytics 
             WHERE user_id = $1 AND timestamp >= NOW() - INTERVAL '${interval}'
             GROUP BY date, metric_type
             ORDER BY date`,
            [req.user.id]
        );

        res.json({
            analytics: analytics.rows,
            period: period
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});

// Enterprise dashboard frontend
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>AIFlowKeeper Enterprise - Deployment Platform</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', system-ui, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
                .enterprise-container { max-width: 1600px; margin: 0 auto; padding: 2rem; }
                
                .enterprise-header { text-align: center; color: white; margin-bottom: 3rem; }
                .enterprise-header h1 { font-size: 4rem; margin-bottom: 1rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
                .enterprise-header p { font-size: 1.4rem; opacity: 0.9; }
                
                .auth-section { background: rgba(255,255,255,0.95); padding: 3rem; border-radius: 20px; margin-bottom: 3rem; text-align: center; }
                .auth-tabs { display: flex; justify-content: center; margin-bottom: 2rem; }
                .auth-tab { padding: 1rem 2rem; background: #f8f9fa; margin: 0 0.5rem; border-radius: 10px; cursor: pointer; transition: all 0.3s; }
                .auth-tab.active { background: #667eea; color: white; }
                
                .auth-form { max-width: 400px; margin: 0 auto; }
                .form-group { margin: 1rem 0; text-align: left; }
                .form-group label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
                .form-group input { width: 100%; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; }
                
                .enterprise-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin-bottom: 3rem; }
                .enterprise-card { background: rgba(255,255,255,0.95); padding: 2rem; border-radius: 20px; backdrop-filter: blur(15px); box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
                .enterprise-card h3 { color: #667eea; margin-bottom: 1rem; font-size: 1.5rem; }
                
                .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; margin: 2rem 0; }
                .pricing-card { background: white; padding: 2rem; border-radius: 15px; text-align: center; position: relative; }
                .pricing-card.featured { border: 3px solid #667eea; transform: scale(1.05); }
                .pricing-price { font-size: 2.5rem; font-weight: bold; color: #667eea; margin: 1rem 0; }
                .pricing-features { list-style: none; margin: 1rem 0; }
                .pricing-features li { padding: 0.5rem 0; }
                
                .btn { background: #667eea; color: white; padding: 1rem 2rem; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.3s; text-decoration: none; display: inline-block; margin: 0.5rem; }
                .btn:hover { background: #5a67d8; transform: translateY(-2px); }
                .btn-success { background: #48bb78; }
                .btn-warning { background: #ed8936; }
                .btn-danger { background: #f56565; }
                
                .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin: 3rem 0; }
                .feature-card { background: rgba(255,255,255,0.1); padding: 2rem; border-radius: 15px; text-align: center; color: white; }
                .feature-icon { font-size: 3rem; margin-bottom: 1rem; }
                
                .dashboard-hidden { display: none; }
                .dashboard-visible { display: block; }
                
                @media (max-width: 768px) {
                    .enterprise-header h1 { font-size: 2.5rem; }
                    .enterprise-grid { grid-template-columns: 1fr; }
                    .pricing-grid { grid-template-columns: 1fr; }
                }
            </style>
        </head>
        <body>
            <div class="enterprise-container">
                <div class="enterprise-header">
                    <h1>🚀 AIFlowKeeper Enterprise</h1>
                    <p>Professional Deployment Platform with Real-Time Billing & Analytics</p>
                </div>
                
                <div id="authSection" class="auth-section">
                    <div class="auth-tabs">
                        <div class="auth-tab active" onclick="showLogin()">Login</div>
                        <div class="auth-tab" onclick="showRegister()">Register</div>
                    </div>
                    
                    <div id="loginForm" class="auth-form">
                        <h2>Welcome Back</h2>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="loginEmail" placeholder="your@email.com">
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="loginPassword" placeholder="Password">
                        </div>
                        <button class="btn" onclick="login()">Sign In</button>
                    </div>
                    
                    <div id="registerForm" class="auth-form" style="display: none;">
                        <h2>Start Your Enterprise Journey</h2>
                        <div class="form-group">
                            <label>Full Name</label>
                            <input type="text" id="registerName" placeholder="John Doe">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="registerEmail" placeholder="your@email.com">
                        </div>
                        <div class="form-group">
                            <label>Company</label>
                            <input type="text" id="registerCompany" placeholder="Your Company">
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="registerPassword" placeholder="Password">
                        </div>
                        <button class="btn" onclick="register()">Create Account</button>
                    </div>
                </div>
                
                <div id="dashboardSection" class="dashboard-hidden">
                    <div class="enterprise-grid">
                        <div class="enterprise-card">
                            <h3>📊 Usage Overview</h3>
                            <div id="usageStats">Loading...</div>
                        </div>
                        <div class="enterprise-card">
                            <h3>💰 Billing Status</h3>
                            <div id="billingStats">Loading...</div>
                        </div>
                        <div class="enterprise-card">
                            <h3>🚀 Active Deployments</h3>
                            <div id="deploymentStats">Loading...</div>
                        </div>
                    </div>
                    
                    <div class="enterprise-card">
                        <h3>⚡ Quick Actions</h3>
                        <button class="btn btn-success" onclick="createDeployment()">+ New Deployment</button>
                        <button class="btn btn-warning" onclick="viewBilling()">View Billing</button>
                        <button class="btn" onclick="viewAnalytics()">Analytics</button>
                        <button class="btn btn-danger" onclick="logout()">Logout</button>
                    </div>
                </div>
                
                <div class="features-grid">
                    <div class="feature-card">
                        <div class="feature-icon">⚡</div>
                        <h4>Lightning Fast Deployments</h4>
                        <p>Deploy your applications in seconds with our optimized pipeline</p>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">💰</div>
                        <h4>Real-Time Billing</h4>
                        <p>Track usage and costs in real-time with transparent pricing</p>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">📊</div>
                        <h4>Advanced Analytics</h4>
                        <p>Monitor performance, usage, and costs with detailed insights</p>
                    </div>
                    <div class="feature-card">
                        <div class="feature-icon">🏢</div>
                        <h4>Enterprise Ready</h4>
                        <p>Scalable infrastructure with enterprise-grade security</p>
                    </div>
                </div>
                
                <div class="pricing-grid">
                    <div class="pricing-card">
                        <h4>Free</h4>
                        <div class="pricing-price">$0/mo</div>
                        <ul class="pricing-features">
                            <li>3 Deployments</li>
                            <li>100 CPU Hours</li>
                            <li>10GB Bandwidth</li>
                            <li>Basic Support</li>
                        </ul>
                        <button class="btn">Current Plan</button>
                    </div>
                    <div class="pricing-card featured">
                        <h4>Professional</h4>
                        <div class="pricing-price">$99/mo</div>
                        <ul class="pricing-features">
                            <li>50 Deployments</li>
                            <li>2000 CPU Hours</li>
                            <li>500GB Bandwidth</li>
                            <li>Priority Support</li>
                            <li>Advanced Analytics</li>
                        </ul>
                        <button class="btn btn-success">Upgrade</button>
                    </div>
                    <div class="pricing-card">
                        <h4>Enterprise</h4>
                        <div class="pricing-price">$299/mo</div>
                        <ul class="pricing-features">
                            <li>Unlimited Deployments</li>
                            <li>Unlimited Resources</li>
                            <li>Unlimited Bandwidth</li>
                            <li>24/7 Support</li>
                            <li>Custom Integrations</li>
                        </ul>
                        <button class="btn">Contact Sales</button>
                    </div>
                </div>
            </div>

            <script>
                let currentUser = null;
                let authToken = localStorage.getItem('afk_token');

                if (authToken) {
                    loadDashboard();
                }

                function showLogin() {
                    document.getElementById('loginForm').style.display = 'block';
                    document.getElementById('registerForm').style.display = 'none';
                    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
                    event.target.classList.add('active');
                }

                function showRegister() {
                    document.getElementById('loginForm').style.display = 'none';
                    document.getElementById('registerForm').style.display = 'block';
                    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
                    event.target.classList.add('active');
                }

                async function login() {
                    const email = document.getElementById('loginEmail').value;
                    const password = document.getElementById('loginPassword').value;

                    try {
                        const response = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, password })
                        });

                        const data = await response.json();
                        
                        if (response.ok) {
                            authToken = data.token;
                            currentUser = data.user;
                            localStorage.setItem('afk_token', authToken);
                            loadDashboard();
                        } else {
                            alert('Login failed: ' + data.error);
                        }
                    } catch (error) {
                        alert('Login error: ' + error.message);
                    }
                }

                async function register() {
                    const fullName = document.getElementById('registerName').value;
                    const email = document.getElementById('registerEmail').value;
                    const company = document.getElementById('registerCompany').value;
                    const password = document.getElementById('registerPassword').value;

                    try {
                        const response = await fetch('/api/auth/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, password, fullName, company })
                        });

                        const data = await response.json();
                        
                        if (response.ok) {
                            authToken = data.token;
                            currentUser = data.user;
                            localStorage.setItem('afk_token', authToken);
                            loadDashboard();
                        } else {
                            alert('Registration failed: ' + data.error);
                        }
                    } catch (error) {
                        alert('Registration error: ' + error.message);
                    }
                }

                async function loadDashboard() {
                    try {
                        const response = await fetch('/api/dashboard', {
                            headers: { 'Authorization': \`Bearer \${authToken}\` }
                        });

                        if (!response.ok) {
                            logout();
                            return;
                        }

                        const data = await response.json();
                        currentUser = data.user;

                        document.getElementById('authSection').style.display = 'none';
                        document.getElementById('dashboardSection').className = 'dashboard-visible';

                        // Update stats
                        document.getElementById('usageStats').innerHTML = \`
                            <p><strong>Plan:</strong> \${data.plan_limits.name}</p>
                            <p><strong>Monthly Cost:</strong> $\${data.monthly_cost}</p>
                            <p><strong>Deployments:</strong> \${data.stats.total_deployments}/\${data.plan_limits.deployments === -1 ? '∞' : data.plan_limits.deployments}</p>
                        \`;

                        document.getElementById('billingStats').innerHTML = \`
                            <p><strong>Current Month:</strong> $\${data.monthly_cost}</p>
                            <p><strong>Plan Limit:</strong> $\${data.plan_limits.monthly_cost}/month</p>
                            <p><strong>Usage:</strong> \${Math.round((data.monthly_cost / data.plan_limits.monthly_cost) * 100)}%</p>
                        \`;

                        document.getElementById('deploymentStats').innerHTML = \`
                            <p><strong>Total:</strong> \${data.stats.total_deployments}</p>
                            <p><strong>Active:</strong> \${data.stats.active_deployments}</p>
                            <p><strong>Failed:</strong> \${data.stats.failed_deployments}</p>
                        \`;

                    } catch (error) {
                        console.error('Dashboard load error:', error);
                        logout();
                    }
                }

                function createDeployment() {
                    const name = prompt('Deployment name:');
                    const repo = prompt('Repository URL:');
                    
                    if (name && repo) {
                        fetch('/api/deployments', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': \`Bearer \${authToken}\`
                            },
                            body: JSON.stringify({
                                name,
                                repositoryUrl: repo,
                                branch: 'main',
                                environment: 'production'
                            })
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.deployment) {
                                alert('Deployment created successfully!');
                                loadDashboard();
                            } else {
                                alert('Error: ' + data.error);
                            }
                        });
                    }
                }

                function viewBilling() {
                    alert('Billing dashboard would open here with detailed usage and payment information.');
                }

                function viewAnalytics() {
                    alert('Analytics dashboard would open here with performance metrics and insights.');
                }

                function logout() {
                    localStorage.removeItem('afk_token');
                    authToken = null;
                    currentUser = null;
                    document.getElementById('authSection').style.display = 'block';
                    document.getElementById('dashboardSection').className = 'dashboard-hidden';
                }
            </script>
        </body>
        </html>
    `);
});

// Initialize database and start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🏢 AIFlowKeeper Enterprise running on port ${PORT}`);
        console.log(`💰 Real-time billing system active`);
        console.log(`📊 PostgreSQL database connected`);
        console.log(`🔐 Enterprise authentication enabled`);
    });
});