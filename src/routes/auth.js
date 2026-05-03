'use strict';

/**
 * @file auth.js
 * @description Core module for auth functionality.
 */


const express     = require('express');
const router      = express.Router();
const authService = require('../services/authService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendError(res, status, message) {
  res.status(status).json({ error: message, timestamp: new Date().toISOString() });
}

// ─── GET /v1/auth/google ──────────────────────────────────────────────────────

/**
 * Redirects the user to Google's OAuth2 consent screen.
 * Use this from a browser — not from API calls.
 *
 * Example: <a href="/api/v1/auth/google">Sign in with Google</a>
 */
router.get('/v1/auth/google', (req, res) => {
  try {
    const url = authService.getAuthUrl();
    return res.redirect(url);
  } catch (err) {
    console.error('[auth/google] Error:', err.message);
    return sendError(res, 503, 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID in environment.');
  }
});

// ─── GET /v1/auth/google/callback ────────────────────────────────────────────

/**
 * Google redirects here after the user grants/denies consent.
 * Exchanges the authorization code for a signed JWT and returns user info.
 *
 * Success → 200 { token, user }
 * Failure → 401 / 503
 */
router.get('/v1/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return sendError(res, 401, `Google OAuth denied: ${error}`);
  }
  if (!code) {
    return sendError(res, 400, 'Missing authorization code from Google.');
  }

  try {
    const user  = await authService.exchangeCodeForUser(code);
    const token = authService.issueToken(user);

    return res.json({
      token,
      expires_in: '7d',
      user: {
        googleId: user.googleId,
        email:    user.email,
        name:     user.name,
        picture:  user.picture,
      },
    });
  } catch (err) {
    console.error('[auth/callback] Error:', err.message);
    return sendError(res, 401, 'Failed to verify Google credentials. Please try again.');
  }
});

// ─── POST /v1/auth/google/verify ─────────────────────────────────────────────

/**
 * For mobile apps or SPAs that use Google Sign-In SDK directly.
 * Accepts a Google ID token and returns a Chunav Saathi JWT.
 *
 * Body: { idToken: string }
 * Returns: { token, user }
 */
router.post('/v1/auth/google/verify', async (req, res) => {
  const { idToken } = req.body || {};

  if (!idToken || typeof idToken !== 'string') {
    return sendError(res, 400, 'Missing or invalid "idToken" in request body.');
  }

  try {
    const user  = await authService.verifyIdToken(idToken);
    const token = authService.issueToken(user);

    return res.json({
      token,
      expires_in: '7d',
      user: {
        googleId: user.googleId,
        email:    user.email,
        name:     user.name,
        picture:  user.picture,
      },
    });
  } catch (err) {
    console.error('[auth/verify] Error:', err.message);
    return sendError(res, 401, 'Invalid Google ID token. Please sign in again.');
  }
});

// ─── GET /v1/auth/me ─────────────────────────────────────────────────────────

/**
 * Returns the currently authenticated user's profile.
 * Requires a valid Bearer token in the Authorization header.
 *
 * Returns: { googleId, email, name, picture }
 */
router.get('/v1/auth/me', authService.requireAuth, (req, res) => {
  return res.json({
    googleId: req.user.sub,
    email:    req.user.email,
    name:     req.user.name,
    picture:  req.user.picture,
  });
});

// ─── POST /v1/auth/logout ─────────────────────────────────────────────────────

/**
 * Stateless logout — instructs the client to discard the token.
 * JWTs are stateless so there's nothing to invalidate server-side.
 */
router.post('/v1/auth/logout', (req, res) => {
  return res.json({ message: 'Logged out successfully. Discard your token on the client.' });
});

module.exports = router;
