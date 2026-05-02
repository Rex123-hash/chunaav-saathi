'use strict';

const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

// ─── Helmet (HTTP Security Headers) ──────────────────────────────────────────

/**
 * Configures Helmet with strict Content-Security-Policy.
 * Keys & secrets never reach the browser — only safe CDN/font origins allowed.
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      [
        "'self'", "'unsafe-inline'",        // Tailwind CDN requires inline
        'https://cdn.tailwindcss.com',
        'https://unpkg.com',
        'https://cdn.jsdelivr.net',
        'https://www.googletagmanager.com',
        'https://www.gstatic.com',
      ],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:', 'https:'],
      connectSrc:     [
        "'self'",
        'https://www.google-analytics.com',
        'https://fonts.googleapis.com',
      ],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable COEP — breaks CDN fonts
  hsts: {
    maxAge:            31536000,     // 1 year
    includeSubDomains: true,
    preload:           true,
  },
});

// ─── Rate Limiters ────────────────────────────────────────────────────────────

/**
 * Global API rate limiter — 100 requests per 15 minutes per IP.
 * Prevents DDoS and API key exhaustion.
 */
const globalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,   // 15 minutes
  max:             100,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many requests from this IP. Please try again in 15 minutes.' },
});

/**
 * Strict limiter for AI-powered endpoints (Gemini costs money).
 * 10 requests per minute per IP.
 */
const aiLimiter = rateLimit({
  windowMs:  60 * 1000,              // 1 minute
  max:       10,
  message:   { error: 'AI endpoint rate limit exceeded. Max 10 requests/minute.' },
});

/**
 * Strict limiter for external API proxy endpoints.
 * 30 requests per minute per IP.
 */
const externalApiLimiter = rateLimit({
  windowMs:  60 * 1000,
  max:       30,
  message:   { error: 'External API rate limit exceeded. Max 30 requests/minute.' },
});

// ─── Request Size Guard ───────────────────────────────────────────────────────

/**
 * Rejects any body larger than 50 KB.
 * Prevents memory exhaustion attacks.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestSizeGuard(req, res, next) {
  const MAX_BYTES = 50 * 1024; // 50 KB
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BYTES) {
    return res.status(413).json({ error: 'Request body too large (max 50 KB).' });
  }
  next();
}

// ─── Input Sanitizer ─────────────────────────────────────────────────────────

/** Characters never allowed in any API parameter */
const DANGEROUS_CHARS = /<script|<\/script|javascript:|on\w+\s*=|eval\(|data:/gi;

/**
 * Recursively sanitizes string values in an object.
 * Strips potentially dangerous HTML/script injection patterns.
 * @param {any} value
 * @returns {any}
 */
function sanitizeValue(value) {
  if (typeof value === 'string') return value.replace(DANGEROUS_CHARS, '');
  if (Array.isArray(value))      return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeValue(v)])
    );
  }
  return value;
}

/**
 * Middleware: sanitizes req.body and req.query in-place.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function sanitizeInput(req, res, next) {
  if (req.body)  req.body  = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query);
  next();
}

// ─── Security Response Headers ────────────────────────────────────────────────

/**
 * Adds extra security headers not covered by Helmet.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function extraSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options',    'nosniff');
  res.setHeader('X-Frame-Options',           'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy',           'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy',        'geolocation=(), microphone=(), camera=()');
  // NEVER expose server identity
  res.removeHeader('X-Powered-By');
  next();
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  helmetMiddleware,
  globalLimiter,
  aiLimiter,
  externalApiLimiter,
  requestSizeGuard,
  sanitizeInput,
  extraSecurityHeaders,
};
