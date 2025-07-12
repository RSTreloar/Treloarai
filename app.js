
                
                
                            
           const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory data storage (works in cloud environment)
let whitelist = [
    { id: 1, phone_number: '+1234567890', contact_name: 'Emergency Contact', relationship: 'Family', created_at: new Date().toISOString() },
    { id: 2, phone_number: '+1987654321', contact_name: 'Dr. Smith', relationship: 'Doctor', created_at: new Date().toISOString() },
    { id: 3, phone_number: '+1555123456', contact_name: 'Work Assistant', relationship: 'Professional', created_at: new Date().toISOString() }
];

let blocked = [
    { id: 1, phone_number: '+1800SPAM99', reason: 'Telemarketer', attempts: 5, created_at: new Date().toISOString() },
    { id: 2, phone_number: '+1999ROBO00', reason: 'Robocall', attempts: 3, created_at: new Date().toISOString() }
];

let callHistory = [
    { id: 1, phone_number: '+1234567890', caller_name: 'Emergency Contact', call_type: 'urgent', duration: 120, urgency_level: 'high', status: 'answered', ai_action: 'immediate_notify', timestamp: new Date().toISOString() },
    { id: 2, phone_number: '+1555999888', caller_name: 'Unknown Caller', call_type: 'screening', duration: 45, urgency_level: 'low', status: 'screened', ai_action: 'ai_handled', timestamp: new Date().toISOString() },
    { id: 3, phone_number: '+1800SPAM99', caller_name: 'Telemarketer', call_type: 'blocked', duration: 0, urgency_level: 'none', status: 'blocked', ai_action: 'auto_block', timestamp: new Date().toISOString() }
];

let settings = {
    ai_enabled: 'true',
    urgent_threshold: '3',
    screening_mode: 'intelligent',
    notification_level: 'high'
};

let nextId = { whitelist: 4, blocked: 3, callHistory: 4 };

// API Routes

// Get dashboard stats
app.get('/api/stats', (req, res) => {
    const stats = {
        whitelist_count: whitelist.length,
        blocked_count: blocked.length,
        todays_calls: callHistory.filter(call => {
            const today = new Date().toDateString();
            const callDate = new Date(call.timestamp).toDateString();
            return callDate === today;
        }).length,
        urgent_calls: callHistory.filter(call => 
            call.urgency_level === 'high' && 
            new Date(call.timestamp).toDateString() === new Date().toDateString()
        ).length
    };
    res.json(stats);
});

