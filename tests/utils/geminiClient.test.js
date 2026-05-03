'use strict';

/**
 * @file geminiClient.test.js
 * @description Pure unit tests for geminiClient caching and parsing.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const geminiClient = require('../../src/utils/geminiClient');

describe('GeminiClient - Pure Unit Tests', () => {

  // ── Test 1: parseJSON ──────────────────────────────────────────────────────
  it('parseJSON() should parse clean JSON', () => {
    const raw = '{"hello":"world"}';
    const parsed = geminiClient.parseJSON(raw);
    assert.deepStrictEqual(parsed, { hello: 'world' });
  });

  it('parseJSON() should strip markdown fences', () => {
    const raw = '```json\n{"hello":"world"}\n```';
    const parsed = geminiClient.parseJSON(raw);
    assert.deepStrictEqual(parsed, { hello: 'world' });
  });

  it('parseJSON() should return null for invalid JSON', () => {
    const raw = 'not json at all';
    const parsed = geminiClient.parseJSON(raw);
    assert.strictEqual(parsed, null);
  });

  // ── Test 2: In-Memory Cache ────────────────────────────────────────────────
  it('cache should set, get, and expire items', async () => {
    geminiClient.cache.set('test_key', { data: 123 }, 100); // 100ms TTL
    
    let val = geminiClient.cache.get('test_key');
    assert.deepStrictEqual(val, { data: 123 });

    // Wait 150ms for TTL expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    
    val = geminiClient.cache.get('test_key');
    assert.strictEqual(val, null);
  });

  it('cache.clearByPrefix() should clear specific keys', () => {
    geminiClient.cache.set('user:1:a', 1);
    geminiClient.cache.set('user:1:b', 2);
    geminiClient.cache.set('user:2:a', 3);

    geminiClient.cache.clearByPrefix('user:1:');
    
    assert.strictEqual(geminiClient.cache.get('user:1:a'), null);
    assert.strictEqual(geminiClient.cache.get('user:1:b'), null);
    assert.strictEqual(geminiClient.cache.get('user:2:a'), 3);
  });
});
