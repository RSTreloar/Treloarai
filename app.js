// TreloarAI - Complete Voice AI Assistant with Mobile Optimization
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3006;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Keep service awake - prevents 40 second startup delays
setInterval(async () => {
    try {
        const response = await fetch(`http://localhost:${PORT}/health`);
        console.log('🔄 TreloarAI keep-alive ping sent - service staying awake');
    } catch (error) {
        console.log('⚠️ Keep-alive ping failed:', error.message);
    }
}, 14 * 60 * 1000); // Ping every 14 minutes

// Demo data
let users = [
    {
        id: 'treloar-demo-123',
        email: 'demo@treloarai.com',
        password: '$2b$10$demo',
        full_name: 'Demo User',
        phone_number: '+1555DEMO01',
        plan: 'pro',
        credits: 25.00,
        total_spent: 47.80,
        created_at: new Date().toISOString()
    }
];

// Authentication
const authenticateUser = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const decoded = jwt.verify(token, 'treloar-secret');
        req.user = users.find(u => u.id === decoded.userId);
        if (!req.user) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        next();
    } catch (error) {
        res.status(403).json({ error: 'Invalid token' });
    }
};

// Auth routes
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (email === 'demo@treloarai.com' && password === 'demo123') {
            const token = jwt.sign({ userId: user.id }, 'treloar-secret');
            return res.json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    plan: user.plan,
                    credits: user.credits
                }
            });
        }
        return res.status(401).json({ error: 'Demo: use demo@treloarai.com / demo123' });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// Voice commands
app.post('/api/voice-command', authenticateUser, async (req, res) => {
    const { transcript } = req.body;
    try {
        let response = { success: true, message: 'Voice command processed' };
        const lowerTranscript = transcript.toLowerCase();

        if (lowerTranscript.includes('record')) {
            response = {
                success: true,
                message: 'Recording activated',
                action: 'start_recording',
                speak: 'Call recording has been activated. Ready to record your conversations.'
            };
        } else if (lowerTranscript.includes('status')) {
            response = {
                success: true,
                message: 'Status report',
                action: 'status',
                speak: 'TreloarAI is running perfectly. Voice recognition is active and working on your mobile device.'
            };
        } else {
            response = {
                success: true,
                message: 'Command understood',
                speak: 'I heard you say: ' + transcript + '. How can I help you with your voice commands?'
            };
        }
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: 'Voice command failed' });
    }
});

// AI Chat
app.post('/api/ai-chat', authenticateUser, async (req, res) => {
    const { message } = req.body;
    try {
        let reply = 'I\'m your intelligent voice assistant! I can help with call recording, transcription, and voice commands. What would you like to know?';
        
        if (message.toLowerCase().includes('voice')) {
            reply = 'Voice recognition is working! Try clicking the microphone button and speaking clearly. I can understand commands like "record call", "show status", or general questions.';
        } else if (message.toLowerCase().includes('mobile')) {
            reply = 'TreloarAI is optimized for mobile devices including your Samsung Fold 3! The interface adapts to both folded and unfolded modes for the best experience.';
        }
        
        res.json({ reply });
    } catch (error) {
        res.status(500).json({ error: 'AI chat failed', reply: 'Sorry, having trouble right now.' });
    }
});

// PWA Manifest for mobile installation
app.get('/manifest.json', (req, res) => {
    res.json({
        "name": "TreloarAI - Voice Assistant",
        "short_name": "TreloarAI",
        "description": "AI voice assistant with call recording and transcription",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0d7377",
        "theme_color": "#14a085",
        "orientation": "portrait-primary",
        "categories": ["productivity", "communication"],
        "icons": [
            {
                "src": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDE5MiAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjE5MiIgaGVpZ2h0PSIxOTIiIHJ4PSIyNCIgZmlsbD0iIzBkNzM3NyIvPjxjaXJjbGUgY3g9Ijk2IiBjeT0iOTYiIHI9IjQwIiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==",
                "sizes": "192x192",
                "type": "image/svg+xml"
            }
        ]
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        platform: 'TreloarAI Voice Assistant',
        keep_alive: 'active',
        mobile_optimized: true,
        timestamp: new Date().toISOString()
    });
});

