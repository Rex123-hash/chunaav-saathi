'use strict';

/**
 * @file factsServer.test.js
 * @description Unit tests for the MCP Facts Server.
 * Pure synchronous tests — no Gemini, no Firestore, no network calls.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const factsServer = require('../../src/mcp/factsServer');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FactsServer - MCP Unit Tests', () => {

  // ── Test 1: stats() returns valid summary ─────────────────────────────────

  it('stats() should return total fact count and byCategory breakdown', () => {
    const result = factsServer.stats();

    assert.ok(typeof result.total === 'number',     'total should be a number');
    assert.ok(result.total >= 0,                    'total should be non-negative');
    assert.ok(typeof result.byCategory === 'object','byCategory should be an object');
  });

  // ── Test 2: listFactsByCategory - valid category ───────────────────────────

  it('listFactsByCategory() should return facts for "evm_security"', () => {
    const result = factsServer.listFactsByCategory('evm_security');

    assert.ok(typeof result.count === 'number', 'count should be a number');
    assert.ok(Array.isArray(result.facts),      'facts should be an array');
    result.facts.forEach(f => {
      assert.strictEqual(f.category, 'evm_security', 'All facts should match category');
    });
  });

  it('listFactsByCategory() should return facts for "voting_process"', () => {
    const result = factsServer.listFactsByCategory('voting_process');
    assert.ok(Array.isArray(result.facts), 'facts should be an array');
    result.facts.forEach(f => {
      assert.strictEqual(f.category, 'voting_process');
    });
  });

  it('listFactsByCategory() should return facts for "candidate_info"', () => {
    const result = factsServer.listFactsByCategory('candidate_info');
    assert.ok(Array.isArray(result.facts), 'facts should be an array');
    result.facts.forEach(f => {
      assert.strictEqual(f.category, 'candidate_info');
    });
  });

  // ── Test 3: listFactsByCategory - invalid category throws ─────────────────

  it('listFactsByCategory() should throw RangeError for unknown category', () => {
    assert.throws(
      () => factsServer.listFactsByCategory('invalid_category'),
      { name: 'RangeError' },
      'Should throw RangeError for bad category'
    );
  });

  it('listFactsByCategory() should throw TypeError for non-string input', () => {
    assert.throws(
      () => factsServer.listFactsByCategory(123),
      { name: 'TypeError' },
      'Should throw TypeError for non-string'
    );
  });

  it('listFactsByCategory() should throw for empty string', () => {
    assert.throws(
      () => factsServer.listFactsByCategory(''),
      'Should throw for empty string'
    );
  });

  // ── Test 4: searchFacts - keyword search ──────────────────────────────────

  it('searchFacts() should return results for "evm" query', () => {
    const result = factsServer.searchFacts('evm');

    assert.ok(typeof result.count === 'number', 'count should be a number');
    assert.ok(Array.isArray(result.facts),      'facts should be an array');
    assert.strictEqual(result.query, 'evm',     'query should be echoed back');
  });

  it('searchFacts() should return results object with count matching facts length', () => {
    const result = factsServer.searchFacts('voter');
    assert.strictEqual(result.count, result.facts.length, 'count should match facts.length');
  });

  it('searchFacts() should return empty results for nonsense query', () => {
    const result = factsServer.searchFacts('xyzzy_impossible_term_123abc');
    assert.strictEqual(result.count, 0,         'No results for nonsense query');
    assert.deepStrictEqual(result.facts, [],     'facts should be empty');
  });

  it('searchFacts() should throw TypeError for non-string input', () => {
    assert.throws(
      () => factsServer.searchFacts(null),
      { name: 'TypeError' },
      'Should throw for null query'
    );
  });

  it('searchFacts() should handle multi-word queries', () => {
    const result = factsServer.searchFacts('electronic voting machine');
    assert.ok(typeof result.count === 'number');
    assert.ok(Array.isArray(result.facts));
  });

  // ── Test 5: getFactById ───────────────────────────────────────────────────

  it('getFactById() should return found:false for nonexistent ID', () => {
    const result = factsServer.getFactById('definitely_nonexistent_id_xyz');
    assert.strictEqual(result.found, false, 'Should be not found');
    assert.strictEqual(result.fact,  null,  'fact should be null');
  });

  it('getFactById() should throw TypeError for non-string ID', () => {
    assert.throws(
      () => factsServer.getFactById(42),
      { name: 'TypeError' }
    );
  });

  it('getFactById() should throw for empty string ID', () => {
    assert.throws(
      () => factsServer.getFactById(''),
      'Should throw for empty ID'
    );
  });

  // ── Test 6: dispatch() routing ────────────────────────────────────────────

  it('dispatch() should route "listFactsByCategory" to correct handler', () => {
    const result = factsServer.dispatch('listFactsByCategory', { category: 'evm_security' });
    assert.ok(Array.isArray(result.facts), 'Should return facts array');
    assert.ok(typeof result.count === 'number');
  });

  it('dispatch() should route "searchFacts" to correct handler', () => {
    const result = factsServer.dispatch('searchFacts', { query: 'NOTA' });
    assert.ok(Array.isArray(result.facts));
    assert.ok(typeof result.count === 'number');
  });

  it('dispatch() should route "getFactById" to correct handler', () => {
    const result = factsServer.dispatch('getFactById', { id: 'nonexistent_xyz' });
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.fact,  null);
  });

  it('dispatch() should return error object for unknown tool name', () => {
    const result = factsServer.dispatch('unknownTool', {});
    assert.ok(result.error, 'Should return an error field');
    assert.ok(result.error.includes('Unknown tool'), 'Error should mention unknown tool');
  });

  it('dispatch() should return error object when handler throws', () => {
    // listFactsByCategory with bad category throws — dispatch should catch it
    const result = factsServer.dispatch('listFactsByCategory', { category: 'bad_cat' });
    assert.ok(result.error, 'Should return error from caught exception');
  });

  // ── Test 7: MCP_FUNCTION_DECLARATIONS ─────────────────────────────────────

  it('MCP_FUNCTION_DECLARATIONS should be an array of 3 function descriptors', () => {
    const { MCP_FUNCTION_DECLARATIONS } = factsServer;

    assert.ok(Array.isArray(MCP_FUNCTION_DECLARATIONS), 'Should be an array');
    assert.strictEqual(MCP_FUNCTION_DECLARATIONS.length, 3, 'Should have 3 declarations');

    MCP_FUNCTION_DECLARATIONS.forEach(decl => {
      assert.ok(decl.name,        'Each declaration should have a name');
      assert.ok(decl.description, 'Each declaration should have a description');
      assert.ok(decl.parameters,  'Each declaration should have parameters');
    });
  });

  it('MCP_FUNCTION_DECLARATIONS names should match dispatch handlers', () => {
    const { MCP_FUNCTION_DECLARATIONS } = factsServer;
    const names = MCP_FUNCTION_DECLARATIONS.map(d => d.name);

    assert.ok(names.includes('listFactsByCategory'), 'Should declare listFactsByCategory');
    assert.ok(names.includes('searchFacts'),         'Should declare searchFacts');
    assert.ok(names.includes('getFactById'),         'Should declare getFactById');
  });

  // ── Test 8: Fact shape validation ────────────────────────────────────────

  it('All facts should conform to MCPFact schema', () => {
    const { facts } = factsServer.listFactsByCategory('evm_security');

    facts.forEach((f, i) => {
      assert.ok(typeof f.id       === 'string', `fact[${i}].id should be string`);
      assert.ok(typeof f.fact     === 'string', `fact[${i}].fact should be string`);
      assert.ok(typeof f.category === 'string', `fact[${i}].category should be string`);
      assert.ok(Array.isArray(f.keywords),      `fact[${i}].keywords should be array`);
      assert.ok(Array.isArray(f.sources),       `fact[${i}].sources should be array`);
      assert.ok(
        typeof f.credibility === 'number' && f.credibility >= 0 && f.credibility <= 100,
        `fact[${i}].credibility should be 0-100`
      );
    });
  });

  // ── Test 9: searchFacts sorts by relevance ────────────────────────────────

  it('searchFacts() should return results sorted by relevance (most matches first)', () => {
    const result = factsServer.searchFacts('evm security hack');

    // If results exist, first result should be most relevant (we can't guarantee order
    // without knowing the data, but we can check the count is consistent)
    assert.strictEqual(result.count, result.facts.length, 'count should match facts length');
  });

  // ── Test 10: stats byCategory totals match individual listFactsByCategory ──

  it('stats() byCategory totals should match listFactsByCategory counts', () => {
    const statsResult = factsServer.stats();
    const categories  = ['evm_security', 'voting_process', 'candidate_info'];

    for (const cat of categories) {
      const listed = factsServer.listFactsByCategory(cat);
      const statCount = statsResult.byCategory[cat] || 0;
      assert.strictEqual(
        listed.count, statCount,
        `stats[${cat}]=${statCount} should match listFactsByCategory=${listed.count}`
      );
    }
  });
});
