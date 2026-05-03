'use strict';

/**
 * @file api.js
 * @description Core module for api functionality.
 */


const express           = require('express');
const router            = express.Router();
const MythAgent         = require('../agents/MythAgent');
const VoterJourneyAgent = require('../agents/VoterJourneyAgent');
const ExplainerAgent    = require('../agents/ExplainerAgent');
const firestoreService  = require('../services/firestore');
const factsServer       = require('../mcp/factsServer');
const {
  aiLimiter,
  externalApiLimiter,
}                       = require('../middleware/security');
const { ValidationError, ExternalServiceError } = require('../utils/AppError');

// ─── Validation Constants ─────────────────────────────────────────────────────

/** @type {Set<string>} */
const VALID_LANGS      = new Set(['hi', 'en', 'hinglish']);
/** @type {Set<string>} */
const VALID_MODULES    = new Set([
  'voter_registration', 'know_your_candidate', 'voting_day_process',
  'evm_and_vvpat',      'post_election_rights',
]);
/** @type {Set<string>} */
const VALID_CATEGORIES = new Set(['evm_security', 'voting_process', 'candidate_info']);

// ─── Error Classification ─────────────────────────────────────────────────────

/**
 * Returns true if the error originates from a Firestore/gRPC outage.
 * Used to return 503 instead of 500.
 * @param {Error} err
 * @returns {boolean}
 */
function isFirestoreError(err) {
  return (
    err.code === 14 ||
    err.code === 'unavailable' ||
    /firestore|grpc/i.test(err.message || '')
  );
}

/**
 * Sends a consistent, structured error response.
 * Never exposes raw stack traces.
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} message
 */
function sendError(res, status, message) {
  res.status(status).json({
    error:     message,
    timestamp: new Date().toISOString(),
  });
}

// ─── POST /v1/myth-check ─────────────────────────────────────────────────────

/**
 * Fact-checks an election myth/claim via MythAgent (Gemini-powered).
 *
 * Body:    { text: string, lang?: 'hi'|'en'|'hinglish' }
 * Returns: MythAgentResponse
 *
 * Applies strict AI rate limiting (10 req/min) to protect Gemini quota.
 */
router.post('/v1/myth-check', aiLimiter, async (req, res, next) => {
  const { text, lang = 'hinglish' } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new ValidationError('Missing or invalid "text" field in request body');
  }
  if (text.trim().length > 2000) {
    throw new ValidationError('"text" must be 2000 characters or fewer');
  }
  if (!VALID_LANGS.has(lang)) {
    throw new ValidationError('Invalid "lang". Must be "hi", "en", or "hinglish"');
  }

  try {
    const result = await MythAgent.checkMyth(text.trim(), lang);
    return res.json(result);
  } catch (err) {
    if (isFirestoreError(err)) {
      return next(new ExternalServiceError('Firestore service temporarily unavailable. Retry after 30s.'));
    }
    // Return a structured MythAgentResponse fallback so clients always get a consistent shape
    return res.status(503).json({
      isMythBusted:   false,
      explanation_hi: '??? fact-check ?????? ???? ??? ????? ??? ??? ??? ?????? try ?????',
      explanation_en: 'Fact-check is temporarily unavailable. Please try again in a moment.',
      truthScore:     0,
      sources:        [],
      category:       'voting_process',
    });
  }
});

// ─── POST /v1/explain ────────────────────────────────────────────────────────

/**
 * Explains an election topic at configurable complexity.
 *
 * Body:    { topic: string, complexity?: 1-5, lang?: 'hi'|'en'|'hinglish' }
 * Returns: ExplanationResult
 *
 * Complexity is clamped (never rejected) — consistent with test contract.
 */
router.post('/v1/explain', aiLimiter, async (req, res, next) => {
  const { topic, complexity, lang = 'hinglish' } = req.body || {};

  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    throw new ValidationError('Missing or invalid "topic" field');
  }
  if (topic.trim().length > 500) {
    throw new ValidationError('"topic" must be 500 characters or fewer');
  }
  if (!VALID_LANGS.has(lang)) {
    throw new ValidationError('Invalid "lang". Must be "hi", "en", or "hinglish"');
  }

  // Clamp complexity (1-5) — test contract requires clamping, not rejection
  const level = Math.min(5, Math.max(1, Math.round(Number(complexity) || 2)));

  try {
    const result = await ExplainerAgent.explain(topic.trim(), lang, level);
    return res.json(result);
  } catch (err) {
    console.error('[explain] Error:', err.message);
    throw new Error('Failed to generate explanation. Please try again.');
  }
});