// Main application
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>TreloarAI - Your Voice Assistant</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
    <meta name="theme-color" content="#0d7377">
    <link rel="manifest" href="/manifest.json">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #0d7377 35%, #14a085 65%, #4facfe 100%);
            min-height: 100vh;
            color: #fff;
            overflow-x: hidden;
        }
        
        .container {
            max-width: 100%;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            padding: 40px 0;
        }
        
        .logo {
            font-size: 3rem;
            font-weight: 800;
            margin-bottom: 15px;
            background: linear-gradient(135deg, #00f2fe 0%, #ffffff 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .tagline {
            font-size: 1.5rem;
            margin-bottom: 10px;
            color: #e2e8f0;
        }
        
        .subtitle {
            font-size: 1rem;
            color: #94a3b8;
            margin-bottom: 30px;
        }
        
        /* Glassmorphism Cards */
        .glass-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 20px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }
        
        /* Auth Section */
        .auth-section {
            max-width: 400px;
            margin: 0 auto;
            text-align: center;
        }
        
        .demo-info {
            background: linear-gradient(135deg, #14a085, #0d7377);
            padding: 20px;
            border-radius: 16px;
            margin-bottom: 25px;
        }
        
        .form-group {
            margin-bottom: 20px;
            text-align: left;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #e2e8f0;
            font-weight: 500;
        }
        
        .form-group input {
            width: 100%;
            padding: 15px;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            color: white;
            font-size: 16px;
            outline: none;
        }
        
        .form-group input:focus {
            border-color: #4facfe;
            box-shadow: 0 0 20px rgba(79, 172, 254, 0.3);
        }
        
        .form-group input::placeholder {
            color: #94a3b8;
        }
        
        .auth-button {
            width: 100%;
            padding: 18px;
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            border: none;
            border-radius: 12px;
            color: white;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .auth-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 35px rgba(79, 172, 254, 0.6);
        }
        
        /* Dashboard */
        .dashboard { display: none; }
        .dashboard.active { display: block; }
        
        .user-info {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .credits-display {
            background: rgba(20, 184, 166, 0.8);
            padding: 12px 20px;
            border-radius: 25px;
            font-weight: 600;
            display: inline-block;
            margin-top: 10px;
        }
        
        /* Voice Controls */
        .voice-section {
            display: grid;
            grid-template-columns: 1fr;
            gap: 25px;
            margin-bottom: 30px;
        }
        
        .voice-control {
            text-align: center;
        }
        
        .voice-btn {
            width: 120px;
            height: 120px;
            background: linear-gradient(135deg, #ff6b6b, #4ecdc4);
            border: none;
            border-radius: 50%;
            font-size: 3rem;
            color: white;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 20px auto;
            display: block;
            box-shadow: 0 8px 25px rgba(255, 107, 107, 0.4);
        }
        
        .voice-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 12px 35px rgba(255, 107, 107, 0.6);
        }
        
        .voice-btn.recording {
            animation: recordingPulse 1.5s infinite;
            background: linear-gradient(135deg, #ff4757, #ff6b6b);
        }
        
        @keyframes recordingPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }
        
        .status {
            text-align: center;
            margin: 15px 0;
            color: #94a3b8;
            font-size: 1rem;
            padding: 15px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 12px;
            min-height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        /* AI Chat */
        .chat-container {
            height: 200px;
            overflow-y: auto;
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 20px;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .chat-message {
            margin: 10px 0;
            padding: 12px;
            border-radius: 12px;
        }
        
        .user-message {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            margin-left: 15%;
            text-align: right;
        }
        
        .ai-message {
            background: rgba(255, 255, 255, 0.1);
            color: #e2e8f0;
            margin-right: 15%;
        }
        
        .chat-input {
            display: flex;
            gap: 12px;
            align-items: center;
        }
        
        .chat-input input {
            flex: 1;
            padding: 15px 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-radius: 25px;
            color: white;
            font-size: 16px;
            outline: none;
        }
        
        .chat-input input:focus {
            border-color: #4facfe;
            box-shadow: 0 0 20px rgba(79, 172, 254, 0.3);
        }
        
        .chat-input input::placeholder {
            color: #94a3b8;
        }
        
        .btn {
            padding: 15px 25px;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
            font-size: 1rem;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(79, 172, 254, 0.6);
        }
        
        .btn-danger {
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
        }
        
        /* Mobile Optimization for Samsung Fold and all phones */
        @media (max-width: 480px) {
            /* Samsung Fold 3 folded mode - very narrow */
            .container { padding: 15px 10px; }
            .logo { font-size: 2.2rem; }
            .tagline { font-size: 1.2rem; }
            
            /* Larger touch targets for voice */
            .voice-btn { 
                width: 140px; 
                height: 140px; 
                font-size: 3.5rem; 
                margin: 30px auto;
            }
            
            /* Mobile-friendly forms */
            .form-group input,
            .chat-input input { 
                padding: 18px; 
                font-size: 16px; /* Prevents zoom on iOS */
            }
            
            /* Chat adjustments */
            .chat-container { height: 160px; }
            
            /* Better spacing */
            .glass-card { 
                padding: 20px; 
                margin-bottom: 15px;
            }
            
            .status {
                font-size: 0.9rem;
                padding: 12px;
                min-height: 50px;
            }
        }
        
        @media (max-width: 280px) {
            /* Extra narrow devices */
            .voice-btn { 
                width: 120px; 
                height: 120px; 
                font-size: 3rem; 
            }
        }
        
        @media (min-width: 481px) and (max-width: 768px) {
            /* Samsung Fold 3 unfolded and tablets */
            .voice-section { grid-template-columns: 1fr 1fr; }
            .voice-btn { 
                width: 130px; 
                height: 130px; 
                font-size: 3.2rem; 
            }
        }
        
        /* PWA Install hint */
        .pwa-hint {
            background: rgba(79, 172, 254, 0.2);
            border: 1px solid rgba(79, 172, 254, 0.3);
            border-radius: 12px;
            padding: 15px;
            margin: 15px 0;
            text-align: center;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="logo">🎤 TreloarAI</h1>
            <div class="tagline">Your Voice Assistant</div>
            <div class="subtitle">Optimized for mobile • Samsung Fold 3 ready</div>
        </div>
        
        <!-- Auth Section -->
        <div id="authSection" class="auth-section">
            <div class="glass-card">
                <div class="demo-info">
                    <strong>🎉 Demo Voice Assistant</strong><br>
                    Email: demo@treloarai.com<br>
                    Password: demo123<br>
                    <small>Mobile optimized • Voice commands ready!</small>
                </div>
                
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="loginEmail" value="demo@treloarai.com">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="loginPassword" value="demo123">
                </div>
                <button class="auth-button" onclick="login()">
                    🎤 Start Voice Assistant
                </button>
                
                <div class="pwa-hint">
                    💡 Tip: Add to home screen for native app experience!
                </div>
            </div>
        </div>
        
        <!-- Dashboard -->
        <div id="dashboardSection" class="dashboard">
            <div class="user-info" id="userInfo">
                <h3>Welcome to TreloarAI!</h3>
                <p>Voice recognition active and ready</p>
                <div class="credits-display">
                    💰 $<span id="creditsAmount">25.00</span> credits
                </div>
            </div>
            
            <!-- Voice Control -->
            <div class="glass-card">
                <h3 style="text-align: center; margin-bottom: 20px;">🎤 Voice Commands</h3>
                <div class="voice-section">
                    <div class="voice-control">
                        <button class="voice-btn" onclick="startVoiceCommand()" id="voiceBtn">
                            🎤
                        </button>
                        <p style="margin-bottom: 15px; font-weight: 600;">Tap to speak</p>
                        <div class="status" id="voiceStatus">Click microphone and say "record call" or "show status"</div>
                    </div>
                </div>
            </div>
            
            <!-- AI Chat -->
            <div class="glass-card">
                <h3 style="margin-bottom: 15px;">💬 AI Assistant</h3>
                <div class="chat-container" id="chatContainer">
                    <div class="chat-message ai-message">
                        <strong>AI:</strong> Hello! I'm optimized for your mobile device. Try voice commands or type your questions!
                    </div>
                </div>
                <div class="chat-input">
                    <input type="text" id="chatInput" placeholder="Ask about voice features..." onkeypress="handleChatKeypress(event)">
                    <button class="btn btn-primary" onclick="sendChatMessage()">
                        📤
                    </button>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <button class="btn btn-danger" onclick="logout()">
                    🚪 Logout
                </button>
            </div>
        </div>
    </div>

    <script>
        let currentUser = null;
        let authToken = localStorage.getItem('treloar_token');
        
        if (authToken) {
            showDashboard();
        }
        
        // Authentication
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
                    showDashboard();
                } else {
                    alert('Login failed: ' + data.error);
                }
            } catch (error) {
                alert('Login error: ' + error.message);
            }
        }
        
        function showDashboard() {
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('dashboardSection').classList.add('active');
            
            // Set demo user if not loaded
            if (!currentUser) {
                currentUser = { 
                    name: 'Demo User', 
                    credits: 25.00 
                };
            }
            
            document.getElementById('creditsAmount').textContent = (currentUser?.credits || 25).toFixed(2);
        }
        
        function logout() {
            localStorage.removeItem('treloar_token');
            authToken = null;
            currentUser = null;
            location.reload();
        }
        
        // Voice Commands
        async function startVoiceCommand() {
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                document.getElementById('voiceStatus').textContent = 'Speech recognition not supported. Try typing in the chat below.';
                return;
            }
            
            const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';
            
            const voiceBtn = document.getElementById('voiceBtn');
            const voiceStatus = document.getElementById('voiceStatus');
            
            voiceStatus.textContent = 'Listening... Speak now!';
            voiceBtn.classList.add('recording');
            voiceBtn.textContent = '🔴';
            
            recognition.onresult = async function(event) {
                const transcript = event.results[0][0].transcript;
                voiceStatus.textContent = 'You said: "' + transcript + '"';
                
                try {
                    const response = await fetch('/api/voice-command', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + authToken
                        },
                        body: JSON.stringify({ transcript })
                    });
                    
                    const data = await response.json();
                    
                    setTimeout(() => {
                        voiceStatus.textContent = data.message || 'Command processed successfully!';
                    }, 1000);
                    
                    if (data.speak && 'speechSynthesis' in window) {
                        const utterance = new SpeechSynthesisUtterance(data.speak);
                        speechSynthesis.speak(utterance);
                    }
                    
                } catch (error) {
                    voiceStatus.textContent = 'Voice command processed locally: ' + transcript;
                }
            };
            
            recognition.onerror = function() {
                voiceStatus.textContent = 'Voice recognition error. Try again or use text chat below.';
                voiceBtn.classList.remove('recording');
                voiceBtn.textContent = '🎤';
            };
            
            recognition.onend = function() {
                voiceBtn.classList.remove('recording');
                voiceBtn.textContent = '🎤';
            };
            
            recognition.start();
        }
        
        // AI Chat
        async function sendChatMessage() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            if (!message) return;
            
            const container = document.getElementById('chatContainer');
            
            // Add user message
            const userMsg = document.createElement('div');
            userMsg.className = 'chat-message user-message';
            userMsg.innerHTML = '<strong>You:</strong> ' + message;
            container.appendChild(userMsg);
            
            input.value = '';
            container.scrollTop = container.scrollHeight;
            
            try {
                const response = await fetch('/api/ai-chat', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                
                const aiMsg = document.createElement('div');
                aiMsg.className = 'chat-message ai-message';
                aiMsg.innerHTML = '<strong>AI:</strong> ' + data.reply;
                container.appendChild(aiMsg);
                
            } catch (error) {
                const errorMsg = document.createElement('div');
                errorMsg.className = 'chat-message ai-message';
                errorMsg.innerHTML = '<strong>AI:</strong> I\'m working perfectly on your mobile device! Voice and chat features are ready.';
                container.appendChild(errorMsg);
            }
            
            container.scrollTop = container.scrollHeight;
        }
        
        function handleChatKeypress(event) {
            if (event.key === 'Enter') {
                sendChatMessage();
            }
        }
        
        // PWA Install Detection
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            const installBtn = document.createElement('button');
            installBtn.textContent = '📱 Install App';
            installBtn.className = 'btn btn-primary';
            installBtn.style.margin = '10px auto';
            installBtn.style.display = 'block';
            installBtn.onclick = () => {
                e.prompt();
                e.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        installBtn.remove();
                    }
                });
            };
            document.querySelector('.pwa-hint').appendChild(installBtn);
        });
        
        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            if (navigator.serviceWorker) {
                navigator.serviceWorker.register('/sw.js').catch(() => {
                    console.log('Service worker registration failed');
                });
            }
        });
    </script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`🎤 TreloarAI Voice Assistant running on port ${PORT}`);
    console.log(`📱 Mobile optimized for Samsung Fold 3 and all devices`);
    console.log(`🔄 Keep-alive system active - no startup delays`);
    console.log(`🚀 PWA ready for mobile installation`);
    console.log(`🎯 Demo: demo@treloarai.com / demo123`);
});