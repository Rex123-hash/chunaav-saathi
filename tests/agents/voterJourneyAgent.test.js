'use strict';

/**
 * @file voterJourneyAgent.test.js
 * @description Pure unit tests for VoterJourneyAgent. No network calls.
 */

const { describe, it, mock, after } = require('node:test');
const assert = require('node:assert/strict');

const geminiClient     = require('../../src/utils/geminiClient');
const firestoreService = require('../../src/services/firestore');
const agent            = require('../../src/agents/VoterJourneyAgent');

describe('VoterJourneyAgent - Pure Unit Tests', () => {

  after(() => {
    mock.restoreAll();
  });

  // ── Test 1: getCurriculum ──────────────────────────────────────────────────
  it('getCurriculum() should return all 5 modules', () => {
    const curr = agent.getCurriculum();
    assert.ok(Array.isArray(curr.modules));
    assert.strictEqual(curr.modules.length, 5);
    assert.strictEqual(curr.modules[0].id, 'voter_registration');
  });

  // ── Test 2: startJourney ───────────────────────────────────────────────────
  it('startJourney() should require userId', async () => {
    await assert.rejects(
      async () => await agent.startJourney(null),
      { message: /userId is required/ }
    );
  });

  it('startJourney() should fetch from firestore', async () => {
    const mockJourney = { userId: '123', stage: 1, progress: 0, completed_modules: [] };
    mock.method(firestoreService, 'getVoterJourney', async () => mockJourney);
    
    const result = await agent.startJourney('123');
    assert.deepStrictEqual(result, mockJourney);
  });

  // ── Test 3: getNextModule ──────────────────────────────────────────────────
  it('getNextModule() should return gracefully without AI if model fails', async () => {
    const mockJourney = { userId: '123', stage: 1, progress: 0, completed_modules: [] };
    mock.method(firestoreService, 'getVoterJourney', async () => mockJourney);
    
    // Force geminiClient to throw
    mock.method(geminiClient, 'generate', async () => { throw new Error('API down'); });

    const result = await agent.getNextModule('123');
    assert.ok(result, 'Should return a valid fallback object');
    assert.strictEqual(result.moduleId, 'voter_registration');
    assert.strictEqual(result.why_en, 'This module is important for your civic journey.');
  });

  it('getNextModule() should return null if all modules completed', async () => {
    const mockJourney = { 
      userId: '123', 
      stage: 5, 
      progress: 100, 
      completed_modules: [
        'voter_registration', 'know_your_candidate', 'voting_day_process', 
        'evm_and_vvpat', 'post_election_rights'
      ] 
    };
    mock.method(firestoreService, 'getVoterJourney', async () => mockJourney);
    
    const result = await agent.getNextModule('123');
    assert.strictEqual(result, null);
  });

  // ── Test 4: completeModule ─────────────────────────────────────────────────
  it('completeModule() should throw on unknown module', async () => {
    await assert.rejects(
      async () => await agent.completeModule('123', 'invalid_module_id'),
      { message: /Unknown moduleId/ }
    );
  });

  it('completeModule() should update progress and stage', async () => {
    const mockJourney = { userId: '123', stage: 1, progress: 0, completed_modules: [] };
    mock.method(firestoreService, 'getVoterJourney', async () => mockJourney);
    
    mock.method(firestoreService, 'updateVoterJourney', async (userId, updates) => ({
      ...mockJourney,
      ...updates
    }));

    const result = await agent.completeModule('123', 'voter_registration');
    assert.strictEqual(result.progress, 20); // 1/5 = 20%
    assert.strictEqual(result.stage, 2);
    assert.ok(result.completed_modules.includes('voter_registration'));
  });
});