// ─── POST /v1/explain/batch ───────────────────────────────────────────────────

/**
 * Batch-explains up to 5 topics in parallel.
 *
 * Body:    { topics: string[], complexity?: 1-5, lang?: 'hi'|'en'|'hinglish' }
 * Returns: ExplanationResult[]
 */
router.post('/v1/explain/batch', aiLimiter, async (req, res, next) => {
  const { topics, complexity, lang = 'hinglish' } = req.body || {};

  if (!Array.isArray(topics) || topics.length === 0) {
    throw new ValidationError('"topics" must be a non-empty array');
  }
  if (topics.length > 5) {
    throw new ValidationError('"topics" array cannot exceed 5 items per batch request');
  }
  if (topics.some(t => typeof t !== 'string' || !t.trim())) {
    throw new ValidationError('All items in "topics" must be non-empty strings');
  }
  if (!VALID_LANGS.has(lang)) {
    throw new ValidationError('Invalid "lang". Must be "hi", "en", or "hinglish"');
  }

  const level = Math.min(5, Math.max(1, Math.round(Number(complexity) || 2)));

  try {
    const results = await ExplainerAgent.explainBatch(topics, lang, level);
    return res.json({ results, count: results.length });
  } catch (err) {
    console.error('[explain/batch] Error:', err.message);
    throw new Error('Failed to process batch explanation. Please try again.');
  }
});

// ─── GET /v1/voter-journey/:userId ───────────────────────────────────────────

/**
 * Returns the voter's journey state. Creates a default journey on first visit.
 *
 * Params: userId (min 3 chars, alphanumeric + dash/underscore)
 */
router.get('/v1/voter-journey/:userId', async (req, res, next) => {
  const { userId } = req.params;

  if (!userId || !/^[\w-]{3,64}$/.test(userId)) {
    throw new ValidationError('Invalid userId — must be 3-64 alphanumeric/dash/underscore characters');
  }

  try {
    const journey = await firestoreService.getVoterJourney(userId);
    if (!journey) throw new ExternalServiceError('Firestore service temporarily unavailable');
    return res.json(journey);
  } catch (err) {
    console.error('[voter-journey GET] Error:', err.message);
    if (isFirestoreError(err)) throw new ExternalServiceError('Firestore service temporarily unavailable');
    throw new Error('Failed to retrieve voter journey');
  }
});

// ─── PUT /v1/voter-journey/:userId ───────────────────────────────────────────

/**
 * Merges updates into an existing voter journey.
 *
 * Body: { stage?: number (1-5), completed_modules?: string[] }
 */
router.put('/v1/voter-journey/:userId', async (req, res, next) => {
  const { userId }                    = req.params;
  const { stage, completed_modules }  = req.body || {};

  if (!userId || !/^[\w-]{3,64}$/.test(userId)) {
    throw new ValidationError('Invalid userId — must be 3-64 alphanumeric/dash/underscore characters');
  }

  if (stage !== undefined) {
    const n = Number(stage);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      throw new ValidationError('"stage" must be an integer between 1 and 5');
    }
  }
  if (completed_modules !== undefined && !Array.isArray(completed_modules)) {
    throw new ValidationError('"completed_modules" must be an array');
  }
  if (Array.isArray(completed_modules)) {
    const invalid = completed_modules.filter(m => !VALID_MODULES.has(m));
    if (invalid.length > 0) {
      throw new ValidationError(`Unknown module(s): ${invalid.join(', ')}. Valid: ${[...VALID_MODULES].join(', ')}`);
    }
  }

  try {
    const updated = await firestoreService.updateVoterJourney(userId, req.body);
    return res.json(updated);
  } catch (err) {
    console.error('[voter-journey PUT] Error:', err.message);
    if (isFirestoreError(err)) throw new ExternalServiceError('Firestore service temporarily unavailable');
    throw new Error('Failed to update voter journey');
  }
});

// ─── POST /v1/voter-journey/:userId/complete ─────────────────────────────────

/**
 * Marks a module as completed.
 *
 * Body: { moduleId: string }
 */
