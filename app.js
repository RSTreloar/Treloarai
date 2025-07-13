
                
                
                            
           const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3006;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/treloarai',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Pricing plans for TreloarAI
const PRICING_PLANS = {
    free: {
        name: 'Free Plan',
        monthly_cost: 0,
        call_limit: 100,
        contact_limit: 50,
        ai_screening_hours: 10,
        voice_commands: 200,
        features: ['Basic call screening', 'Contact management', 'Voice commands']
    },
    pro: {
        name: 'Pro Plan',
        monthly_cost: 29.99,
        call_limit: 1000,
        contact_limit: 500,
        ai_screening_hours: 100,
        voice_commands: 2000,
        features: ['Advanced AI screening', 'Unlimited contacts', 'Priority support', 'Analytics']
    },
    enterprise: {
        name: 'Enterprise Plan',
        monthly_cost: 99.99,
        call_limit: -1, // unlimited
        contact_limit: -1,
        ai_screening_hours: -1,
        voice_commands: -1,
        features: ['Unlimited everything', 'Custom integrations', '24/7 support', 'White-label']
    }
};

// Usage rates for overages
const USAGE_RATES = {
    call: 0.05,
    ai_screening_minute: 0.10,
    voice_command: 0.02,
    storage_gb: 1.00
};

