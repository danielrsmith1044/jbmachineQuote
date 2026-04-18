const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

require('./db'); // initializes schema + seeds settings

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Optional HTTP Basic Auth — enabled only when AUTH_USER and AUTH_PASS are both set.
// Intended for public deployments (Render, etc.). Local dev leaves these unset.
const AUTH_USER = process.env.AUTH_USER;
const AUTH_PASS = process.env.AUTH_PASS;
if (AUTH_USER && AUTH_PASS) {
  console.log('[auth] HTTP Basic Auth enabled');
  app.use((req, res, next) => {
    // Always allow the health check so Render's probe doesn't need credentials.
    if (req.path === '/api/health') return next();
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      const user = decoded.slice(0, idx);
      const pass = decoded.slice(idx + 1);
      if (user === AUTH_USER && pass === AUTH_PASS) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="JB Machine Quoting"');
    return res.status(401).send('Authentication required');
  });
} else {
  console.log('[auth] open mode — set AUTH_USER and AUTH_PASS to require login');
}

app.use('/api/materials', require('./routes/materials'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve built client if available
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`JB Machine Quoting server on http://localhost:${PORT}`);
});
