'use strict';

/**
 * @file authService.js
 * @description Core module for authService functionality.
 */


const { OAuth2Client } = require('google-auth-library');
const jwt              = require('jsonwebtoken');

// ─── Config ───────────────────────────────────────────────────────────────────

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/v1/auth/google/callback';

// In production, JWT_SECRET MUST be set via environment variable.
// A weak fallback is only allowed in development/test environments.
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[AuthService] JWT_SECRET environment variable is required in production');
  }
  return 'chunav-saathi-dev-secret-change-in-prod'; // dev only
})();
const JWT_EXPIRES   = '7d';

// ─── OAuth2 Client ────────────────────────────────────────────────────────────

/**
 * Returns a configured OAuth2Client.
 * Lazily instantiated so missing env vars only throw at call time.
 * @returns {OAuth2Client}
 */
function getOAuthClient() {
  if (!CLIENT_ID) throw new Error('[AuthService] GOOGLE_CLIENT_ID is not set');
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

// ─── Auth URL ─────────────────────────────────────────────────────────────────

/**
 * Generates the Google OAuth2 consent screen URL.
 * @returns {string}
 */
function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid',
    ],
  });
}

// ─── Code → User ─────────────────────────────────────────────────────────────

/**
 * Exchanges an OAuth authorization code for a verified user profile.
 * @param {string} code - Authorization code from Google callback
 * @returns {Promise<UserProfile>}
 */
async function exchangeCodeForUser(code) {
  const client          = getOAuthClient();
  const { tokens }      = await client.getToken(code);
  client.setCredentials(tokens);

  const ticket = await client.verifyIdToken({
    idToken:  tokens.id_token,
    audience: CLIENT_ID,
  });

  return normalisePayload(ticket.getPayload());
}

// ─── ID Token Verify (SPA / Mobile) ──────────────────────────────────────────

/**
 * Verifies a Google ID token sent directly by a client-side SDK.
 * @param {string} idToken
 * @returns {Promise<UserProfile>}
 */
async function verifyIdToken(idToken) {
  if (!CLIENT_ID) throw new Error('[AuthService] GOOGLE_CLIENT_ID is not set');
  const client = new OAuth2Client(CLIENT_ID);
  const ticket = await client.verifyIdToken({ idToken, audience: CLIENT_ID });
  return normalisePayload(ticket.getPayload());
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

/**
 * Issues a signed JWT for a verified user.
 * @param {UserProfile} user
 * @returns {string}
 */
function issueToken(user) {
  return jwt.sign(
    { sub: user.googleId, email: user.email, name: user.name, picture: user.picture },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES, issuer: 'chunav-saathi' }
  );
}

/**
 * Verifies a Chunav Saathi JWT and returns the payload.
 * @param {string} token
 * @returns {{ sub:string, email:string, name:string, picture:string }}
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { issuer: 'chunav-saathi' });
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

/**
 * Express middleware — attaches `req.user` if a valid Bearer token is present.
 * Returns 401 if the token is missing or invalid.
 * @type {import('express').RequestHandler}
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      error:     'Authentication required. Provide a Bearer token in the Authorization header.',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({
      error:     'Invalid or expired token. Please sign in again.',
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} UserProfile
 * @property {string} googleId
 * @property {string} email
 * @property {boolean} emailVerified
 * @property {string} name
 * @property {string} picture
 */

/**
 * Normalises a raw Google ID token payload into a consistent UserProfile.
 * @param {import('google-auth-library').TokenPayload} payload
 * @returns {UserProfile}
 */
function normalisePayload(payload) {
  return {
    googleId:      payload.sub,
    email:         payload.email         || '',
    emailVerified: payload.email_verified || false,
    name:          payload.name          || '',
    picture:       payload.picture       || '',
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { getAuthUrl, exchangeCodeForUser, verifyIdToken, issueToken, verifyToken, requireAuth };