// Whitelist operations
app.get('/api/whitelist', (req, res) => {
    res.json(whitelist.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

app.post('/api/whitelist', (req, res) => {
    const { phone_number, contact_name, relationship } = req.body;
    const newContact = {
        id: nextId.whitelist++,
        phone_number,
        contact_name,
        relationship,
        created_at: new Date().toISOString()
    };
    whitelist.push(newContact);
    res.json({ id: newContact.id, message: 'Contact added to whitelist' });
});

app.delete('/api/whitelist/:id', (req, res) => {
    const id = parseInt(req.params.id);
    whitelist = whitelist.filter(contact => contact.id !== id);
    res.json({ message: 'Contact removed from whitelist' });
});

// Blocked numbers operations
app.get('/api/blocked', (req, res) => {
    res.json(blocked.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

app.post('/api/blocked', (req, res) => {
    const { phone_number, reason } = req.body;
    const newBlocked = {
        id: nextId.blocked++,
        phone_number,
        reason,
        attempts: 1,
        created_at: new Date().toISOString()
    };
    blocked.push(newBlocked);
    res.json({ id: newBlocked.id, message: 'Number blocked successfully' });
});

app.delete('/api/blocked/:id', (req, res) => {
    const id = parseInt(req.params.id);
    blocked = blocked.filter(item => item.id !== id);
    res.json({ message: 'Number unblocked successfully' });
});

// Call history
app.get('/api/call-history', (req, res) => {
    res.json(callHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50));
});

app.post('/api/call-history', (req, res) => {
    const { phone_number, caller_name, call_type, duration, urgency_level, status, ai_action } = req.body;
    const newCall = {
        id: nextId.callHistory++,
        phone_number,
        caller_name,
        call_type,
        duration,
        urgency_level,
        status,
        ai_action,
        timestamp: new Date().toISOString()
    };
    callHistory.push(newCall);
    res.json({ id: newCall.id, message: 'Call recorded successfully' });
});

// Settings
app.get('/api/settings', (req, res) => {
    res.json(settings);
});

app.put('/api/settings', (req, res) => {
    settings = { ...settings, ...req.body };
    res.json({ message: 'Settings updated successfully' });
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
                
                .contact-item { background: #f8f9fa; padding: 1rem; margin: 0.5rem 0; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
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
                    <p><span class="status-indicator"></span>Live Cloud Deployment</p>
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
                        <button class="btn btn-success" onclick="simulateCall()">+ Simulate Call</button>
                    </div>
                    
                    <div class="section">
                        <h2>👥 Trusted Contacts</h2>
                        <div id="whitelistContacts">Loading contacts...</div>
                        <button class="btn" onclick="addToWhitelist()">+ Add Contact</button>
                        <button class="btn btn-success" onclick="viewAllContacts()">View All</button>
                    </div>
                </div>
                
                <div class="quick-actions">
                    <div class="action-card">
                        <h4>⚙️ AI Settings</h4>
                        <button class="btn" onclick="toggleAI()">Toggle AI</button>
                    </div>
                    <div class="action-card">
                        <h4>🚫 Block Management</h4>
                        <button class="btn btn-danger" onclick="viewBlocked()">View Blocked</button>
                    </div>
                    <div class="action-card">
                        <h4>📊 Analytics</h4>
                        <button class="btn btn-warning" onclick="showAnalytics()">View Stats</button>
                    </div>
                    <div class="action-card">
                        <h4>🔔 Test Features</h4>
                        <button class="btn" onclick="testNotification()">Test Alert</button>
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
                
                function simulateCall() {
                    const numbers = ['+1555TEST01', '+1555DEMO99', '+1800EXAMPLE'];
                    const names = ['Test Caller', 'Demo Contact', 'Example User'];
                    const types = ['incoming', 'urgent', 'screening'];
                    const urgencies = ['low', 'medium', 'high'];
                    
                    const randomNumber = numbers[Math.floor(Math.random() * numbers.length)];
                    const randomName = names[Math.floor(Math.random() * names.length)];
                    const randomType = types[Math.floor(Math.random() * types.length)];
                    const randomUrgency = urgencies[Math.floor(Math.random() * urgencies.length)];
                    
                    fetch('/api/call-history', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            phone_number: randomNumber,
                            caller_name: randomName,
                            call_type: randomType,
                            duration: Math.floor(Math.random() * 180),
                            urgency_level: randomUrgency,
                            status: 'handled',
                            ai_action: 'processed'
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        alert('Simulated call added!');
                        loadDashboard();
                    })
                    .catch(error => alert('Error simulating call'));
                }
                
                function refreshCallHistory() {
                    loadDashboard();
                }
                
                function toggleAI() {
                    alert('AI Assistant toggled! (Demo feature)');
                }
                
                function viewBlocked() {
                    fetch('/api/blocked')
                    .then(response => response.json())
                    .then(blocked => {
                        if (blocked.length === 0) {
                            alert('No blocked numbers');
                        } else {
                            const list = blocked.map(b => \`\${b.phone_number} - \${b.reason}\`).join('\\n');
                            alert('Blocked Numbers:\\n' + list);
                        }
                    });
                }
                
                function viewAllContacts() {
                    fetch('/api/whitelist')
                    .then(response => response.json())
                    .then(contacts => {
                        if (contacts.length === 0) {
                            alert('No trusted contacts');
                        } else {
                            const list = contacts.map(c => \`\${c.contact_name} - \${c.phone_number}\`).join('\\n');
                            alert('Trusted Contacts:\\n' + list);
                        }
                    });
                }
                
                function showAnalytics() {
                    fetch('/api/stats')
                    .then(response => response.json())
                    .then(stats => {
                        alert(\`Analytics:\\nContacts: \${stats.whitelist_count}\\nBlocked: \${stats.blocked_count}\\nToday's Calls: \${stats.todays_calls}\\nUrgent: \${stats.urgent_calls}\`);
                    });
                }
                
                function testNotification() {
                    alert('🚨 URGENT CALL ALERT!\\n\\nThis is how urgent notifications would appear.');
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`📱 TreloarAI Cloud Dashboard running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🚀 Server ready to handle requests`);
});