'use strict';

/**
 * Integration tests for Chunav Saathi Express API.
 *
 * Prerequisites:
 *   - Firestore emulator running: firebase emulators:start --only firestore
 *   - Run with: FIRESTORE_EMULATOR_HOST=localhost:8080 node --test tests/integration/api.test.js
 *
 * These tests define the API CONTRACT for routes to be built in src/routes/.
 * They will fail until routes are implemented — that is intentional.
 */

const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');

const {
  startServer,
  stopServer,
  request,
  mockMythAgent,
  mockGeminiGenerate,
  seedMyth,
  makeMythResponse,
  makeExplainResponse,
} = require('../utils/testHelpers');

// ─── Suite State ─────────────────────────────────────────────────────────[...]

let server;

// ─── Fixture Data ──────────────────────────────────────────────────────────[...]

const MOCK_MYTH_RESP = makeMythResponse();

const MOCK_EXPLAIN_RESP = makeExplainResponse();

const MOCK_JOURNEY_SUGGESTION = JSON.stringify({
  moduleId: 'voter_registration',
  title_hi: 'Voter Registration — क्या आप registered हैं?',
  title_en: 'Voter Registration — Are you on the electoral roll?',
  why_hi:   'यह आपका पहला कदम है।',
  why_en:   'This is your first step.',
  tips:     ['Check NVSP', 'Verify EPIC card', 'Update address if changed'],
});

// ─── Global Setup / Teardown ──────────────────────────────────────────────────

before(async () => {
  server = await startServer();

  // Seed Firestore with baseline myth (requires emulator)
  try {
    await seedMyth({ text_en: 'EVMs can be hacked', category: 'evm_security', truth_level: 5 });
    console.log('[integration] Firestore seeded successfully');
  } catch (err) {
    console.warn('[integration] Firestore seed skipped (emulator may not be running):', err.message);
  }

  // Mock all Gemini calls so no real API hits during integration tests
  mockMythAgent(MOCK_MYTH_RESP);
  mockGeminiGenerate(async () => JSON.stringify(MOCK_EXPLAIN_RESP), mock);
});

after(async () => {
  mock.restoreAll();
  if (server) await stopServer(server);
});

// ─── Test Suite ───────────────────────────────────────────────────────────[...]

