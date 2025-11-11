// middleware/auth.js
const basicAuth = require('express-basic-auth');

// Basic auth middleware
const basicAuthMiddleware = basicAuth({
    users: {
        [process.env.BASIC_AUTH_USER]: process.env.BASIC_AUTH_PASSWORD
    },
    challenge: true,
    realm: 'Protected Area'
});

// Session authentication that remembers for 1 hour
const sessionAuth = (req, res, next) => {
    // Check if user is already authenticated in session
    if (req.session && req.session.authenticated) {
        // Refresh the session expiry
        req.session.touch();
        return next();
    }

    // If not authenticated, use basic auth
    return basicAuthMiddleware(req, res, (err) => {
        if (err) {
            return next(err);
        }

        // User passed basic auth - set session
        req.session.authenticated = true;
        req.session.user = process.env.BASIC_AUTH_USER;
        req.session.cookie.maxAge = 60 * 60 * 1000; // 1 hour

        console.log(`[${new Date().toISOString()}]: User ${req.session.user} authenticated via session`);
        next();
    });
};

// Main auth middleware
const auth = (req, res, next) => {
    const publicRoutes = ['/health', '/public', '/login'];
    if (publicRoutes.some(route => req.path.startsWith(route))) {
        return next();
    }
    return sessionAuth(req, res, next);
};

module.exports = {
    // Simple session-based authentication for API if needed
    authenticate: (req, res, next) => {
        if (req.session && req.session.authenticated) {
            return next();
        }
        return res.status(401).json({ error: 'Unauthorized' });
    },

    basic: basicAuthMiddleware,
    session: sessionAuth,
    auth
};