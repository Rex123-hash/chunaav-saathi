'use strict';

/**
 * @file index.js
 * @description Core module for index functionality.
 */


require('dotenv').config({ override: true });

const express    = require('express');
const path       = require('path');
const compression = require('compression');
const {
  helmetMiddleware,
  globalLimiter,
  requestSizeGuard,
  sanitizeInput,
  extraSecurityHeaders,
} = require('./middleware/security');
const apiRoutes  = require('./routes/api');
const authRoutes = require('./routes/auth');

// ─── App Initialisation ───────────────────────────────────────────────────────

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── 1. Compression ────────────────────────────────────────────────────────────
//    gzip/brotli static assets and JSON responses. Always first.
app.use(compression());

// ── 2. Security Headers (Helmet + CSP + extras) ───────────────────────────────
app.use(helmetMiddleware);
app.use(extraSecurityHeaders);

// ── 3. CORS ───────────────────────────────────────────────────────────────────
//    Restrict to an explicit allow-list. Wildcard '*' is forbidden in production.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  // In dev (no CORS_ORIGIN set) allow localhost only
  const allowed =
    ALLOWED_ORIGINS.length === 0
      ? /^https?:\/\/localhost(:\d+)?$/.test(origin || '')
      : ALLOWED_ORIGINS.includes(origin);

  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin',  origin);
    res.setHeader('Vary',                         'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods',  'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',  'Content-Type,Authorization,X-Request-ID');
  res.setHeader('Access-Control-Max-Age',         '600');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── 4. Global Rate Limiter ────────────────────────────────────────────────────
app.use('/api', globalLimiter);

// ── 5. Body Parsers ───────────────────────────────────────────────────────────
app.use(requestSizeGuard);
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// ── 6. Input Sanitisation ─────────────────────────────────────────────────────
app.use(sanitizeInput);

// ── 7. Static Files ───────────────────────────────────────────────────────────
//    Served with strict cache headers. No sensitive files in /public.
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge:   '1d',
  etag:     true,
  dotfiles: 'deny',   // Never serve .env, .gitignore, etc.
}));

// ── 8. Request ID Propagation ─────────────────────────────────────────────────
app.use((req, _res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  next();
});

// ── 9. Request Logger ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms  = Date.now() - start;
    const lvl = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${lvl}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms) [${req.requestId}]`);
  });
  next();
});

// ── 10. Health Check ──────────────────────────────────────────────────────────
//     No rate limit — monitoring systems may call this frequently.
app.get('/health', async (req, res) => {
  try {
    const firestoreService = require('./services/firestore');
    const MythAgent        = require('./agents/MythAgent');
    const ExplainerAgent   = require('./agents/ExplainerAgent');

    const fsHealth  = await firestoreService.healthCheck();
    const mythHealth = MythAgent.healthCheck();

    res.json({
      status:     fsHealth.healthy ? 'healthy' : 'degraded',
      service:    'chunav-saathi',
      version:    process.env.npm_package_version || '1.0.0',
      timestamp:  new Date().toISOString(),
      services: {
        firestore:  { healthy: fsHealth.healthy, latency_ms: fsHealth.latency_ms },
        gemini:     { configured: mythHealth.configured, model: mythHealth.model },
        explainer:  { capabilities: ExplainerAgent.getCapabilities() },
      },
    });
  } catch (err) {
    res.status(503).json({
      status:    'unhealthy',
      timestamp: new Date().toISOString(),
      error:     process.env.NODE_ENV === 'production' ? 'Service unavailable' : err.message,
    });
  }
});

// ── 11. API Routes ────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api', apiRoutes);

// ── 12. 404 Catch-All ─────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error:      `Route ${req.method} ${req.path} not found`,
    requestId:  req.requestId,
    timestamp:  new Date().toISOString(),
  });
});

// ── 13. Global Error Handler ─────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Never expose stack traces or internal details in production
  const isProduction = process.env.NODE_ENV === 'production';
  const status  = err.status || err.statusCode || 500;
  const message = isProduction && status >= 500
    ? 'Internal server error'
    : (err.message || 'Internal server error');

  console.error(`[ERROR] ${req.method} ${req.path} → ${status}: ${err.stack || err.message} [${req.requestId}]`);

  res.status(status).json({
    error:     message,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

// ── Only auto-listen when run directly (not when require()'d in tests) ────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Chunav Saathi] Server running on port ${PORT}`);
    console.log(`[Chunav Saathi] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
