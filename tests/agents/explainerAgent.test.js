'use strict';

/**
 * @file explainerAgent.test.js
 * @description Unit tests for ExplainerAgent.
 * All Gemini calls are intercepted — no real API quota is consumed.
 */

const { describe, it, before, after, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Environment Setup ────────────────────────────────────────────────────────

process.env.GCLOUD_PROJECT  = 'chunav-saathi-test';
process.env.GCLOUD_LOCATION = 'us-central1';

// Require AFTER env vars
const explainerAgent = require('../../src/agents/ExplainerAgent');
const geminiClient   = require('../../src/utils/geminiClient');

// ─── Mock Helpers ─────────────────────────────────────────────────────────────

/**
 * Valid ExplanationResult fixture.
 * @param {object} [overrides]
 * @returns {object}
 */
function makeExplanation(overrides = {}) {
  return {
    topic:             'EVM',
    explanation:       'Electronic Voting Machine is a tamper-proof electronic device used to cast votes in Indian elections.',
    explanation_other: 'इलेक्ट्रॉनिक वोटिंग मशीन एक सुरक्षित उपकरण है जिसका उपयोग भारतीय चुनावों में मतदान के लिए किया जाता है।',
    key_points:        ['No internet connectivity', 'Battery operated', 'VVPAT attached'],
    analogy:           'Think of it like an ATM — it records input securely without exposing the data.',
    complexity_used:   3,
    ...overrides,
  };
}

/**
 * Stubs geminiClient.generate to return a JSON string.
 * @param {object} responseObj
 */
function stubGenerate(responseObj) {
  return mock.method(geminiClient, 'generate', async () => JSON.stringify(responseObj));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ExplainerAgent - Unit Tests', () => {
  after(() => { mock.restoreAll(); });

  // ── Test 1: getCapabilities ────────────────────────────────────────────────

  it('getCapabilities() should return supported topics, lang options, and complexity range', () => {
    const caps = explainerAgent.getCapabilities();

    assert.ok(Array.isArray(caps.supportedTopics),    'supportedTopics should be an array');
    assert.ok(caps.supportedTopics.length > 0,        'Should list at least one topic');
    assert.deepStrictEqual(caps.langOptions, ['hi', 'en', 'hinglish'], 'Should support 3 languages');
    assert.ok(typeof caps.complexityRange === 'string', 'complexityRange should be a string');
    assert.ok(caps.complexityRange.includes('1'),     'Should mention min complexity');
    assert.ok(caps.complexityRange.includes('5'),     'Should mention max complexity');
  });

  // ── Test 2: Basic explain call ─────────────────────────────────────────────

  it('explain() should return a valid ExplanationResult for a known topic', async () => {
    const fixture = makeExplanation();
    stubGenerate(fixture);

    const result = await explainerAgent.explain('EVM', 'en', 3);

    assert.ok(result.explanation,               'Should have explanation');
    assert.ok(Array.isArray(result.key_points), 'key_points should be an array');
    assert.ok(result.analogy,                   'Should have an analogy');
    assert.strictEqual(result.complexity_used, 3, 'complexity_used should match input');

    mock.restoreAll();
  });

  // ── Test 3: Empty topic throws ─────────────────────────────────────────────

  it('explain() should throw when topic is empty', async () => {
    await assert.rejects(
      () => explainerAgent.explain(''),
      { message: /topic is required/i },
      'Empty topic should throw'
    );

    await assert.rejects(
      () => explainerAgent.explain('   '),
      { message: /topic is required/i },
      'Whitespace-only topic should throw'
    );
  });

  // ── Test 4: Complexity clamping ────────────────────────────────────────────

  it('explain() should clamp complexity to 1-5 range', async () => {
    const fixture = makeExplanation({ complexity_used: 5 });
    stubGenerate(fixture);

    // complexity 99 → clamped to 5
    const result = await explainerAgent.explain('NOTA', 'en', 99);
    assert.strictEqual(result.complexity_used, 5, 'Should clamp to max 5');

    mock.restoreAll();
    stubGenerate(makeExplanation({ complexity_used: 1 }));

    // complexity -5 → clamped to 1
    const result2 = await explainerAgent.explain('VVPAT', 'en', -5);
    assert.strictEqual(result2.complexity_used, 1, 'Should clamp to min 1');

    mock.restoreAll();
  });

  // ── Test 5: Invalid lang falls back to hinglish ────────────────────────────

  it('explain() should fallback to hinglish for unknown lang', async () => {
    const fixture = makeExplanation();
    stubGenerate(fixture);

    // Should not throw, just uses hinglish internally
    const result = await explainerAgent.explain('NOTA', 'fr', 2);
    assert.ok(result.explanation, 'Should still return a result');

    mock.restoreAll();
  });

  // ── Test 6: Gemini cache hit skips generate ────────────────────────────────

  it('explain() should use cache on repeated identical calls', async () => {
    const fixture = makeExplanation({ topic: 'Voter ID' });
    const generateStub = stubGenerate(fixture);

    await explainerAgent.explain('Voter ID', 'en', 2);
    await explainerAgent.explain('Voter ID', 'en', 2); // should hit cache

    // generate may be called once (first call) or zero times (already cached from prior tests)
    assert.ok(generateStub.mock.calls.length <= 1, 'Generate should be called at most once (cache on 2nd call)');

    mock.restoreAll();
  });

  // ── Test 7: Invalid JSON from model → graceful fallback ───────────────────

  it('explain() should return graceful fallback when model returns invalid JSON', async () => {
    mock.method(geminiClient, 'generate', async () => 'NOT_VALID_JSON {{');

    const result = await explainerAgent.explain('EVM Hack', 'en', 2);

    // Should NOT throw — graceful fallback
    assert.ok(result.explanation,             'Should return fallback explanation');
    assert.deepStrictEqual(result.key_points, [], 'key_points should be empty on fallback');
    assert.strictEqual(result.analogy,        '',  'analogy should be empty on fallback');

    mock.restoreAll();
  });

  // ── Test 8: Missing required fields → graceful fallback ───────────────────

  it('explain() should fallback when model response missing explanation field', async () => {
    // Return partial object — missing 'explanation'
    mock.method(geminiClient, 'generate', async () =>
      JSON.stringify({ topic: 'EVM', key_points: ['point1'], complexity_used: 2 })
    );

    const result = await explainerAgent.explain('EVM', 'en', 2);
    // Graceful fallback returns explanation string
    assert.ok(typeof result.explanation === 'string', 'Should have fallback explanation string');

    mock.restoreAll();
  });

  // ── Test 9: explainBatch returns array of results ─────────────────────────

  it('explainBatch() should explain multiple topics in parallel', async () => {
    stubGenerate(makeExplanation());

    const topics = ['EVM', 'NOTA', 'VVPAT'];
    const results = await explainerAgent.explainBatch(topics, 'en', 2);

    assert.ok(Array.isArray(results),          'Should return an array');
    assert.strictEqual(results.length, 3,      'Should return one result per topic');
    results.forEach(r => {
      assert.ok(r.explanation, 'Each result should have explanation');
    });

    mock.restoreAll();
  });

  // ── Test 10: explainBatch caps at 5 items ─────────────────────────────────

  it('explainBatch() should silently cap batch at 5 topics', async () => {
    stubGenerate(makeExplanation());

    const topics = ['A', 'B', 'C', 'D', 'E', 'F', 'G']; // 7 items
    const results = await explainerAgent.explainBatch(topics, 'en', 2);

    assert.ok(results.length <= 5, `Expected ≤5 results, got ${results.length}`);

    mock.restoreAll();
  });

  // ── Test 11: explainBatch with empty array returns [] ─────────────────────

  it('explainBatch() should return [] for empty topics array', async () => {
    const results = await explainerAgent.explainBatch([], 'en', 2);
    assert.deepStrictEqual(results, []);
  });

  // ── Test 12: key_points capped at 5 ──────────────────────────────────────

  it('explain() should cap key_points to 5 items maximum', async () => {
    const fixture = makeExplanation({
      key_points: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], // 7 items
    });
    stubGenerate(fixture);

    const result = await explainerAgent.explain('Model Code of Conduct', 'en', 3);
    assert.ok(result.key_points.length <= 5, 'key_points should be capped at 5');

    mock.restoreAll();
  });

  // ── Test 13: Hindi language preference ────────────────────────────────────

  it('explain() should work with Hindi language preference', async () => {
    const fixture = makeExplanation({
      explanation: 'ईवीएम एक सुरक्षित इलेक्ट्रॉनिक मतदान मशीन है।',
    });
    stubGenerate(fixture);

    const result = await explainerAgent.explain('EVM', 'hi', 1);
    assert.ok(result.explanation, 'Should return Hindi explanation');
    assert.strictEqual(result.complexity_used, 1);

    mock.restoreAll();
  });
});
