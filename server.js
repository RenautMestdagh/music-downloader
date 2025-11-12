// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const { auth } = require("./middleware/auth");
const downloadService = require('./services/downloadService');
const paths = require('./config/paths');
const fs = require("fs");
const logger = require('./utils/logger'); // Add this

const app = express();

app.set('trust proxy', true);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

const DB_PATH = paths.dbPath;
const DB_DIR = path.dirname(DB_PATH);

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, {
        recursive: true,
        mode: process.env.NODE_ENV === 'production' ? 0o750 : 0o777
    });
}

// Enhanced session configuration
app.use(
    session({
        store: new SQLiteStore({
            db: 'sessions.db',
            dir: DB_DIR,
            table: 'sessions'
        }),
        secret: process.env.SESSION_SECRET || 'music-downloader-secret-key-change-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 60 * 60 * 1000, // 1 hour
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        },
        name: 'musicdownloader.sid' // Specific cookie name
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check (public)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Music Downloader',
        authenticated: !!(req.session && req.session.authenticated)
    });
});

// Login route to set session without basic auth prompt
app.post('/login', express.json(), (req, res) => {
    const { username, password } = req.body;

    if (username === process.env.BASIC_AUTH_USER && password === process.env.BASIC_AUTH_PASSWORD) {
        req.session.authenticated = true;
        req.session.user = username;
        req.session.cookie.maxAge = 60 * 60 * 1000;

        res.json({ success: true, message: 'Logged in successfully' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Logout route
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            logger.error('Error destroying session:', err);
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Session status endpoint
app.get('/session-status', (req, res) => {
    res.json({
        authenticated: !!(req.session && req.session.authenticated),
        user: req.session?.user,
        expires: req.session?.cookie?.expires
    });
});

// Web interface routes (use session/auth)
app.use('/', auth, require('./routes/web'));

// API routes (use session/auth)
app.use('/api', auth, require('./routes/api'));

// Error Handling
app.use((err, req, res, next) => {
    logger.error('Error:', err.stack);

    if (err.status === 401) {
        return res.status(401).set('WWW-Authenticate', 'Basic realm="Protected Area"').send('Unauthorized');
    }

    res.status(500).json({
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    logger.info(`Music Downloader running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Log level: ${logger.levelNames[logger.currentLevel]}`);

    // Start the download service (runs independently)
    try {
        await downloadService.initialize();
        logger.info('Download service initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize download service:', error);
    }
});