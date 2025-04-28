require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const dbService = require('./db-service');
require('./refresh-tokens-cron'); // Import the cron job
require('./session-cleanup-cron'); // Import the session cleanup cron job

const app = express();

// Middleware to redirect HTTP to HTTPS
app.use((req, res, next) => {
    if (!req.secure) {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.static(path.join(__dirname, './public')));

// Configure session middleware
app.use(session({
    store: new SQLiteStore({
        db: 'oauth.db',
        table: 'sessions'
    }),
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // Always secure
        httpOnly: true, // Prevent client-side JavaScript from accessing the cookie
        maxAge: 30 * 60 * 1000 // 30 minutes
    }
}));

// Helper function to render HTML templates
function renderTemplate(filename, data = {}) {
    let template = fs.readFileSync(path.join(__dirname, './public', filename), 'utf8');
    Object.entries(data).forEach(([key, value]) => {
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });
    return template;
}

// Start OAuth flow
app.get('/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    // Store state in session
    req.session.oauthState = state;
    
    console.log('Session ID:', req.sessionID);
    console.log('Stored state:', req.session.oauthState);
    
    const authUrl = new URL(process.env.AUTHORIZATION_URL);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', process.env.CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', process.env.REDIRECT_URI);
    authUrl.searchParams.append('scope', process.env.SCOPE);
    authUrl.searchParams.append('state', state);

    res.redirect(authUrl.toString());
});

// OAuth callback
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.send(renderTemplate('callback-error.html', {
            error: 'No authorization code received'
        }));
    }

    // Verify state parameter
    if (!state || !req.session || state !== req.session.oauthState) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            res.send(renderTemplate('callback-error.html', {
                error: 'Invalid state parameter'
            }));
        });
        return;
    }

    try {
        const tokenResponse = await axios.post(process.env.TOKEN_URL, {
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.REDIRECT_URI,
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, id_token, expires_in, refresh_token } = tokenResponse.data;

        // Decode ID token to get sub
        const idTokenPayload = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64').toString());
        const { sub } = idTokenPayload;

        // Store refresh token
        if (refresh_token) {
            await dbService.storeRefreshToken(sub, refresh_token);
        }

        // Destroy the session after successful callback
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            // Render callback page with token data
            res.send(renderTemplate('callback.html', {
                access_token,
                sub,
                expires_in
            }));
        });
    } catch (error) {
        console.error('Error during token exchange:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.error_description || 
                           error.response?.data?.error || 
                           error.message || 
                           'Error during authentication';
        
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            res.send(renderTemplate('callback-error.html', {
                error: errorMessage
            }));
        });
    }
});

// Token refresh endpoint
// This endpoint is missing authorization. The frontned must not store the refresh token. 
// And the backend must not allow unauthenticated access to refresh tokens for any sub.
// Ideally, the frontend will pass another token (not from Adobe) to this endpoint 
// based on the token the backend then must get the coresponding sub and ref
// using the refresh token the backend will fetch access token and then return the new access token.
app.post('/api/refresh', async (req, res) => {
    const { sub } = req.body;
    if (!sub) {
        return res.status(400).json({ error: 'No sub provided' });
    }

    try {
        // Get refresh token from database
        const refresh_token = await dbService.getRefreshToken(sub);
        if (!refresh_token) {
            return res.status(404).json({ error: 'No refresh token found for this user' });
        }

        const tokenResponse = await axios.post(process.env.TOKEN_URL, {
            grant_type: 'refresh_token',
            refresh_token,
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, expires_in, refresh_token: new_refresh_token } = tokenResponse.data;

        // Store new refresh token if provided
        if (new_refresh_token) {
            await dbService.updateRefreshToken(sub, new_refresh_token);
        }

        res.json({access_token,expires_in});
    } catch (error) {
        console.error('Error during token refresh:', error.response?.data || error.message);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

// Admin dashboard route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, './public/admin.html'));
});

// Admin API endpoint to get all tokens
app.get('/api/admin/tokens', async (req, res) => {
    try {
        const tokens = await dbService.getAllTokens();
        res.json(tokens);
    } catch (error) {
        console.error('Error fetching tokens for admin:', error);
        res.status(500).json({ error: 'Failed to fetch tokens' });
    }
});

// Admin API endpoint to delete a token
app.delete('/api/admin/tokens/:sub', async (req, res) => {
    try {
        await dbService.deleteRefreshToken(req.params.sub);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting token:', error);
        res.status(500).json({ error: 'Failed to delete token' });
    }
});

// Read SSL certificates
const options = {
    key: fs.readFileSync('certs/localhost.key'),
    cert: fs.readFileSync('certs/localhost.crt')
};

// Create HTTP and HTTPS servers
const httpServer = http.createServer(app);
const httpsServer = https.createServer(options, app);

// Start both servers
const HTTP_PORT = 80;
const HTTPS_PORT = 443;

httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP Server running on http://localhost:${HTTP_PORT}`);
});

httpsServer.listen(HTTPS_PORT, () => {
    console.log(`HTTPS Server running on https://localhost:${HTTPS_PORT}`);
}); 