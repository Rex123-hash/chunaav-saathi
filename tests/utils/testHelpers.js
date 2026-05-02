'use strict';

const http = require('http');

// ── Port & Base URL ───────────────────────────────────────────────────────────

const TEST_PORT = 3001;
const BASE_URL  = `http://localhost:${TEST_PORT}`;

// ── Server lifecycle ──────────────────────────────────────────────────────────

/**
 * Starts the Express app on TEST_PORT.
 * @returns {Promise<http.Server>}
 */
async function startServer() {
  process.env.PORT                 = String(TEST_PORT);
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
  process.env.GCLOUD_PROJECT       = 'chunav-saathi-test';
  process.env.GEMINI_API_KEY       = 'test-key-not-real';

  // Purge cached module so env vars take effect if running multiple suites
  delete require.cache[require.resolve('../../src/index')];

  const app    = require('../../src/index');
  const server = app.listen(TEST_PORT);

  // Wait for server to be listening
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error',     reject);
  });
  return server;
}

/**
 * Closes the server and waits for completion.
 * @param {http.Server} server
 * @returns {Promise<void>}
 */
function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

/**
 * Makes a fetch request to the test server.
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} path            - e.g. '/api/v1/myth-check'
 * @param {object|null} [body]     - JSON body (POST/PUT)
 * @param {Record<string,string>} [extraHeaders]
 * @returns {Promise<{status:number, body:any, headers:Headers}>}
 */
async function request(method, path, body = null, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  const opts    = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res  = await fetch(`${BASE_URL}${path}`, opts);
  let   data = null;
  const ct   = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, body: data, headers: res.headers };
}

// ── Gemini mock helpers ───────────────────────────────────────────────────────

/**
 * Builds a mock Gemini model that returns a canned JSON response.
 * Compatible with MythAgent's startChat() API.
 * @param {object} jsonPayload
 * @returns {object} mock model
 */
function createMockGeminiModel(jsonPayload) {
  const mockResponse = {
    functionCalls: () => null,
    text:          () => JSON.stringify(jsonPayload),
    candidates:    [{ finishReason: 'STOP' }],
  };
  return {
    startChat: () => ({ sendMessage: async () => ({ response: mockResponse }) }),
  };
}

/**
 * Injects a mock model into MythAgent (bypasses real Gemini SDK).
 * Call AFTER requiring MythAgent.
 * @param {object} jsonPayload
 */
function mockMythAgent(jsonPayload) {
  const agent = require('../../src/agents/MythAgent');
  agent._model = createMockGeminiModel(jsonPayload);
}

/**
 * Mocks geminiClient.generate() for agents that use it (ExplainerAgent, VoterJourneyAgent).
 * @param {any} mockTextFn - Function that returns the string Gemini would return
 * @param {{ mock: Function }} nodeTestMock - node:test mock tracker
 * @returns mock handle
 */
function mockGeminiGenerate(mockTextFn, nodeTestMock) {
  const client = require('../../src/utils/geminiClient');
  return nodeTestMock.method(client, 'generate', mockTextFn);
}

// ── Firestore seed helpers ────────────────────────────────────────────────────

/** @returns {import('../../src/services/firestore')} */
function getFirestore() {
  return require('../../src/services/firestore');
}

/**
 * Seeds a single myth document for integration tests.
 * @param {object} [overrides]
 * @returns {Promise<string>} doc ID
 */
async function seedMyth(overrides = {}) {
  const fs = getFirestore();
  return fs.createMyth({
    text_hi:     'Test myth in Hindi',
    text_en:     'Test myth in English',
    category:    'voting_process',
    truth_level: 10,
    sources:     [],
    ...overrides,
  });
}

// ── Response assertion helpers ────────────────────────────────────────────────

/**
 * Canned myth-check response for mocking.
 * @param {Partial<import('../../src/agents/MythAgent').MythAgentResponse>} overrides
 */
function makeMythResponse(overrides = {}) {
  return {
    isMythBusted:    true,
    explanation_hi:  'यह गलत है। EVMs standalone machines हैं।',
    explanation_en:  'This is false. EVMs are standalone machines.',
    truthScore:      5,
    sources:         [{ title: 'ECI', url: 'https://eci.gov.in', credibility: 99 }],
    category:        'evm_security',
    ...overrides,
  };
}

/**
 * Canned explanation response for ExplainerAgent mocks.
 * @param {Partial<object>} overrides
 */
function makeExplainResponse(overrides = {}) {
  return {
    topic:             'NOTA',
    explanation:       'NOTA means None Of The Above. It is a valid voting option introduced by the Supreme Court.',
    explanation_other: 'NOTA यानी None Of The Above। यह Supreme Court द्वारा 2013 में introduce किया गया था।',
    key_points:        ['Valid option', 'Introduced 2013', 'No winning impact'],
    analogy:           'Like a "reject all" button on a form.',
    complexity_used:   2,
    ...overrides,
  };
}

module.exports = {
  TEST_PORT,
  BASE_URL,
  startServer,
  stopServer,
  request,
  createMockGeminiModel,
  mockMythAgent,
  mockGeminiGenerate,
  getFirestore,
  seedMyth,
  makeMythResponse,
  makeExplainResponse,
};