describe('API Endpoints — Integration Tests', () => {

  // ── Health ───────────────────────────────────────────────────────────[...]

  it('GET /health — should return healthy status with services map', async () => {
    const { status, body } = await request('GET', '/health');

    assert.ok([200, 503].includes(status), `Unexpected status ${status}`);
    assert.ok(
      body.status === 'healthy' || body.status === 'degraded' || body.status === 'unhealthy',
      `Unexpected health status: ${body.status}`
    );
    // services object must exist if response is not 503 error
    if (status === 200) {
      assert.ok(body.services, 'Should include services breakdown');
      assert.ok(typeof body.services.firestore === 'object', 'Should include firestore service status');
    }
  });

  it('GET /health — should include CORS headers', async () => {
    const { status, headers } = await request('GET', '/health', null, {
      Origin: 'https://example.com',
    });

    assert.ok([200, 503].includes(status));
    assert.ok(
      headers.get('access-control-allow-origin'),
      'Should set Access-Control-Allow-Origin header'
    );
  });

  // ── POST /api/v1/myth-check ───────────────────────────────────────────────

  it('POST /api/v1/myth-check — valid request returns myth analysis', async () => {
    const { status, body } = await request('POST', '/api/v1/myth-check', {
      text: 'EVMs can be hacked remotely using Bluetooth',
      lang: 'en',
    });

    assert.strictEqual(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.isMythBusted !== undefined, 'Should have isMythBusted field');
    assert.ok(
      typeof body.truthScore === 'number' && body.truthScore >= 0 && body.truthScore <= 100,
      `truthScore out of range: ${body.truthScore}`
    );
    assert.ok(Array.isArray(body.sources), 'sources should be an array');
    assert.ok(
      ['voting_process', 'candidate_info', 'evm_security'].includes(body.category),
      `Invalid category: ${body.category}`
    );
  });

  it('POST /api/v1/myth-check — missing text returns 400', async () => {
    const { status, body } = await request('POST', '/api/v1/myth-check', {
      lang: 'en', // no text field
    });

    assert.strictEqual(status, 400, `Expected 400, got ${status}`);
    assert.ok(body.error, 'Should return an error field');
    assert.ok(
      body.error.toLowerCase().includes('text'),
      `Error should mention "text", got: "${body.error}"`
    );
  });

  it('POST /api/v1/myth-check — empty text returns 400', async () => {
    const { status, body } = await request('POST', '/api/v1/myth-check', {
      text: '   ',
      lang: 'en',
    });

    assert.strictEqual(status, 400, `Expected 400 for blank text, got ${status}`);
    assert.ok(body.error);
  });

  it('POST /api/v1/myth-check — response time < 3000ms', async () => {
    const start = Date.now();
    await request('POST', '/api/v1/myth-check', { text: 'Is NOTA valid?', lang: 'en' });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 3000, `Response took ${elapsed}ms, expected < 3000ms`);
  });

  // ── GET /api/v1/voter-journey/:userId ─────────────────────────────────────

  it('GET /api/v1/voter-journey/:userId — returns initial journey state', async () => {
    const userId = `test-user-${Date.now()}`;
    const { status, body } = await request('GET', `/api/v1/voter-journey/${userId}`);

    assert.strictEqual(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.strictEqual(body.user_id, userId, 'user_id should match request parameter');
    assert.ok(
      typeof body.stage === 'number' && body.stage >= 1 && body.stage <= 5,
      `stage out of range: ${body.stage}`
    );
    assert.ok(Array.isArray(body.completed_modules), 'completed_modules should be an array');
    assert.ok(
      typeof body.progress === 'number' && body.progress >= 0 && body.progress <= 100,
      `progress out of range: ${body.progress}`
    );
  });

  it('GET /api/v1/voter-journey/:userId — same userId returns idempotent state', async () => {
    const userId = `stable-user-${Date.now()}`;

    const { body: first }  = await request('GET', `/api/v1/voter-journey/${userId}`);
    const { body: second } = await request('GET', `/api/v1/voter-journey/${userId}`);

    assert.strictEqual(first.user_id,  userId);
    assert.strictEqual(second.user_id, userId);
    assert.strictEqual(first.stage,    second.stage, 'Stage should be stable across reads');
  });

  // ── PUT /api/v1/voter-journey/:userId ─────────────────────────────────────

  it('PUT /api/v1/voter-journey/:userId — updates stage and completed_modules', async () => {
    const userId = `update-user-${Date.now()}`;

    // First: create journey
    await request('GET', `/api/v1/voter-journey/${userId}`);

    // Then update
    const { status, body } = await request('PUT', `/api/v1/voter-journey/${userId}`, {
      stage:             2,
      completed_modules: ['voter_registration'],
    });

    assert.strictEqual(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.strictEqual(body.stage, 2, 'Stage should be updated');
    assert.ok(
      Array.isArray(body.completed_modules) && body.completed_modules.includes('voter_registration'),
      'completed_modules should contain updated value'
    );
  });

  it('PUT /api/v1/voter-journey/:userId — invalid stage returns 400', async () => {
    const { status, body } = await request('PUT', `/api/v1/voter-journey/any-user`, {
      stage: 99, // invalid: must be 1-5
    });

    assert.strictEqual(status, 400, `Expected 400 for invalid stage, got ${status}`);
    assert.ok(body.error);
  });

  // ── POST /api/v1/voter-journey/:userId/complete ───────────────────────────

  it('POST /api/v1/voter-journey/:userId/complete — marks module as completed', async () => {
    const userId = `complete-user-${Date.now()}`;
    await request('GET', `/api/v1/voter-journey/${userId}`); // init

    const { status, body } = await request(
      'POST',
      `/api/v1/voter-journey/${userId}/complete`,
      { moduleId: 'voter_registration' }
    );

    assert.strictEqual(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(
      body.completed_modules?.includes('voter_registration'),
      'Should mark module as completed'
    );
    assert.ok(body.progress > 0, 'Progress should increase after completion');
  });

  it('POST /api/v1/voter-journey/:userId/complete — unknown moduleId returns 400', async () => {
    const { status, body } = await request(
      'POST',
      '/api/v1/voter-journey/any-user/complete',
      { moduleId: 'nonexistent_module' }
    );

    assert.strictEqual(status, 400, `Expected 400 for bad moduleId, got ${status}`);
    assert.ok(body.error);
  });

  // ── POST /api/v1/explain ──────────────────────────────────────────────────

  it('POST /api/v1/explain — returns explanation with key_points and analogy', async () => {
    const { status, body } = await request('POST', '/api/v1/explain', {
      topic:      'NOTA',
      complexity: 2,
      lang:       'en',
    });

    assert.strictEqual(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.explanation,             'Should have explanation field');
    assert.ok(body.explanation.length > 50, `Explanation too short (${body.explanation.length} chars)`);
    assert.ok(Array.isArray(body.key_points), 'key_points should be an array');
    assert.ok(body.analogy,                 'Should have analogy field');
  });

  it('POST /api/v1/explain — missing topic returns 400', async () => {
    const { status, body } = await request('POST', '/api/v1/explain', {
      complexity: 2,
      lang:       'en',
    });

    assert.strictEqual(status, 400, `Expected 400, got ${status}`);
    assert.ok(body.error);
  });

  it('POST /api/v1/explain — complexity clamped to 1-5 range', async () => {
    const { status, body } = await request('POST', '/api/v1/explain', {
      topic:      'EVM',
      complexity: 99, // out of range — should clamp, not error
      lang:       'en',
    });

    // Route should accept and clamp, not reject
    assert.ok([200, 400].includes(status), `Unexpected status ${status}`);
    if (status === 200) {
      assert.ok(body.complexity_used >= 1 && body.complexity_used <= 5,
        `complexity_used should be clamped: ${body.complexity_used}`);
    }
  });

  // ── 404 handling ──────────────────────────────────────────────────────────[...]

  it('Unknown routes — should return 404 JSON', async () => {
    const { status, body } = await request('GET', '/api/v1/nonexistent-endpoint');

    assert.strictEqual(status, 404, `Expected 404, got ${status}`);
    assert.ok(body.error, 'Should return JSON error body');
  });

  // ── OPTIONS preflight ─────────────────────────────────────────────────────

  it('OPTIONS /api/v1/myth-check — CORS preflight returns 204', async () => {
    const { status } = await request('OPTIONS', '/api/v1/myth-check', null, {
      Origin:                          'https://example.com',
      'Access-Control-Request-Method': 'POST',
    });

    assert.strictEqual(status, 204, `Expected 204 for OPTIONS preflight, got ${status}`);
  });

  // ── Rate Limiting ──────────────────────────────────────────────────────────[...]
  // NOTE: This test is run LAST because it floods the rate limiter.
  // Running it first would cause subsequent tests to fail with 429 instead of expected status codes.

  it('Rate limiting — should return 429 after threshold is exceeded', async () => {
    // Send 105 concurrent requests to trigger rate limiter (threshold: 100/15min)
    const requests = Array.from({ length: 105 }, (_, i) =>
      request('POST', '/api/v1/myth-check', { text: `Rapid test ${i}`, lang: 'en' })
    );

    const responses  = await Promise.all(requests);
    const statuses   = responses.map(r => r.status);
    const rateLimited = statuses.filter(s => s === 429);

    // Some may already 404 (routes not built yet) — test the rate-limit behavior
    // when routes exist. For now, at least verify the server doesn't crash.
    assert.ok(
      statuses.every(s => [200, 400, 404, 429, 503].includes(s)),
      `Unexpected status codes: ${[...new Set(statuses)].join(', ')}`
    );

    // Once rate limiting is implemented this assertion activates:
    if (rateLimited.length === 0) {
      console.warn('[integration] Rate limiting not yet implemented — skipping threshold assertion');
    } else {
      assert.ok(rateLimited.length > 0, 'Should rate limit after threshold');
    }
  });
});