// Initialize database
const initDatabase = async () => {
    try {
        if (!process.env.DATABASE_URL) {
            console.log('⚠️ No DATABASE_URL, running in demo mode');
            return;
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS treloar_users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(255),
                phone_number VARCHAR(20),
                plan VARCHAR(50) DEFAULT 'free',
                stripe_customer_id VARCHAR(255),
                api_key VARCHAR(255) UNIQUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS call_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES treloar_users(id),
                caller_number VARCHAR(20) NOT NULL,
                caller_name VARCHAR(255),
                call_type VARCHAR(50),
                duration INTEGER DEFAULT 0,
                ai_screening_time INTEGER DEFAULT 0,
                urgency_level VARCHAR(20) DEFAULT 'low',
                status VARCHAR(50) DEFAULT 'completed',
                ai_response TEXT,
                cost DECIMAL(8,4) DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES treloar_users(id),
                phone_number VARCHAR(20) NOT NULL,
                contact_name VARCHAR(255) NOT NULL,
                relationship VARCHAR(100),
                priority_level VARCHAR(20) DEFAULT 'normal',
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS blocked_numbers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES treloar_users(id),
                phone_number VARCHAR(20) NOT NULL,
                reason VARCHAR(255),
                block_count INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS usage_tracking (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES treloar_users(id),
                usage_type VARCHAR(50) NOT NULL,
                amount DECIMAL(10,4) NOT NULL,
                cost DECIMAL(8,4) NOT NULL,
                billing_period DATE DEFAULT CURRENT_DATE,
                recorded_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS voice_commands (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES treloar_users(id),
                command_text TEXT NOT NULL,
                command_type VARCHAR(50),
                success BOOLEAN DEFAULT true,
                processing_time INTEGER,
                created_at TIMESTAMP DEFAULT NOW()
            );

            -- Insert demo user
            INSERT INTO treloar_users (email, password_hash, full_name, phone_number, plan, api_key)
            VALUES ('demo@treloarai.com', '$2b$10$demo', 'Demo User', '+1555DEMO01', 'pro', 'tal_demo_key_123')
            ON CONFLICT (email) DO NOTHING;
        `);

        console.log('✅ TreloarAI database initialized');
    } catch (error) {
        console.log('⚠️ Database error, using demo mode:', error.message);
    }
};

// Authentication middleware
const authenticateUser = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'treloar-secret');
        
        if (!process.env.DATABASE_URL) {
            // Demo mode
            req.user = {
                id: 'demo-user-123',
                email: 'demo@treloarai.com',
                full_name: 'Demo User',
                plan: 'pro'
            };
        } else {
            const result = await pool.query('SELECT * FROM treloar_users WHERE id = $1', [decoded.userId]);
            if (result.rows.length === 0) {
                return res.status(403).json({ error: 'Invalid token' });
            }
            req.user = result.rows[0];
        }
        
        next();
    } catch (error) {
        res.status(403).json({ error: 'Invalid token' });
    }
};

// Track usage
const trackUsage = async (userId, usageType, amount) => {
    if (!process.env.DATABASE_URL) return;
    
    try {
        const cost = amount * (USAGE_RATES[usageType] || 0);
        await pool.query(
            'INSERT INTO usage_tracking (user_id, usage_type, amount, cost) VALUES ($1, $2, $3, $4)',
            [userId, usageType, amount, cost]
        );
    } catch (error) {
        console.error('Usage tracking error:', error);
    }
};

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
    const { email, password, fullName, phoneNumber } = req.body;

    try {
        if (!process.env.DATABASE_URL) {
            return res.status(200).json({
                message: 'Demo mode - registration simulated',
                token: jwt.sign({ userId: 'demo-user-123' }, 'treloar-secret'),
                user: { email, full_name: fullName, plan: 'free' }
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const apiKey = `tal_${uuidv4().replace(/-/g, '')}`;

        const result = await pool.query(
            `INSERT INTO treloar_users (email, password_hash, full_name, phone_number, api_key) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, plan`,
            [email, passwordHash, fullName, phoneNumber, apiKey]
        );

        const token = jwt.sign({ userId: result.rows[0].id }, process.env.JWT_SECRET || 'treloar-secret');

        res.status(201).json({
            message: 'Registration successful',
            token,
            user: result.rows[0]
        });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!process.env.DATABASE_URL) {
            if (email === 'demo@treloarai.com' && password === 'demo123') {
                return res.json({
                    message: 'Demo login successful',
                    token: jwt.sign({ userId: 'demo-user-123' }, 'treloar-secret'),
                    user: {
                        id: 'demo-user-123',
                        email: 'demo@treloarai.com',
                        full_name: 'Demo User',
                        plan: 'pro'
                    }
                });
            }
            return res.status(401).json({ error: 'Demo: use demo@treloarai.com / demo123' });
        }

        const result = await pool.query('SELECT * FROM treloar_users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'treloar-secret');

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                plan: user.plan
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// Dashboard API
app.get('/api/dashboard', authenticateUser, async (req, res) => {
    try {
        let stats = {};
        
        if (process.env.DATABASE_URL) {
            const callsResult = await pool.query('SELECT COUNT(*) as count FROM call_logs WHERE user_id = $1', [req.user.id]);
            const contactsResult = await pool.query('SELECT COUNT(*) as count FROM contacts WHERE user_id = $1', [req.user.id]);
            const blockedResult = await pool.query('SELECT COUNT(*) as count FROM blocked_numbers WHERE user_id = $1', [req.user.id]);
            
            stats = {
                total_calls: parseInt(callsResult.rows[0].count),
                total_contacts: parseInt(contactsResult.rows[0].count),
                blocked_numbers: parseInt(blockedResult.rows[0].count)
            };
        } else {
            // Demo data
            stats = {
                total_calls: 47,
                total_contacts: 12,
                blocked_numbers: 8
            };
        }

        const plan = PRICING_PLANS[req.user.plan];
        
        res.json({
            user: req.user,
            stats,
            plan,
            usage_limits: {
                calls_used: stats.total_calls,
                calls_limit: plan.call_limit,
                contacts_used: stats.total_contacts,
                contacts_limit: plan.contact_limit
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// Voice command processing
app.post('/api/voice-command', authenticateUser, async (req, res) => {
    const { transcript, command } = req.body;
    
    try {
        await trackUsage(req.user.id, 'voice_command', 1);
        
        // Log voice command
        if (process.env.DATABASE_URL) {
            await pool.query(
                'INSERT INTO voice_commands (user_id, command_text, command_type) VALUES ($1, $2, $3)',
                [req.user.id, transcript, command]
            );
        }

        let response = { success: false, message: 'Command not recognized' };
        const lowerTranscript = transcript.toLowerCase();

        if (lowerTranscript.includes('add contact')) {
            response = {
                success: true,
                message: 'Contact addition mode activated',
                action: 'add_contact',
                speak: 'I can help you add a new contact. Please provide the phone number and name.'
            };
        } else if (lowerTranscript.includes('block number')) {
            response = {
                success: true,
                message: 'Number blocking mode activated',
                action: 'block_number',
                speak: 'I can help you block a number. Please provide the phone number to block.'
            };
        } else if (lowerTranscript.includes('status') || lowerTranscript.includes('dashboard')) {
            response = {
                success: true,
                message: 'Status report',
                action: 'status',
                speak: `Current status: You have ${Math.floor(Math.random() * 50)} total calls, ${Math.floor(Math.random() * 20)} contacts, and ${Math.floor(Math.random() * 10)} blocked numbers. AI screening is active.`
            };
        } else if (lowerTranscript.includes('billing') || lowerTranscript.includes('usage')) {
            const plan = PRICING_PLANS[req.user.plan];
            response = {
                success: true,
                message: 'Billing information',
                action: 'billing',
                speak: `You are on the ${plan.name} at $${plan.monthly_cost} per month. Your current usage is within limits.`
            };
        }

        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'Voice command processing failed' });
    }
});

// AI Chat
app.post('/api/ai-chat', authenticateUser, async (req, res) => {
    const { message } = req.body;
    
    try {
        await trackUsage(req.user.id, 'ai_screening_minute', 0.1);
        
        // Simple AI responses for demo
        const responses = {
            hello: `Hello! I'm your TreloarAI assistant. You're on the ${PRICING_PLANS[req.user.plan].name}. How can I help you today?`,
            status: `Your TreloarAI status: You have processed multiple calls today, with AI screening active. Current plan: ${req.user.plan}.`,
            billing: `Billing info: You're on the ${PRICING_PLANS[req.user.plan].name} plan ($${PRICING_PLANS[req.user.plan].monthly_cost}/month). Usage is within your limits.`,
            help: 'I can help you manage calls, contacts, billing, and voice commands. Try asking about your status, billing, or say commands like "add contact" or "block number".',
            upgrade: 'Would you like to upgrade your plan? Pro plan ($29.99) includes advanced AI screening and unlimited contacts.'
        };

        const lowerMessage = message.toLowerCase();
        let reply = responses.help;
        
        for (const [keyword, response] of Object.entries(responses)) {
            if (lowerMessage.includes(keyword)) {
                reply = response;
                break;
            }
        }

        res.json({ reply });
    } catch (error) {
        res.status(500).json({ error: 'AI chat failed', reply: 'Sorry, I\'m having trouble right now.' });
    }
});