router.post('/v1/voter-journey/:userId/complete', async (req, res, next) => {
  const { userId }   = req.params;
  const { moduleId } = req.body || {};

  if (!userId || !/^[\w-]{3,64}$/.test(userId)) {
    throw new ValidationError('Invalid userId');
  }
  if (!moduleId || typeof moduleId !== 'string') {
    throw new ValidationError('Missing or invalid "moduleId" in request body');
  }
  if (!VALID_MODULES.has(moduleId)) {
    throw new ValidationError(`Unknown moduleId "${moduleId}". Valid: ${[...VALID_MODULES].join(', ')}`);
  }

  try {
    const updated = await VoterJourneyAgent.completeModule(userId, moduleId);
    return res.json(updated);
  } catch (err) {
    console.error('[complete-module] Error:', err.message);
    if (isFirestoreError(err)) throw new ExternalServiceError('Firestore service temporarily unavailable');
    throw new Error('Failed to complete module');
  }
});

// ─── POST /v1/voter-journey/:userId/next-module ───────────────────────────────

/**
 * Returns AI-personalised next module suggestion.
 */
router.post('/v1/voter-journey/:userId/next-module', aiLimiter, async (req, res, next) => {
  const { userId } = req.params;

  if (!userId || !/^[\w-]{3,64}$/.test(userId)) {
    throw new ValidationError('Invalid userId');
  }

  try {
    const next = await VoterJourneyAgent.getNextModule(userId);
    if (!next) return res.json({ message: 'All modules completed! Journey complete.', done: true });
    return res.json(next);
  } catch (err) {
    console.error('[next-module] Error:', err.message);
    throw new Error('Failed to get next module');
  }
});

// ─── GET /v1/facts ────────────────────────────────────────────────────────────

/**
 * Returns curated local election facts.
 *
 * Query: ?category=evm_security|voting_process|candidate_info&search=keyword
 */
router.get('/v1/facts', externalApiLimiter, (req, res, next) => {
  const { category, search } = req.query;
  const factsServer          = require('../mcp/factsServer');

  if (category && !VALID_CATEGORIES.has(category)) {
    throw new ValidationError(`Invalid category "${category}". Valid: ${[...VALID_CATEGORIES].join(', ')}`);
  }

  try {
    let result;
    if (search && typeof search === 'string' && search.trim()) {
      result = factsServer.searchFacts(search.trim());
    } else if (category) {
      result = factsServer.listFactsByCategory(category);
    } else {
      result = factsServer.stats();
    }
    return res.json(result);
  } catch (err) {
    console.error('[facts] Error:', err.message);
    throw new Error('Failed to retrieve facts');
  }
});

// ─── GET /v1/myths ────────────────────────────────────────────────────────────

/**
 * Returns verified myths from Firestore.
 *
 * Query: ?category=...&limit=50 (max 100)
 */
router.get('/v1/myths', externalApiLimiter, async (req, res, next) => {
  const { category } = req.query;
  const limit        = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

  if (category && !VALID_CATEGORIES.has(category)) {
    throw new ValidationError(`Invalid category "${category}"`);
  }

  try {
    const myths = await firestoreService.getAllMyths(category || null, limit);
    return res.json({ myths, count: myths.length });
  } catch (err) {
    console.error('[myths] Error:', err.message);
    if (isFirestoreError(err)) throw new ExternalServiceError('Firestore service temporarily unavailable');
    throw new Error('Failed to retrieve myths');
  }
});

// ─── GET /v1/explainer/capabilities ──────────────────────────────────────────

/**
 * Returns what the ExplainerAgent supports (topics, languages, complexity range).
 * Cheap metadata endpoint — no AI cost.
 */
router.get('/v1/explainer/capabilities', (req, res, next) => {
  try {
    return res.json(ExplainerAgent.getCapabilities());
  } catch (err) {
    console.error('[capabilities] Error:', err.message);
    throw new Error('Failed to retrieve capabilities');
  }
});

// ─── GET /v1/live-stats (SSE) ────────────────────────────────────────────────

/**
 * Server-Sent Events (SSE) endpoint to stream live mock election data.
 */
router.get('/v1/live-stats', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Establish the stream

  let turnout = 67.8;
  let votes = 523456789;

  const sendData = () => {
    turnout = Math.min(100, turnout + (Math.random() * 0.05));
    votes += Math.floor(Math.random() * 100);
    const data = {
      turnout: turnout.toFixed(2),
      votesCast: votes,
      activeStations: 12453,
      statesVoting: 28
    };
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendData(); // Initial payload
  const intervalId = setInterval(sendData, 3000);

  req.on('close', () => {
    clearInterval(intervalId);
    res.end();
  });
});

module.exports = router;
