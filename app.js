const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const db = new sqlite3.Database('./treloarai.db');

// Initialize database
db.serialize(() => {
    // Whitelist table
    db.run(`CREATE TABLE IF NOT EXISTS whitelist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT UNIQUE,
        contact_name TEXT,
        relationship TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Blocked numbers table
    db.run(`CREATE TABLE IF NOT EXISTS blocked (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT UNIQUE,
        reason TEXT,
        attempts INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Call history table
    db.run(`CREATE TABLE IF NOT EXISTS call_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT,
        caller_name TEXT,
        call_type TEXT,
        duration INTEGER,
        transcript TEXT,
        urgency_level TEXT,
        status TEXT,
        ai_action TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Call instructions table
    db.run(`CREATE TABLE IF NOT EXISTS call_instructions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT UNIQUE,
        instructions TEXT,
        special_handling TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_name TEXT UNIQUE,
        setting_value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insert sample data
    db.get("SELECT COUNT(*) as count FROM whitelist", (err, row) => {
        if (row.count === 0) {
            db.run(`INSERT INTO whitelist (phone_number, contact_name, relationship) VALUES 
                ('+1234567890', 'Emergency Contact', 'Family'),
                ('+1987654321', 'Dr. Smith', 'Doctor'),
                ('+1555123456', 'Work Assistant', 'Professional')`);
            
            db.run(`INSERT INTO blocked (phone_number, reason, attempts) VALUES 
                ('+1800SPAM99', 'Telemarketer', 5),
                ('+1999ROBO00', 'Robocall', 3)`);
            
            db.run(`INSERT INTO call_history (phone_number, caller_name, call_type, duration, urgency_level, status, ai_action) VALUES 
                ('+1234567890', 'Emergency Contact', 'urgent', 120, 'high', 'answered', 'immediate_notify'),
                ('+1555999888', 'Unknown Caller', 'screening', 45, 'low', 'screened', 'ai_handled'),
                ('+1800SPAM99', 'Telemarketer', 'blocked', 0, 'none', 'blocked', 'auto_block')`);
            
            db.run(`INSERT INTO settings (setting_name, setting_value) VALUES 
                ('ai_enabled', 'true'),
                ('urgent_threshold', '3'),
                ('screening_mode', 'intelligent'),
                ('notification_level', 'high')`);
        }
    });
});

// API Routes

// Get dashboard stats
app.get('/api/stats', (req, res) => {
    const stats = {};
    
    db.get("SELECT COUNT(*) as count FROM whitelist", (err, whitelistCount) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.whitelist_count = whitelistCount.count;
        
        db.get("SELECT COUNT(*) as count FROM blocked", (err, blockedCount) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.blocked_count = blockedCount.count;
            
            db.get("SELECT COUNT(*) as count FROM call_history WHERE date(timestamp) = date('now')", (err, todayCalls) => {
                if (err) return res.status(500).json({ error: err.message });
                stats.todays_calls = todayCalls.count;
                
                db.get("SELECT COUNT(*) as count FROM call_history WHERE urgency_level = 'high' AND date(timestamp) = date('now')", (err, urgentCalls) => {
                    if (err) return res.status(500).json({ error: err.message });
                    stats.urgent_calls = urgentCalls.count;
                    
                    res.json(stats);
                });
            });
        });
    });
});

// Whitelist operations
app.get('/api/whitelist', (req, res) => {
    db.all("SELECT * FROM whitelist ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/whitelist', (req, res) => {
    const { phone_number, contact_name, relationship } = req.body;
    db.run("INSERT INTO whitelist (phone_number, contact_name, relationship) VALUES (?, ?, ?)",
        [phone_number, contact_name, relationship], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: 'Contact added to whitelist' });
        });
});

app.delete('/api/whitelist/:id', (req, res) => {
    db.run("DELETE FROM whitelist WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Contact removed from whitelist' });
    });
});

