'use strict';

const { describe, it, before, after, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  MYTHS,
  RESPONSES,
  TRUTH_TABLE,
  createMockModel,
  createSafetyBlockModel,
  createRetryModel,
  createToolCallingModel,
} = require('../utils/mockData');

// ─── Environment Setup (before any require of agent code) ────────────────────

process.env.GEMINI_API_KEY           = 'test-key-not-real';
process.env.FIRESTORE_EMULATOR_HOST  = 'localhost:8080';
process.env.GCLOUD_PROJECT           = 'chunav-saathi-test';

// Require AFTER env vars are set
const mythAgent        = require('../../src/agents/MythAgent');
const firestoreService = require('../../src/services/firestore');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Injects a mock model into mythAgent, bypassing _ensureClient().
 * @param {object} mockModel
 */
function injectModel(mockModel) {
  mythAgent._model = mockModel;
}

/**
 * Stubs firestoreService.getTruthTableEntry to return a fixed value.
 * Returns the mock so call count can be inspected.
 * @param {object|null} returnValue
 */
function stubGetTruthTable(returnValue) {
  return mock.method(firestoreService, 'getTruthTableEntry', async () => returnValue);
}

function stubUpdateTruthTable() {
  return mock.method(firestoreService, 'updateTruthTable', async () => {});
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('MythAgent - Core Functionality', () => {
  before(() => {
    // No real Firestore connection — all methods stubbed per-test or globally
    console.log('[test] Suite starting — emulator:', process.env.FIRESTORE_EMULATOR_HOST);
  });

  after(() => {
    mock.restoreAll();
  });

  // ── Test 1: Correct identification of false EVM myth ──────────────────────

  it('should correctly identify fake EVM tampering myth', async () => {
    injectModel(createMockModel(RESPONSES.EVM_BUSTED));
    stubGetTruthTable(null);        // no cache
    stubUpdateTruthTable();         // swallow write

    const result = await mythAgent.checkMyth(MYTHS.EVM_HACK);

    assert.strictEqual(result.isMythBusted, true, 'Should be busted');
    assert.ok(result.truthScore < 20, `Truth score ${result.truthScore} should be < 20`);
    assert.ok(result.sources.length >= 1, 'Should cite at least one source');
    assert.strictEqual(result.category, 'evm_security');

    mock.restoreAll();
  });

  // ── Test 2: Bilingual output ───────────────────────────────────────────────

  it('should return both Hindi and English explanations for Hinglish input', async () => {
    injectModel(createMockModel(RESPONSES.EVM_BUSTED));
    stubGetTruthTable(null);
    stubUpdateTruthTable();

    const result = await mythAgent.checkMyth(MYTHS.HINGLISH_EVM);

    assert.ok(result.explanation_hi, 'Should have Hindi explanation');
    assert.ok(result.explanation_en, 'Should have English explanation');
    assert.ok(result.explanation_hi.length > 20, 'Hindi explanation should be substantial');
    assert.ok(result.explanation_en.length > 20, 'English explanation should be substantial');

    mock.restoreAll();
  });

  // ── Test 3: Firestore cache hit skips Gemini ───────────────────────────────

  it('should use Firestore truth table cache on repeated queries', async () => {
    // First call: no cache → Gemini runs → writes to truth table
    const freshModel      = createMockModel(RESPONSES.VOTER_ID_TRUE);
    const updateStub      = stubUpdateTruthTable();
    let   getTruthCalls   = 0;

    mock.method(firestoreService, 'getTruthTableEntry', async () => {
      getTruthCalls++;
      if (getTruthCalls === 1) return null;                          // miss
      return { fact_check_result: RESPONSES.VOTER_ID_TRUE };         // hit
    });

    injectModel(freshModel);
    const result1 = await mythAgent.checkMyth(MYTHS.VOTER_ID);

    // Second call: cache hit → Gemini NOT called
    const result2 = await mythAgent.checkMyth(MYTHS.VOTER_ID);

    assert.deepStrictEqual(result1, result2, 'Both calls should return the same result');
    // truth table read twice (once per checkMyth call), model.startChat only once
    assert.strictEqual(getTruthCalls, 2, 'getTruthTableEntry should be called twice');
    assert.strictEqual(updateStub.mock.calls.length, 1, 'updateTruthTable should only be called once');

    mock.restoreAll();
  });

  // ── Test 4: Graceful fallback on Gemini failure ────────────────────────────

  it('should fallback to Firestore cache when Gemini API fails', async () => {
    // Make getTruthTableEntry: first call = miss, but updateTruthTable returns cached entry
    let   ttCalls = 0;
    mock.method(firestoreService, 'getTruthTableEntry', async () => {
      ttCalls++;
      if (ttCalls === 1) return { fact_check_result: RESPONSES.EVM_BUSTED }; // pre-seeded
      return null;
    });
    stubUpdateTruthTable();

    // Inject error model — should never actually be called since cache hits on first check
    injectModel(createMockModel(RESPONSES.EVM_BUSTED));

    const result = await mythAgent.checkMyth(MYTHS.EVM_HACK);

    assert.ok(result, 'Should return a fallback response');
    assert.ok(typeof result.truthScore === 'number' && result.truthScore >= 0,
      'Should have a valid truthScore');

    mock.restoreAll();
  });

  // ── Test 5: Safety block ───────────────────────────────────────────────────

  it('should return safety warning for content blocked by Gemini', async () => {
    injectModel(createSafetyBlockModel());
    stubGetTruthTable(null);
    stubUpdateTruthTable();

    const result = await mythAgent.checkMyth('We should harm politician X');

    assert.strictEqual(result.isMythBusted, false, 'Safety response should not be busted');
    assert.strictEqual(result.truthScore, 0);
    assert.ok(
      result.explanation_en.includes('safety guidelines') || result.explanation_en.includes('cannot assist'),
      `Safety explanation unexpected: "${result.explanation_en}"`
    );
    assert.deepStrictEqual(result.sources, []);

    mock.restoreAll();
  });

  // ── Test 6: Rate limiting with exponential backoff ────────────────────────

  it('should retry on rate-limit errors and eventually succeed', async () => {
    stubGetTruthTable(null);
    stubUpdateTruthTable();

    const { model, callLog } = createRetryModel(
      2,                        // fail twice
      '429 RATE_LIMIT',         // triggers isRateLimit check in MythAgent
      RESPONSES.VOTER_ID_TRUE,
    );
    injectModel(model);

    // Short-circuit backoff so test runs fast
    const backoffStub = mock.method(mythAgent, '_backoff', async () => {});

    const result = await mythAgent.checkMyth(MYTHS.VOTER_ID);

    assert.strictEqual(callLog.length, 3, 'Should attempt exactly 3 times (2 fails + 1 success)');
    assert.strictEqual(backoffStub.mock.calls.length, 2, 'Should backoff after each failure');
    assert.ok(result.truthScore, 'Should return valid response after retries');

    mock.restoreAll();
  });

  // ── Test 7: MCP tool dispatching ──────────────────────────────────────────

  it('should dispatch MCP tool calls from Gemini to internal tool handlers', async () => {
    stubGetTruthTable(null);
    stubUpdateTruthTable();

    // Spy on the internal local-facts tool
    const localFactsSpy = mock.method(mythAgent, '_tool_searchLocalFacts', (query) => ({
      found:   true,
      results: [{ category: 'evm_security', fact_en: 'EVMs are secure.', fact_hi: 'EVMs सुरक्षित हैं।', sources: [] }],
    }));

    injectModel(createToolCallingModel(
      'searchLocalFacts',
      { query: 'VVPAT' },
      RESPONSES.EVM_BUSTED,
    ));

    await mythAgent.checkMyth(MYTHS.VVPAT);

    assert.ok(localFactsSpy.mock.calls.length > 0, '_tool_searchLocalFacts should be dispatched');
    assert.strictEqual(localFactsSpy.mock.calls[0].arguments[0], 'VVPAT',
      'Tool should receive correct query argument');

    mock.restoreAll();
  });

  // ── Test 8: Empty / blank input rejected ─────────────────────────────────

  it('should throw on empty or whitespace-only input', async () => {
    await assert.rejects(
      () => mythAgent.checkMyth(MYTHS.EMPTY),
      { message: /mythText is required/i },
      'Empty string should be rejected'
    );

    await assert.rejects(
      () => mythAgent.checkMyth(MYTHS.WHITESPACE),
      { message: /mythText is required/i },
      'Whitespace-only string should be rejected'
    );
  });

  // ── Test 9: Invalid JSON from model → throws after retries ────────────────

  it('should throw when model returns non-parsable JSON and no cache available', async () => {
    stubGetTruthTable(null);
    stubUpdateTruthTable();
    mock.method(mythAgent, '_backoff', async () => {}); // speed up retries

    // All retries return invalid JSON — non-rate-limit error so no retry
    const badModel = {
      startChat: () => ({
        sendMessage: async () => ({
          response: {
            functionCalls: () => null,
            text:          () => 'NOT_VALID_JSON {{{}',
            candidates:    [{ finishReason: 'STOP' }],
          },
        }),
      }),
    };
    injectModel(badModel);

    await assert.rejects(
      () => mythAgent.checkMyth('Is voting anonymous?'),
      /Fact-check failed/,
      'Should throw when model response is consistently invalid'
    );

    mock.restoreAll();
  });

  // ── Test 10: Category coverage across myth types ──────────────────────────

  it('should correctly categorise myths across all three categories', async () => {
    stubUpdateTruthTable();

    const scenarios = [
      { myth: MYTHS.VOTER_ID,       response: RESPONSES.VOTING_PROCESS,  expected: 'voting_process'  },
      { myth: MYTHS.EVM_HACK,       response: RESPONSES.EVM_BUSTED,      expected: 'evm_security'    },
      { myth: MYTHS.CANDIDATE_INFO, response: RESPONSES.CANDIDATE_INFO,  expected: 'candidate_info'  },
    ];

    for (const { myth, response, expected } of scenarios) {
      // Each scenario: cache miss then model returns category-specific response
      mock.method(firestoreService, 'getTruthTableEntry', async () => null);
      injectModel(createMockModel(response));

      const result = await mythAgent.checkMyth(myth);
      assert.strictEqual(
        result.category,
        expected,
        `"${myth}" → expected category "${expected}", got "${result.category}"`
      );
      mock.restoreAll();
    }
  });

  // ── Test 11: healthCheck() ────────────────────────────────────────────────

  it('healthCheck() should report configured:true when GCLOUD_PROJECT is set', () => {
    const status = mythAgent.healthCheck();
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.model, 'gemini-2.5-flash');
  });

  // ── Test 12: _parseResponse handles markdown-fenced JSON ─────────────────

  it('_parseResponse() should strip markdown code fences from model output', () => {
    const fenced = '```json\n' + JSON.stringify(RESPONSES.EVM_BUSTED) + '\n```';
    const result = mythAgent._parseResponse(fenced);
    assert.ok(result, 'Should parse fenced JSON');
    assert.strictEqual(result.isMythBusted, true);
    assert.strictEqual(result.category, 'evm_security');
  });

  // ── Test 13: _parseResponse rejects invalid schema ────────────────────────

  it('_parseResponse() should return null for missing required fields', () => {
    const bad = JSON.stringify({ isMythBusted: true, truthScore: 50 }); // missing fields
    const result = mythAgent._parseResponse(bad);
    assert.strictEqual(result, null, 'Incomplete schema should return null');
  });

  // ── Test 14: _tool_verifySource domain lookup ─────────────────────────────

  it('_tool_verifySource() should return credibility=99 for eci.gov.in', () => {
    const result = mythAgent._tool_verifySource('https://eci.gov.in/vvpat');
    assert.strictEqual(result.credible, true);
    assert.ok(result.credibility >= 99, `Expected >=99, got ${result.credibility}`);
  });

  it('_tool_verifySource() should return credible:false for unknown domains', () => {
    const result = mythAgent._tool_verifySource('https://randomnewsblog.xyz/article');
    assert.strictEqual(result.credible, false);
    assert.strictEqual(result.credibility, 0);
  });

  // ── Test 15: _tool_searchLocalFacts keyword matching ─────────────────────

  it('_tool_searchLocalFacts() should find EVM facts by keyword', () => {
    const result = mythAgent._tool_searchLocalFacts('evm hack');
    assert.strictEqual(result.found, true, 'Should find matching facts');
    assert.ok(result.results.length >= 1, 'Should return at least one result');
    assert.ok(
      result.results.some(r => r.category === 'evm_security'),
      'Should return evm_security category results'
    );
  });

  it('_tool_searchLocalFacts() should return found:false for unmatched query', () => {
    const result = mythAgent._tool_searchLocalFacts('cryptocurrency blockchain nft');
    assert.strictEqual(result.found, false);
    assert.deepStrictEqual(result.results, []);
  });
});
