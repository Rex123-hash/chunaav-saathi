/**
 * check-key.js
 * -----------
 * Diagnostic tool: Verifies the Gemini API key is functional.
 * Run with: node check-key.js
 *
 * SECURITY: This script ONLY reads keys from the .env file via dotenv.
 * It never logs, stores, or transmits any key value — only prints
 * a masked summary (first 6 + last 4 chars) for visual confirmation.
 */

'use strict';

const https = require('node:https');
const path  = require('node:path');

// ── Load environment (never commit .env) ─────────────────────────────────────
require('dotenv').config({ override: true, path: path.join(__dirname, '.env') });

const apiKey = process.env.GEMINI_API_KEY;

// ── Guard: key present ────────────────────────────────────────────────────────
if (!apiKey || apiKey.trim() === '' || apiKey.includes('your-')) {
  console.error('❌  GEMINI_API_KEY is not set in .env');
  console.error('    Copy .env.example → .env and fill in your real key.');
  process.exit(1);
}

// ── Mask key — NEVER log the full value ──────────────────────────────────────
const masked = `${apiKey.slice(0, 6)}${'*'.repeat(Math.max(0, apiKey.length - 10))}${apiKey.slice(-4)}`;
console.log(`🔑  Key loaded: ${masked}`);
console.log('📡  Testing connectivity to Gemini API…\n');

// ── Minimal test request ──────────────────────────────────────────────────────
const body = JSON.stringify({
  contents:         [{ parts: [{ text: 'Reply with the single word: OK' }] }],
  generationConfig: { maxOutputTokens: 5, temperature: 0 },
});

const options = {
  hostname: 'generativelanguage.googleapis.com',
  path:     `/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
  method:   'POST',
  headers:  {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    const raw    = Buffer.concat(chunks).toString('utf8');
    const parsed = tryParseJSON(raw);

    if (res.statusCode === 200) {
      const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no text)';
      console.log('✅  SUCCESS — API key is active and responding.');
      console.log(`    Model replied: "${text.trim()}"`);
      process.exit(0);
    }

    if (res.statusCode === 429) {
      const isFreeTier = raw.includes('free_tier') || raw.includes('FREE_TIER');
      if (isFreeTier) {
        console.error('⚠️  FREE-TIER quota exhausted.');
        console.error('    Enable billing on your Google Cloud project to continue.');
      } else {
        console.error('⚠️  PAID-TIER rate limit hit. Wait a moment and retry.');
      }
      // Print sanitised error — strip any potential key echoes from the message
      const msg = (parsed?.error?.message || '').replace(apiKey, '[REDACTED]').slice(0, 200);
      if (msg) console.error(`    Details: ${msg}`);
      process.exit(1);
    }

    if (res.statusCode === 400) {
      console.error('❌  Bad request — the key format may be invalid.');
      process.exit(1);
    }

    if (res.statusCode === 403) {
      console.error('❌  Forbidden — the key lacks permission for this model.');
      console.error('    Ensure "Generative Language API" is enabled in your GCP project.');
      process.exit(1);
    }

    console.error(`❌  Unexpected status ${res.statusCode}.`);
    // Redact any accidental key exposure in the body before logging
    const safeBody = raw.replace(apiKey, '[REDACTED]').slice(0, 300);
    console.error(`    Body: ${safeBody}`);
    process.exit(1);
  });
});

req.on('error', (err) => {
  console.error('❌  Network error:', err.message);
  process.exit(1);
});

req.write(body);
req.end();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Safe JSON parser — returns null on failure.
 * @param {string} text
 * @returns {any|null}
 */
function tryParseJSON(text) {
  try { return JSON.parse(text); } catch { return null; }
}
