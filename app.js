
                
                
                            
           const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3006;

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
    notification_level: 'high',
    voice_enabled: 'true'
};

let nextId = { whitelist: 4, blocked: 3, callHistory: 4 };
let voiceCommands = [];

// AI Chat endpoint (simple mock since Anthropic integration would need the package)
app.post('/api/ai-chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        // Mock AI responses for now
        const responses = {
            "hello": "Hello! I'm your TreloarAI assistant. I can help you manage calls, contacts, and phone security.",
            "status": `Current status: ${whitelist.length} trusted contacts, ${blocked.length} blocked numbers, AI screening active.`,
            "help": "I can help you add contacts, block numbers, check call history, and manage your phone assistant settings.",
            "contacts": `You have ${whitelist.length} trusted contacts in your system.`,
            "blocked": `You have ${blocked.length} blocked numbers.`,
            "calls": `Today you have ${callHistory.length} call records.`
        };
        
        // Simple keyword matching
        const lowerMessage = message.toLowerCase();
        let reply = "I understand you're asking about your phone assistant. Try asking about 'status', 'contacts', 'blocked numbers', or 'help'.";
        
        for (const [keyword, response] of Object.entries(responses)) {
            if (lowerMessage.includes(keyword)) {
                reply = response;
                break;
            }
        }
        
        res.json({ reply });
    } catch (error) {
        res.status(500).json({ error: 'AI chat failed', details: error.message });
    }
});

// Voice command processing
app.post('/api/voice-command', (req, res) => {
    const { command, transcript } = req.body;
    
    voiceCommands.push({
        timestamp: new Date().toISOString(),
        command,
        transcript,
        processed: true
    });
    
    let response = { success: false, message: 'Command not recognized', action: null };
    const lowerCommand = transcript.toLowerCase();
    
    if (lowerCommand.includes('add contact') || lowerCommand.includes('new contact')) {
        response = {
            success: true,
            message: 'Please provide contact details',
            action: 'add_contact',
            speak: 'I can help you add a new contact. Please provide the phone number and name.'
        };
    } else if (lowerCommand.includes('block number') || lowerCommand.includes('block caller')) {
        response = {
            success: true,
            message: 'Block number mode activated',
            action: 'block_number',
            speak: 'I can help you block a number. Please provide the phone number you want to block.'
        };
    } else if (lowerCommand.includes('recent calls') || lowerCommand.includes('show calls')) {
        const recentCalls = callHistory.slice(0, 3);
        response = {
            success: true,
            message: 'Showing recent calls',
            action: 'show_calls',
            data: recentCalls,
            speak: `You have ${recentCalls.length} recent calls. The most recent was from ${recentCalls[0]?.caller_name || 'unknown caller'}.`
        };
    } else if (lowerCommand.includes('emergency mode') || lowerCommand.includes('urgent mode')) {
        settings.screening_mode = 'emergency';
        settings.notification_level = 'urgent';
        response = {
            success: true,
            message: 'Emergency mode activated',
            action: 'emergency_mode',
            speak: 'Emergency mode is now active. All calls will be prioritized and urgent notifications enabled.'
        };
    } else if (lowerCommand.includes('status') || lowerCommand.includes('dashboard')) {
        response = {
            success: true,
            message: 'Reading dashboard status',
            action: 'status',
            speak: `System status: ${whitelist.length} trusted contacts, ${blocked.length} blocked numbers, ${callHistory.length} total calls processed.`
        };
    }
    
    res.json(response);
});

// API Routes (same as before)
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
        ).length,
        voice_commands_today: voiceCommands.filter(cmd => {
            const today = new Date().toDateString();
            const cmdDate = new Date(cmd.timestamp).toDateString();
            return cmdDate === today;
        }).length
    };
    res.json(stats);
});

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

app.get('/api/settings', (req, res) => {
    res.json(settings);
});

app.put('/api/settings', (req, res) => {
    settings = { ...settings, ...req.body };
    res.json({ message: 'Settings updated successfully' });
});