// Blocked numbers operations
app.get('/api/blocked', (req, res) => {
    db.all("SELECT * FROM blocked ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/blocked', (req, res) => {
    const { phone_number, reason } = req.body;
    db.run("INSERT INTO blocked (phone_number, reason) VALUES (?, ?)",
        [phone_number, reason], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: 'Number blocked successfully' });
        });
});

// Call history
app.get('/api/call-history', (req, res) => {
    db.all("SELECT * FROM call_history ORDER BY timestamp DESC LIMIT 50", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Settings
app.get('/api/settings', (req, res) => {
    db.all("SELECT * FROM settings", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = {};
        rows.forEach(row => {
            settings[row.setting_name] = row.setting_value;
        });
        res.json(settings);
    });
});

app.put('/api/settings', (req, res) => {
    const settings = req.body;
    const promises = Object.keys(settings).map(key => {
        return new Promise((resolve, reject) => {
            db.run("INSERT OR REPLACE INTO settings (setting_name, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                [key, settings[key]], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
        });
    });
    
    Promise.all(promises)
        .then(() => res.json({ message: 'Settings updated successfully' }))
        .catch(err => res.status(500).json({ error: err.message }));
});

// Main dashboard
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>TreloarAI - AI Phone Assistant Dashboard</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', system-ui, sans-serif; background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); min-height: 100vh; color: #333; }
                .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
                
                .header { text-align: center; color: white; margin-bottom: 3rem; }
                .header h1 { font-size: 3.5rem; margin-bottom: 1rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
                .header p { font-size: 1.3rem; opacity: 0.9; }
                .status-indicator { display: inline-block; width: 12px; height: 12px; background: #4CAF50; border-radius: 50%; margin-right: 0.5rem; animation: pulse 2s infinite; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; margin-bottom: 3rem; }
                .stat-card { background: rgba(255,255,255,0.95); padding: 2rem; border-radius: 20px; backdrop-filter: blur(15px); border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 10px 40px rgba(0,0,0,0.1); text-align: center; transition: transform 0.3s; }
                .stat-card:hover { transform: translateY(-5px); }
                .stat-value { font-size: 3rem; font-weight: bold; color: #1e3c72; margin-bottom: 0.5rem; }
                .stat-label { color: #666; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px; }
                
                .main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; }
                .section { background: rgba(255,255,255,0.95); padding: 2rem; border-radius: 20px; backdrop-filter: blur(15px); border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
                .section h2 { color: #1e3c72; margin-bottom: 1.5rem; font-size: 1.5rem; }
                
                .call-item { background: #f8f9fa; padding: 1rem; margin: 0.5rem 0; border-radius: 10px; border-left: 4px solid #1e3c72; }
                .call-number { font-weight: bold; color: #333; }
                .call-meta { color: #666; font-size: 0.9rem; margin-top: 0.25rem; }
                .urgency-high { border-left-color: #dc3545; }
                .urgency-medium { border-left-color: #ffc107; }
                .urgency-low { border-left-color: #28a745; }
                
                .contact-item { background: #f8f9fa; padding: 1rem; margin: 0.5rem 0; border-radius: 10px; display: flex; justify-content: between; align-items: center; }
                .contact-info { flex: 1; }
                .contact-name { font-weight: bold; color: #333; }
                .contact-number { color: #666; font-size: 0.9rem; }
                
                .btn { background: #1e3c72; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.3s; text-decoration: none; display: inline-block; margin: 0.25rem; }
                .btn:hover { background: #2a5298; transform: translateY(-2px); }
                .btn-success { background: #28a745; }
                .btn-danger { background: #dc3545; }
                .btn-warning { background: #ffc107; color: #000; }
                
                .ai-status { background: linear-gradient(45deg, #4CAF50, #45a049); color: white; padding: 1rem; border-radius: 10px; margin-bottom: 2rem; text-align: center; }
                .ai-status h3 { margin-bottom: 0.5rem; }
                
                .quick-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 2rem; }
                .action-card { background: rgba(255,255,255,0.1); padding: 1.5rem; border-radius: 15px; text-align: center; border: 1px solid rgba(255,255,255,0.2); }
                .action-card h4 { color: white; margin-bottom: 1rem; }
                
                .form-group { margin: 1rem 0; }
                .form-group label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
                .form-group input, .form-group select { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 8px; }
                
                @media (max-width: 768px) {
                    .main-grid { grid-template-columns: 1fr; }
                    .stats-grid { grid-template-columns: repeat(2, 1fr); }
                    .header h1 { font-size: 2.5rem; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📱 TreloarAI</h1>
                    <p>AI-Powered Phone Assistant & Call Management System</p>
                    <p><span class="status-indicator"></span>System Online & Monitoring</p>
                </div>
                
                <div class="ai-status">
                    <h3>🤖 AI Assistant Active</h3>
                    <p>Intelligently screening calls • Protecting your time • Learning your preferences</p>
                </div>
                
                <div class="stats-grid" id="statsGrid">
                    <div class="stat-card">
                        <div class="stat-value">...</div>
                        <div class="stat-label">Trusted Contacts</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">...</div>
                        <div class="stat-label">Blocked Numbers</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">...</div>
                        <div class="stat-label">Today's Calls</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">...</div>
                        <div class="stat-label">Urgent Alerts</div>
                    </div>
                </div>
                
                <div class="main-grid">
                    <div class="section">
                        <h2>📞 Recent Call Activity</h2>
                        <div id="callHistory">Loading call history...</div>
                        <button class="btn" onclick="refreshCallHistory()">Refresh</button>
                        <a href="/call-history" class="btn btn-success">View All Calls</a>
                    </div>
                    
                    <div class="section">
                        <h2>👥 Trusted Contacts</h2>
                        <div id="whitelistContacts">Loading contacts...</div>
                        <button class="btn" onclick="addToWhitelist()">+ Add Contact</button>
                        <a href="/contacts" class="btn btn-success">Manage Contacts</a>
                    </div>
                </div>
                
                <div class="quick-actions">
                    <div class="action-card">
                        <h4>⚙️ AI Settings</h4>
                        <a href="/settings" class="btn">Configure AI</a>
                    </div>
                    <div class="action-card">
                        <h4>🚫 Block Management</h4>
                        <a href="/blocked" class="btn btn-danger">View Blocked</a>
                    </div>
                    <div class="action-card">
                        <h4>📊 Analytics</h4>
                        <a href="/analytics" class="btn btn-warning">View Reports</a>
                    </div>
                    <div class="action-card">
                        <h4>🔔 Notifications</h4>
                        <a href="/notifications" class="btn">Manage Alerts</a>
                    </div>
                </div>
            </div>

            <script>
                async function loadDashboard() {
                    try {
                        // Load stats
                        const statsResponse = await fetch('/api/stats');
                        const stats = await statsResponse.json();
                        
                        document.getElementById('statsGrid').innerHTML = \`
                            <div class="stat-card">
                                <div class="stat-value">\${stats.whitelist_count || 0}</div>
                                <div class="stat-label">Trusted Contacts</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">\${stats.blocked_count || 0}</div>
                                <div class="stat-label">Blocked Numbers</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">\${stats.todays_calls || 0}</div>
                                <div class="stat-label">Today's Calls</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">\${stats.urgent_calls || 0}</div>
                                <div class="stat-label">Urgent Alerts</div>
                            </div>
                        \`;
                        
                        // Load recent calls
                        const callsResponse = await fetch('/api/call-history');
                        const calls = await callsResponse.json();
                        
                        const callHistory = document.getElementById('callHistory');
                        if (calls.length === 0) {
                            callHistory.innerHTML = '<p>No recent calls</p>';
                        } else {
                            callHistory.innerHTML = calls.slice(0, 5).map(call => \`
                                <div class="call-item urgency-\${call.urgency_level || 'low'}">
                                    <div class="call-number">\${call.caller_name || call.phone_number}</div>
                                    <div class="call-meta">
                                        \${call.call_type} • \${call.status} • \${new Date(call.timestamp).toLocaleString()}
                                        \${call.urgency_level === 'high' ? ' 🚨' : ''}
                                    </div>
                                </div>
                            \`).join('');
                        }
                        
                        // Load whitelist contacts
                        const whitelistResponse = await fetch('/api/whitelist');
                        const contacts = await whitelistResponse.json();
                        
                        const whitelistDiv = document.getElementById('whitelistContacts');
                        if (contacts.length === 0) {
                            whitelistDiv.innerHTML = '<p>No trusted contacts yet</p>';
                        } else {
                            whitelistDiv.innerHTML = contacts.slice(0, 5).map(contact => \`
                                <div class="contact-item">
                                    <div class="contact-info">
                                        <div class="contact-name">\${contact.contact_name}</div>
                                        <div class="contact-number">\${contact.phone_number} • \${contact.relationship}</div>
                                    </div>
                                </div>
                            \`).join('');
                        }
                        
                    } catch (error) {
                        console.error('Error loading dashboard:', error);
                    }
                }
                
                function addToWhitelist() {
                    const phoneNumber = prompt('Phone number (with country code):');
                    if (!phoneNumber) return;
                    
                    const contactName = prompt('Contact name:');
                    if (!contactName) return;
                    
                    const relationship = prompt('Relationship (Family/Friend/Doctor/Work):');
                    
                    fetch('/api/whitelist', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            phone_number: phoneNumber,
                            contact_name: contactName,
                            relationship: relationship || 'Contact'
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        alert('Contact added to trusted list!');
                        loadDashboard();
                    })
                    .catch(error => alert('Error adding contact'));
                }
                
                function refreshCallHistory() {
                    loadDashboard();
                }
                
                // Load dashboard on page load
                loadDashboard();
                
                // Auto-refresh every 30 seconds
                setInterval(loadDashboard, 30000);
            </script>
        </body>
        </html>
    `);
});

// Contacts management page
app.get('/contacts', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Contacts - TreloarAI</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 2rem; background: #f5f7fa; }
                .container { max-width: 1000px; margin: 0 auto; }
                .header { background: white; padding: 2rem; border-radius: 10px; margin-bottom: 2rem; }
                .contact-grid { display: grid; gap: 1rem; }
                .contact-card { background: white; padding: 1.5rem; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .btn { background: #1e3c72; color: white; padding: 0.5rem 1rem; text-decoration: none; border-radius: 5px; border: none; cursor: pointer; }
                .btn-danger { background: #dc3545; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>👥 Trusted Contacts</h1>
                    <a href="/" class="btn">← Back to Dashboard</a>
                </div>
                <div class="contact-grid" id="contactsGrid">Loading...</div>
            </div>
            <script>
                async function loadContacts() {
                    const response = await fetch('/api/whitelist');
                    const contacts = await response.json();
                    
                    document.getElementById('contactsGrid').innerHTML = contacts.map(contact => \`
                        <div class="contact-card">
                            <h3>\${contact.contact_name}</h3>
                            <p>📞 \${contact.phone_number}</p>
                            <p>👤 \${contact.relationship}</p>
                            <p>📅 Added: \${new Date(contact.created_at).toLocaleDateString()}</p>
                            <button class="btn btn-danger" onclick="removeContact(\${contact.id})">Remove</button>
                        </div>
                    \`).join('');
                }
                
                function removeContact(id) {
                    if (confirm('Remove this contact from trusted list?')) {
                        fetch(\`/api/whitelist/\${id}\`, { method: 'DELETE' })
                        .then(() => loadContacts())
                        .catch(error => alert('Error removing contact'));
                    }
                }
                
                loadContacts();
            </script>
        </body>
        </html>
    `);
});

// Start server
app.listen(PORT, () => {
    console.log(`📱 TreloarAI Dashboard running on port ${PORT}`);
    console.log(`🌐 Access your AI phone assistant at http://localhost:${PORT}`);
    console.log(`📊 API endpoints available at /api/*`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down TreloarAI...');
    db.close((err) => {
        if (err) console.error('Database close error:', err);
        else console.log('📱 TreloarAI database closed');
        process.exit(0);
    });
});