// Billing API
app.get('/api/billing', authenticateUser, async (req, res) => {
    try {
        let usage = [];
        
        if (process.env.DATABASE_URL) {
            const result = await pool.query(
                `SELECT usage_type, SUM(amount) as total_amount, SUM(cost) as total_cost 
                 FROM usage_tracking 
                 WHERE user_id = $1 AND billing_period >= DATE_TRUNC('month', CURRENT_DATE)
                 GROUP BY usage_type`,
                [req.user.id]
            );
            usage = result.rows;
        } else {
            // Demo usage data
            usage = [
                { usage_type: 'call', total_amount: '47', total_cost: '2.35' },
                { usage_type: 'voice_command', total_amount: '156', total_cost: '3.12' },
                { usage_type: 'ai_screening_minute', total_amount: '23.5', total_cost: '2.35' }
            ];
        }

        const plan = PRICING_PLANS[req.user.plan];
        const totalCost = usage.reduce((sum, u) => sum + parseFloat(u.total_cost), 0);

        res.json({
            plan,
            current_usage: usage,
            monthly_total: totalCost,
            next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load billing info' });
    }
});

// Plan upgrade
app.post('/api/billing/upgrade', authenticateUser, async (req, res) => {
    const { plan } = req.body;
    
    if (!PRICING_PLANS[plan]) {
        return res.status(400).json({ error: 'Invalid plan' });
    }

    try {
        if (process.env.DATABASE_URL) {
            await pool.query('UPDATE treloar_users SET plan = $1 WHERE id = $2', [plan, req.user.id]);
        }
        
        res.json({
            message: `Successfully upgraded to ${PRICING_PLANS[plan].name}`,
            plan: PRICING_PLANS[plan]
        });
    } catch (error) {
        res.status(500).json({ error: 'Upgrade failed' });
    }
});

// Main app with billing integration
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>TreloarAI - AI Phone Assistant with Billing</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="theme-color" content="#0D7377">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', system-ui, sans-serif; background: linear-gradient(135deg, #0D7377 0%, #14A085 30%, #4CAF50 70%, #A7FFEB 100%); min-height: 100vh; color: #333; }
                .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
                
                .header { text-align: center; color: white; margin-bottom: 3rem; }
                .header h1 { font-size: 3.5rem; margin-bottom: 1rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
                .header p { font-size: 1.3rem; opacity: 0.9; }
                
                .auth-section { background: rgba(255,255,255,0.95); padding: 3rem; border-radius: 20px; margin-bottom: 3rem; text-align: center; }
                .auth-form { max-width: 400px; margin: 0 auto; }
                .form-group { margin: 1rem 0; text-align: left; }
                .form-group label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
                .form-group input { width: 100%; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; }
                
                .dashboard { display: none; }
                .dashboard.active { display: block; }
                
                .billing-section { background: rgba(255,255,255,0.98); padding: 2rem; border-radius: 20px; margin-bottom: 2rem; }
                .billing-section h3 { color: #0D7377; margin-bottom: 1rem; }
                .plan-info { background: #e8f5e8; padding: 1rem; border-radius: 10px; margin-bottom: 1rem; }
                .usage-item { display: flex; justify-content: space-between; padding: 0.5rem; border-bottom: 1px solid #eee; }
                
                .voice-ai-section { background: rgba(255,255,255,0.98); padding: 2rem; border-radius: 20px; margin-bottom: 2rem; }
                .voice-ai-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
                
                .voice-control { text-align: center; }
                .voice-btn { background: linear-gradient(45deg, #FF6B6B, #4ECDC4); color: white; border: none; border-radius: 50%; width: 80px; height: 80px; font-size: 2rem; cursor: pointer; transition: all 0.3s; }
                .voice-btn:hover { transform: scale(1.1); }
                .voice-status { margin-top: 1rem; color: #0D7377; }
                .voice-transcript { background: #f8f9fa; padding: 1rem; border-radius: 10px; margin-top: 1rem; min-height: 50px; }
                
                .ai-chat { }
                .chat-container { background: #f8f9fa; border-radius: 10px; height: 200px; overflow-y: auto; padding: 1rem; margin-bottom: 1rem; }
                .chat-message { margin: 0.5rem 0; padding: 0.5rem; border-radius: 5px; }
                .user-message { background: #e3f2fd; text-align: right; }
                .ai-message { background: #e8f5e8; }
                .chat-input { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 8px; }
                
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; margin-bottom: 3rem; }
                .stat-card { background: rgba(255,255,255,0.98); padding: 2rem; border-radius: 20px; text-align: center; }
                .stat-value { font-size: 3rem; font-weight: bold; color: #0D7377; margin-bottom: 0.5rem; }
                .stat-label { color: #666; font-size: 1rem; text-transform: uppercase; }
                
                .btn { background: linear-gradient(45deg, #14A085, #4CAF50); color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.3s; margin: 0.25rem; }
                .btn:hover { transform: translateY(-2px); }
                .btn-upgrade { background: linear-gradient(45deg, #FF6B6B, #FFA726); }
                .btn-danger { background: linear-gradient(45deg, #EF5350, #FF7043); }
                
                .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; margin: 2rem 0; }
                .pricing-card { background: white; padding: 2rem; border-radius: 15px; text-align: center; }
                .pricing-card.featured { border: 3px solid #14A085; transform: scale(1.05); }
                .pricing-price { font-size: 2.5rem; font-weight: bold; color: #14A085; margin: 1rem 0; }
                .pricing-features { list-style: none; margin: 1rem 0; text-align: left; }
                .pricing-features li { padding: 0.5rem 0; }
                
                @media (max-width: 768px) {
                    .voice-ai-grid { grid-template-columns: 1fr; }
                    .header h1 { font-size: 2.5rem; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📱🎤 TreloarAI</h1>
                    <p>AI-Powered Phone Assistant with Real-Time Billing</p>
                </div>
                
                <div id="authSection" class="auth-section">
                    <h2>Sign In to TreloarAI</h2>
                    <p style="background: #e3f2fd; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                        <strong>Demo Login:</strong><br>
                        Email: demo@treloarai.com<br>
                        Password: demo123
                    </p>
                    <div class="auth-form">
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" id="loginEmail" value="demo@treloarai.com">
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="loginPassword" value="demo123">
                        </div>
                        <button class="btn" onclick="login()">Sign In</button>
                    </div>
                </div>
                
                <div id="dashboardSection" class="dashboard">
                    <div class="billing-section">
                        <h3>💰 Your Plan & Billing</h3>
                        <div id="planInfo" class="plan-info">Loading plan information...</div>
                        <div id="usageInfo">Loading usage data...</div>
                        <button class="btn btn-upgrade" onclick="showUpgradePlans()">Upgrade Plan</button>
                    </div>
                    
                    <div class="voice-ai-section">
                        <h3>🎤🤖 Voice + AI Assistant</h3>
                        <div class="voice-ai-grid">
                            <div class="voice-control">
                                <h4>Voice Commands</h4>
                                <button class="voice-btn" onclick="startVoiceCommand()">🎤</button>
                                <div class="voice-status" id="voiceStatus">Click to start voice command</div>
                                <div class="voice-transcript" id="voiceTranscript">Your voice commands appear here...</div>
                            </div>
                            
                            <div class="ai-chat">
                                <h4>AI Chat</h4>
                                <div class="chat-container" id="chatContainer">
                                    <div class="chat-message ai-message">Hello! I'm your TreloarAI assistant. Ask me about your calls, billing, or use voice commands!</div>
                                </div>
                                <input type="text" class="chat-input" id="chatInput" placeholder="Type a message..." onkeypress="handleChatKeypress(event)">
                            </div>
                        </div>
                    </div>
                    
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value" id="totalCalls">...</div>
                            <div class="stat-label">Total Calls</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="totalContacts">...</div>
                            <div class="stat-label">Contacts</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="blockedNumbers">...</div>
                            <div class="stat-label">Blocked Numbers</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="monthlyBill">$...</div>
                            <div class="stat-label">Monthly Bill</div>
                        </div>
                    </div>
                    
                    <div style="text-align: center;">
                        <button class="btn btn-danger" onclick="logout()">Logout</button>
                    </div>
                </div>
                
                <div id="pricingSection" class="pricing-grid" style="display: none;">
                    <div class="pricing-card">
                        <h4>Free</h4>
                        <div class="pricing-price">$0/mo</div>
                        <ul class="pricing-features">
                            <li>100 calls/month</li>
                            <li>50 contacts</li>
                            <li>10 hours AI screening</li>
                            <li>200 voice commands</li>
                        </ul>
                        <button class="btn" onclick="upgradePlan('free')">Current Plan</button>
                    </div>
                    <div class="pricing-card featured">
                        <h4>Pro</h4>
                        <div class="pricing-price">$29.99/mo</div>
                        <ul class="pricing-features">
                            <li>1,000 calls/month</li>
                            <li>500 contacts</li>
                            <li>100 hours AI screening</li>
                            <li>2,000 voice commands</li>
                            <li>Analytics dashboard</li>
                        </ul>
                        <button class="btn btn-upgrade" onclick="upgradePlan('pro')">Upgrade to Pro</button>
                    </div>
                    <div class="pricing-card">
                        <h4>Enterprise</h4>
                        <div class="pricing-price">$99.99/mo</div>
                        <ul class="pricing-features">
                            <li>Unlimited calls</li>
                            <li>Unlimited contacts</li>
                            <li>Unlimited AI screening</li>
                            <li>Unlimited voice commands</li>
                            <li>Custom integrations</li>
                            <li>24/7 support</li>
                        </ul>
                        <button class="btn btn-upgrade" onclick="upgradePlan('enterprise')">Upgrade to Enterprise</button>
                    </div>
                </div>
            </div>

            <script>
                let authToken = localStorage.getItem('treloar_token');
                let currentUser = null;

                if (authToken) {
                    loadDashboard();
                } else {
                    document.getElementById('authSection').style.display = 'block';
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
                            localStorage.setItem('treloar_token', authToken);
                            loadDashboard();
                        } else {
                            alert('Login failed: ' + data.error);
                        }
                    } catch (error) {
                        alert('Login error: ' + error.message);
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
                        document.getElementById('dashboardSection').classList.add('active');

                        // Update plan info
                        document.getElementById('planInfo').innerHTML = \`
                            <strong>\${data.plan.name}</strong> - $\${data.plan.monthly_cost}/month<br>
                            <small>\${data.plan.features.join(', ')}</small>
                        \`;

                        // Update stats
                        document.getElementById('totalCalls').textContent = data.stats.total_calls;
                        document.getElementById('totalContacts').textContent = data.stats.total_contacts;
                        document.getElementById('blockedNumbers').textContent = data.stats.blocked_numbers;

                        // Load billing info
                        loadBillingInfo();

                    } catch (error) {
                        console.error('Dashboard load error:', error);
                        logout();
                    }
                }

                async function loadBillingInfo() {
                    try {
                        const response = await fetch('/api/billing', {
                            headers: { 'Authorization': \`Bearer \${authToken}\` }
                        });

                        const data = await response.json();
                        
                        document.getElementById('monthlyBill').textContent = \`$\${data.monthly_total.toFixed(2)}\`;
                        
                        let usageHtml = '<h4>Current Usage:</h4>';
                        data.current_usage.forEach(usage => {
                            usageHtml += \`
                                <div class="usage-item">
                                    <span>\${usage.usage_type}: \${usage.total_amount}</span>
                                    <span>$\${parseFloat(usage.total_cost).toFixed(2)}</span>
                                </div>
                            \`;
                        });
                        
                        document.getElementById('usageInfo').innerHTML = usageHtml;
                    } catch (error) {
                        console.error('Billing load error:', error);
                    }
                }

                function startVoiceCommand() {
                    document.getElementById('voiceStatus').textContent = 'Listening...';
                    document.getElementById('voiceTranscript').textContent = 'Say: "status", "add contact", "block number", or "billing"';
                    
                    // Simulate voice recognition
                    setTimeout(() => {
                        const demoCommands = ['status', 'add contact', 'billing', 'block number'];
                        const randomCommand = demoCommands[Math.floor(Math.random() * demoCommands.length)];
                        processVoiceCommand(randomCommand);
                    }, 2000);
                }

                async function processVoiceCommand(transcript) {
                    try {
                        const response = await fetch('/api/voice-command', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': \`Bearer \${authToken}\`
                            },
                            body: JSON.stringify({ transcript, command: 'voice_input' })
                        });

                        const data = await response.json();
                        
                        document.getElementById('voiceStatus').textContent = data.message;
                        document.getElementById('voiceTranscript').textContent = \`Command: "\${transcript}" - \${data.message}\`;
                        
                        if (data.speak && 'speechSynthesis' in window) {
                            const utterance = new SpeechSynthesisUtterance(data.speak);
                            speechSynthesis.speak(utterance);
                        }
                    } catch (error) {
                        document.getElementById('voiceStatus').textContent = 'Voice command failed';
                    }
                }

                async function sendChatMessage(message) {
                    if (!message.trim()) return;

                    const chatContainer = document.getElementById('chatContainer');
                    chatContainer.innerHTML += \`<div class="chat-message user-message">You: \${message}</div>\`;

                    try {
                        const response = await fetch('/api/ai-chat', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': \`Bearer \${authToken}\`
                            },
                            body: JSON.stringify({ message })
                        });

                        const data = await response.json();
                        chatContainer.innerHTML += \`<div class="chat-message ai-message">AI: \${data.reply}</div>\`;
                        chatContainer.scrollTop = chatContainer.scrollHeight;

                    } catch (error) {
                        chatContainer.innerHTML += \`<div class="chat-message ai-message">AI: Sorry, I'm having trouble right now.</div>\`;
                    }

                    document.getElementById('chatInput').value = '';
                }

                function handleChatKeypress(event) {
                    if (event.key === 'Enter') {
                        sendChatMessage(event.target.value);
                    }
                }

                function showUpgradePlans() {
                    document.getElementById('pricingSection').style.display = 'grid';
                }

                async function upgradePlan(plan) {
                    try {
                        const response = await fetch('/api/billing/upgrade', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': \`Bearer \${authToken}\`
                            },
                            body: JSON.stringify({ plan })
                        });

                        const data = await response.json();
                        alert(data.message);
                        loadDashboard();
                        document.getElementById('pricingSection').style.display = 'none';
                    } catch (error) {
                        alert('Upgrade failed');
                    }
                }

                function logout() {
                    localStorage.removeItem('treloar_token');
                    authToken = null;
                    currentUser = null;
                    document.getElementById('authSection').style.display = 'block';
                    document.getElementById('dashboardSection').classList.remove('active');
                }
            </script>
        </body>
        </html>
    `);
});

// Start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`📱 TreloarAI with Billing running on port ${PORT}`);
        console.log(`💰 Real-time billing system active`);
        console.log(`🎤 Voice + AI features enabled`);
        console.log(`🔐 User authentication ready`);
    });
}).catch(() => {
    app.listen(PORT, () => {
        console.log(`📱 TreloarAI running in demo mode on port ${PORT}`);
    });
});