// Main dashboard with voice + AI integration
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>TreloarAI - Voice + AI Phone Assistant</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="theme-color" content="#0D7377">
            <meta name="apple-mobile-web-app-capable" content="yes">
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
            <meta name="apple-mobile-web-app-title" content="TreloarAI">
            <link rel="manifest" href="/manifest.json">
            <link rel="apple-touch-icon" href="/icon-192.png">
            <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
            <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', system-ui, sans-serif; background: linear-gradient(135deg, #0D7377 0%, #14A085 30%, #4CAF50 70%, #A7FFEB 100%); min-height: 100vh; color: #333; }
                .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
                
                .header { text-align: center; color: white; margin-bottom: 3rem; }
                .header h1 { font-size: 3.5rem; margin-bottom: 1rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
                .header p { font-size: 1.3rem; opacity: 0.9; }
                .status-indicator { display: inline-block; width: 12px; height: 12px; background: #8BC34A; border-radius: 50%; margin-right: 0.5rem; animation: pulse 2s infinite; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                
                .voice-ai-section { background: rgba(255,255,255,0.98); padding: 2rem; border-radius: 20px; backdrop-filter: blur(15px); border: 2px solid rgba(79, 172, 254, 0.3); box-shadow: 0 10px 40px rgba(20, 160, 133, 0.2); margin-bottom: 2rem; }
                .voice-ai-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
                
                .voice-control { text-align: center; }
                .voice-btn { background: linear-gradient(45deg, #FF6B6B, #4ECDC4); color: white; border: none; border-radius: 50%; width: 80px; height: 80px; font-size: 2rem; cursor: pointer; transition: all 0.3s; margin: 0 1rem; }
                .voice-btn:hover { transform: scale(1.1); box-shadow: 0 10px 30px rgba(255, 107, 107, 0.4); }
                .voice-btn.listening { background: linear-gradient(45deg, #FF4757, #FF6B6B); animation: listening 1s infinite; }
                @keyframes listening { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
                .voice-status { margin-top: 1rem; font-size: 1.1rem; color: #0D7377; }
                .voice-transcript { background: #f8f9fa; padding: 1rem; border-radius: 10px; margin-top: 1rem; font-style: italic; min-height: 50px; }
                
                .ai-chat { }
                .ai-chat h3 { color: #0D7377; margin-bottom: 1rem; }
                .chat-container { background: #f8f9fa; border-radius: 10px; height: 200px; overflow-y: auto; padding: 1rem; margin-bottom: 1rem; }
                .chat-message { margin: 0.5rem 0; padding: 0.5rem; border-radius: 5px; }
                .user-message { background: #e3f2fd; text-align: right; }
                .ai-message { background: #e8f5e8; }
                .chat-input { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 8px; }
                
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; margin-bottom: 3rem; }
                .stat-card { background: rgba(255,255,255,0.98); padding: 2rem; border-radius: 20px; backdrop-filter: blur(15px); border: 2px solid rgba(79, 172, 254, 0.3); box-shadow: 0 10px 40px rgba(20, 160, 133, 0.2); text-align: center; transition: transform 0.3s; }
                .stat-card:hover { transform: translateY(-5px); }
                .stat-value { font-size: 3rem; font-weight: bold; color: #0D7377; margin-bottom: 0.5rem; }
                .stat-label { color: #666; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px; }
                
                .main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; }
                .section { background: rgba(255,255,255,0.98); padding: 2rem; border-radius: 20px; backdrop-filter: blur(15px); border: 2px solid rgba(79, 172, 254, 0.3); box-shadow: 0 10px 40px rgba(20, 160, 133, 0.2); }
                .section h2 { color: #0D7377; margin-bottom: 1.5rem; font-size: 1.5rem; }
                
                .call-item { background: #f8f9fa; padding: 1rem; margin: 0.5rem 0; border-radius: 10px; border-left: 4px solid #4CAF50; }
                .call-number { font-weight: bold; color: #333; }
                .call-meta { color: #666; font-size: 0.9rem; margin-top: 0.25rem; }
                .urgency-high { border-left-color: #E53935; }
                .urgency-medium { border-left-color: #FB8C00; }
                .urgency-low { border-left-color: #43A047; }
                
                .contact-item { background: #f8f9fa; padding: 1rem; margin: 0.5rem 0; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
                .contact-info { flex: 1; }
                .contact-name { font-weight: bold; color: #333; }
                .contact-number { color: #666; font-size: 0.9rem; }
                
                .btn { background: linear-gradient(45deg, #14A085, #4CAF50); color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.3s; text-decoration: none; display: inline-block; margin: 0.25rem; }
                .btn:hover { background: linear-gradient(45deg, #0D7377, #388E3C); transform: translateY(-2px); box-shadow: 0 4px 15px rgba(20, 160, 133, 0.4); }
                .btn-success { background: linear-gradient(45deg, #42A5F5, #66BB6A); }
                .btn-danger { background: linear-gradient(45deg, #EF5350, #FF7043); }
                .btn-warning { background: linear-gradient(45deg, #FFA726, #FFCC02); color: #333; }
                
                .ai-status { background: linear-gradient(45deg, #14A085, #42A5F5, #4CAF50); color: white; padding: 1rem; border-radius: 10px; margin-bottom: 2rem; text-align: center; box-shadow: 0 5px 20px rgba(20, 160, 133, 0.3); }
                .ai-status h3 { margin-bottom: 0.5rem; }
                
                .quick-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 2rem; }
                .action-card { background: rgba(255,255,255,0.1); padding: 1.5rem; border-radius: 15px; text-align: center; border: 1px solid rgba(255,255,255,0.2); }
                .action-card h4 { color: white; margin-bottom: 1rem; }
                
                @media (max-width: 768px) {
                    .voice-ai-grid { grid-template-columns: 1fr; }
                    .main-grid { grid-template-columns: 1fr; }
                    .stats-grid { grid-template-columns: repeat(2, 1fr); }
                    .header h1 { font-size: 2.5rem; }
                    .voice-btn { width: 60px; height: 60px; font-size: 1.5rem; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎤📱 TreloarAI</h1>
                    <p>Voice + AI Powered Phone Assistant & Call Management</p>
                    <p><span class="status-indicator"></span>Voice & AI Integration Active</p>
                </div>
                
                <div class="voice-ai-section">
                    <div class="voice-ai-grid">
                        <div class="voice-control">
                            <h3>🗣️ Voice Commands</h3>
                            <button class="voice-btn" id="voiceBtn" onclick="toggleVoiceRecognition()">🎤</button>
                            <div class="voice-status" id="voiceStatus">Click microphone for voice commands</div>
                            <div class="voice-transcript" id="voiceTranscript">Voice commands appear here...</div>
                        </div>
                        
                        <div class="ai-chat">
                            <h3>🤖 AI Assistant Chat</h3>
                            <div class="chat-container" id="chatContainer">
                                <div class="chat-message ai-message">Hello! I'm your TreloarAI assistant. Ask me about your contacts, calls, or phone settings!</div>
                            </div>
                            <input type="text" class="chat-input" id="chatInput" placeholder="Type a message or use voice..." onkeypress="handleChatKeypress(event)">
                        </div>
                    </div>
                </div>
                
                <div class="ai-status">
                    <h3>🤖 AI Assistant Active with Voice Control</h3>
                    <p>Voice commands • AI chat • Smart call screening • Real-time assistance</p>
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
                        <div class="stat-label">Voice Commands</div>
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
                        <button class="btn" onclick="toggleAI()">Configure AI</button>
                    </div>
                    <div class="action-card">
                        <h4>🚫 Block Management</h4>
                        <button class="btn btn-danger" onclick="viewBlocked()">View Blocked</button>
                    </div>
                    <div class="action-card">
                        <h4>📊 Voice Analytics</h4>
                        <button class="btn btn-warning" onclick="showAnalytics()">View Stats</button>
                    </div>
                    <div class="action-card">
                        <h4>🔔 Test Features</h4>
                        <button class="btn" onclick="testVoiceAndAI()">Test Voice+AI</button>
                    </div>
                </div>
            </div>

            <script>
                let recognition = null;
                let isListening = false;
                let speechSynthesis = window.speechSynthesis;
                
                // Initialize speech recognition
                if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    recognition = new SpeechRecognition();
                    recognition.continuous = false;
                    recognition.interimResults = false;
                    recognition.lang = 'en-US';
                    
                    recognition.onstart = function() {
                        isListening = true;
                        document.getElementById('voiceBtn').classList.add('listening');
                        document.getElementById('voiceStatus').textContent = 'Listening... Speak your command';
                        document.getElementById('voiceTranscript').textContent = 'Listening for voice input...';
                    };
                    
                    recognition.onresult = function(event) {
                        const transcript = event.results[0][0].transcript;
                        document.getElementById('voiceTranscript').textContent = 'You said: "' + transcript + '"';
                        processVoiceCommand(transcript);
                    };
                    
                    recognition.onerror = function(event) {
                        document.getElementById('voiceStatus').textContent = 'Voice recognition error: ' + event.error;
                        document.getElementById('voiceBtn').classList.remove('listening');
                        isListening = false;
                    };
                    
                    recognition.onend = function() {
                        document.getElementById('voiceBtn').classList.remove('listening');
                        isListening = false;
                        if (document.getElementById('voiceStatus').textContent === 'Listening... Speak your command') {
                            document.getElementById('voiceStatus').textContent = 'Ready for voice commands';
                        }
                    };
                } else {
                    document.getElementById('voiceStatus').textContent = 'Voice recognition not supported in this browser';
                }
                
                function toggleVoiceRecognition() {
                    if (!recognition) {
                        alert('Voice recognition not supported in this browser');
                        return;
                    }
                    
                    if (isListening) {
                        recognition.stop();
                    } else {
                        recognition.start();
                    }
                }
                
                function speak(text) {
                    if (speechSynthesis) {
                        const utterance = new SpeechSynthesisUtterance(text);
                        utterance.rate = 0.8;
                        utterance.pitch = 1;
                        utterance.volume = 0.8;
                        speechSynthesis.speak(utterance);
                    }
                }
                
                async function processVoiceCommand(transcript) {
                    document.getElementById('voiceStatus').textContent = 'Processing command...';
                    
                    try {
                        const response = await fetch('/api/voice-command', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                command: 'voice_input',
                                transcript: transcript
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            document.getElementById('voiceStatus').textContent = result.message;
                            if (result.speak) {
                                speak(result.speak);
                            }
                            loadDashboard();
                        } else {
                            document.getElementById('voiceStatus').textContent = result.message;
                            speak('Sorry, I did not understand that command.');
                        }
                    } catch (error) {
                        document.getElementById('voiceStatus').textContent = 'Error processing voice command';
                        speak('There was an error processing your command.');
                    }
                }
                
                async function sendChatMessage(message) {
                    if (!message.trim()) return;
                    
                    // Add user message to chat
                    const chatContainer = document.getElementById('chatContainer');
                    chatContainer.innerHTML += \`<div class="chat-message user-message">You: \${message}</div>\`;
                    
                    try {
                        const response = await fetch('/api/ai-chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message })
                        });
                        
                        const result = await response.json();
                        
                        // Add AI response to chat
                        chatContainer.innerHTML += \`<div class="chat-message ai-message">AI: \${result.reply}</div>\`;
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                        
                        // Speak the response
                        speak(result.reply);
                        
                    } catch (error) {
                        chatContainer.innerHTML += \`<div class="chat-message ai-message">AI: Sorry, I'm having trouble connecting right now.</div>\`;
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }
                    
                    document.getElementById('chatInput').value = '';
                }
                
                function handleChatKeypress(event) {
                    if (event.key === 'Enter') {
                        const message = event.target.value;
                        sendChatMessage(message);
                    }
                }
                
                async function loadDashboard() {
                    try {
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
                                <div class="stat-value">\${stats.voice_commands_today || 0}</div>
                                <div class="stat-label">Voice Commands</div>
                            </div>
                        \`;
                        
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
                        speak(\`Contact \${contactName} has been added to your trusted list.\`);
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
                        speak(\`Simulated call from \${randomName} has been added.\`);
                        loadDashboard();
                    })
                    .catch(error => alert('Error simulating call'));
                }
                
                function refreshCallHistory() {
                    loadDashboard();
                    speak('Call history refreshed.');
                }
                
                function toggleAI() {
                    speak('AI settings accessed.');
                    alert('AI Assistant settings! (Configure voice, chat, and screening preferences)');
                }
                
                function viewBlocked() {
                    fetch('/api/blocked')
                    .then(response => response.json())
                    .then(blocked => {
                        if (blocked.length === 0) {
                            alert('No blocked numbers');
                            speak('You have no blocked numbers.');
                        } else {
                            const list = blocked.map(b => \`\${b.phone_number} - \${b.reason}\`).join('\\n');
                            alert('Blocked Numbers:\\n' + list);
                            speak(\`You have \${blocked.length} blocked numbers.\`);
                        }
                    });
                }
                
                function viewAllContacts() {
                    fetch('/api/whitelist')
                    .then(response => response.json())
                    .then(contacts => {
                        if (contacts.length === 0) {
                            alert('No trusted contacts');
                            speak('You have no trusted contacts.');
                        } else {
                            const list = contacts.map(c => \`\${c.contact_name} - \${c.phone_number}\`).join('\\n');
                            alert('Trusted Contacts:\\n' + list);
                            speak(\`You have \${contacts.length} trusted contacts.\`);
                        }
                    });
                }
                
                function showAnalytics() {
                    fetch('/api/stats')
                    .then(response => response.json())
                    .then(stats => {
                        const analyticsText = \`Analytics: \${stats.whitelist_count} contacts, \${stats.blocked_count} blocked, \${stats.todays_calls} today's calls, \${stats.voice_commands_today} voice commands\`;
                        alert(analyticsText);
                        speak(analyticsText);
                    });
                }
                
                function testVoiceAndAI() {
                    speak('Testing voice and AI integration. Voice recognition and AI chat are both active and ready for your commands.');
                    sendChatMessage('Test AI integration');
                }
                
                // PWA Installation
                let deferredPrompt;
                window.addEventListener('beforeinstallprompt', (e) => {
                    e.preventDefault();
                    deferredPrompt = e;
                    showInstallButton();
                });
                
                function showInstallButton() {
                    const installBtn = document.createElement('button');
                    installBtn.className = 'btn btn-success';
                    installBtn.textContent = '📱 Install Mobile App';
                    installBtn.onclick = installPWA;
                    document.querySelector('.quick-actions').prepend(installBtn);
                }
                
                async function installPWA() {
                    if (deferredPrompt) {
                        deferredPrompt.prompt();
                        const result = await deferredPrompt.userChoice;
                        if (result.outcome === 'accepted') {
                            speak('TreloarAI mobile app installed successfully!');
                        }
                        deferredPrompt = null;
                    }
                }
                
                // Service Worker Registration
                if ('serviceWorker' in navigator) {
                    window.addEventListener('load', () => {
                        navigator.serviceWorker.register('/sw.js')
                            .then((registration) => {
                                console.log('SW registered: ', registration);
                            })
                            .catch((registrationError) => {
                                console.log('SW registration failed: ', registrationError);
                            });
                    });
                }
                
                // Load dashboard on page load
                loadDashboard();
                
                // Auto-refresh every 30 seconds
                setInterval(loadDashboard, 30000);
                
                // Welcome message
                setTimeout(() => {
                    speak('Welcome to TreloarAI. Voice recognition and AI chat are ready. Click the microphone or type a message to get started.');
                }, 2000);
            </script>
        </body>
        </html>
    `);
});

// PWA Manifest
app.get('/manifest.json', (req, res) => {
    res.json({
        "name": "TreloarAI - AI Phone Assistant",
        "short_name": "TreloarAI",
        "description": "Voice-enabled AI phone assistant and call management system",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0D7377",
        "theme_color": "#0D7377",
        "orientation": "portrait",
        "categories": ["productivity", "utilities"],
        "icons": [
            {
                "src": "/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any maskable"
            },
            {
                "src": "/icon-512.png", 
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any maskable"
            }
        ]
    });
});

// Service Worker
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`
        const CACHE_NAME = 'treloarai-v1';
        const urlsToCache = [
            '/',
            '/manifest.json'
        ];

        self.addEventListener('install', (event) => {
            event.waitUntil(
                caches.open(CACHE_NAME)
                    .then((cache) => cache.addAll(urlsToCache))
            );
        });

        self.addEventListener('fetch', (event) => {
            event.respondWith(
                caches.match(event.request)
                    .then((response) => {
                        if (response) {
                            return response;
                        }
                        return fetch(event.request);
                    })
            );
        });

        // Background sync for offline functionality
        self.addEventListener('sync', (event) => {
            if (event.tag === 'background-sync') {
                event.waitUntil(doBackgroundSync());
            }
        });

        function doBackgroundSync() {
            // Sync data when online
            return Promise.resolve();
        }

        // Push notifications
        self.addEventListener('push', (event) => {
            const options = {
                body: event.data ? event.data.text() : 'New notification from TreloarAI',
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [100, 50, 100],
                data: {
                    dateOfArrival: Date.now(),
                    primaryKey: 1
                }
            };

            event.waitUntil(
                self.registration.showNotification('TreloarAI', options)
            );
        });
    `);
});

// App Icons (simple SVG icons)
app.get('/icon-192.png', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(`
        <svg width="192" height="192" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
            <rect width="192" height="192" fill="#0D7377" rx="20"/>
            <text x="96" y="96" text-anchor="middle" dominant-baseline="middle" font-size="80" fill="white">🎤</text>
            <text x="96" y="140" text-anchor="middle" dominant-baseline="middle" font-size="20" fill="#A7FFEB">TreloarAI</text>
        </svg>
    `);
});

app.get('/icon-512.png', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(`
        <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" fill="#0D7377" rx="50"/>
            <text x="256" y="256" text-anchor="middle" dominant-baseline="middle" font-size="200" fill="white">🎤</text>
            <text x="256" y="380" text-anchor="middle" dominant-baseline="middle" font-size="50" fill="#A7FFEB">TreloarAI</text>
        </svg>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        voice_enabled: true,
        ai_enabled: true
    });
});

app.listen(PORT, () => {
    console.log(`🎤📱 TreloarAI Voice+AI Dashboard running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗣️ Voice recognition and AI chat ready`);
});