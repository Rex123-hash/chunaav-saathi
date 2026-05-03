'use strict';

const express           = require('express');
const router            = express.Router();
const MythAgent         = require('../agents/MythAgent');
const VoterJourneyAgent = require('../agents/VoterJourneyAgent');
const ExplainerAgent    = require('../agents/ExplainerAgent');
const firestoreService  = require('../services/firestore');
const {
  aiLimiter,
  externalApiLimiter,
}                       = require('../middleware/security');

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
router.post('/v1/myth-check', aiLimiter, async (req, res) => {
  const { text, lang = 'hinglish' } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return sendError(res, 400, 'Missing or invalid "text" field in request body');
  }
  if (text.trim().length > 2000) {
    return sendError(res, 400, '"text" must be 2000 characters or fewer');
  }
  if (!VALID_LANGS.has(lang)) {
    return sendError(res, 400, 'Invalid "lang". Must be "hi", "en", or "hinglish"');
  }

  try {
    const result = await MythAgent.checkMyth(text.trim(), lang);
    return res.json(result);
  } catch (err) {
    console.error('[myth-check] Error:', err.message);
    if (isFirestoreError(err)) {
      return sendError(res, 503, 'Firestore service temporarily unavailable. Retry after 30s.');
    }
    // Return a structured MythAgentResponse fallback so clients always get a consistent shape
    return res.status(503).json({
      isMythBusted:   false,
      explanation_hi: 'अभी fact-check उपलब्ध नहीं है। कृपया कुछ देर बाद दोबारा try करें।',
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
router.post('/v1/explain', aiLimiter, async (req, res) => {
  const { topic, complexity, lang = 'hinglish' } = req.body || {};

  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    return sendError(res, 400, 'Missing or invalid "topic" field');
  }
  if (topic.trim().length > 500) {
    return sendError(res, 400, '"topic" must be 500 characters or fewer');
  }
  if (!VALID_LANGS.has(lang)) {
    return sendError(res, 400, 'Invalid "lang". Must be "hi", "en", or "hinglish"');
  }

  // Clamp complexity (1-5) — test contract requires clamping, not rejection
  const level = Math.min(5, Math.max(1, Math.round(Number(complexity) || 2)));

  try {
    const result = await ExplainerAgent.explain(topic.trim(), lang, level);
    return res.json(result);
  } catch (err) {
    console.error('[explain] Error:', err.message);
    return sendError(res, 500, 'Failed to generate explanation. Please try again.');
  }
});

// ─── POST /v1/explain/batch ───────────────────────────────────────────────────

/**
 * Batch-explains up to 5 topics in parallel.
 *
 * Body:    { topics: string[], complexity?: 1-5, lang?: 'hi'|'en'|'hinglish' }
 * Returns: ExplanationResult[]
 */
router.post('/v1/explain/batch', aiLimiter, async (req, res) => {
  const { topics, complexity, lang = 'hinglish' } = req.body || {};

  if (!Array.isArray(topics) || topics.length === 0) {
    return sendError(res, 400, '"topics" must be a non-empty array');
  }
  if (topics.length > 5) {
    return sendError(res, 400, '"topics" array cannot exceed 5 items per batch request');
  }
  if (topics.some(t => typeof t !== 'string' || !t.trim())) {
    return sendError(res, 400, 'All items in "topics" must be non-empty strings');
  }
  if (!VALID_LANGS.has(lang)) {
    return sendError(res, 400, 'Invalid "lang". Must be "hi", "en", or "hinglish"');
  }

  const level = Math.min(5, Math.max(1, Math.round(Number(complexity) || 2)));

  try {
    const results = await ExplainerAgent.explainBatch(topics, lang, level);
    return res.json({ results, count: results.length });
  } catch (err) {
    console.error('[explain/batch] Error:', err.message);
    return sendError(res, 500, 'Failed to process batch explanation. Please try again.');
  }
});

// ─── GET /v1/voter-journey/:userId ───────────────────────────────────────────

/**
 * Returns the voter's journey state. Creates a default journey on first visit.
 *
 * Params: userId (min 3 chars, alphanumeric + dash/underscore)
 */
router.get('/v1/voter-journey/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId || !/^[\w-]{3,64}$/.test(userId)) {
    return sendError(res, 400, 'Invalid userId — must be 3-64 alphanumeric/dash/underscore characters');
  }

  try {
    const journey = await firestoreService.getVoterJourney(userId);
    if (!journey) return sendError(res, 503, 'Firestore service temporarily unavailable');
    return res.json(journey);
  } catch (err) {
    console.error('[voter-journey GET] Error:', err.message);
    if (isFirestoreError(err)) return sendError(res, 503, 'Firestore service temporarily unavailable');
    return sendError(res, 500, 'Failed to retrieve voter journey');
  }
});

// ─── PUT /v1/voter-journey/:userId ───────────────────────────────────────────

/**
 * Merges updates into an existing voter journey.
 *
 * Body: { stage?: number (1-5), completed_modules?: string[] }
 */
router.put('/v1/voter-journey/:userId', async (req, res) => {
  const { userId }                    = req.params;
  const { stage, completed_modules }  = req.body || {};

  if (!userId || !/^[\w-]{3,64}$/.test(userId)) {
    return sendError(res, 400, 'Invalid userId — must be 3-64 alphanumeric/dash/underscore characters');
  }

  if (stage !== undefined) {
    const n = Number(stage);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return sendError(res, 400, '"stage" must be an integer between 1 and 5');
    }
  }
  if (completed_modules !== undefined && !Array.isArray(completed_modules)) {
    return sendError(res, 400, '"completed_modules" must be an array');
  }
  if (Array.isArray(completed_modules)) {
    const invalid = completed_modules.filter(m => !VALID_MODULES.has(m));
    if (invalid.length > 0) {
      return sendError(res, 400, `Unknown module(s): ${invalid.join(', ')}. Valid: ${[...VALID_MODULES].join(', ')}`);
    }
  }

  try {
    const updated = await firestoreService.updateVoterJourney(userId, req.body);
    return res.json(updated);
  } catch (err) {
    console.error('[voter-journey PUT] Error:', err.message);
    if (isFirestoreError(err)) return sendError(res, 503, 'Firestore service temporarily unavailable');
    return sendError(res, 500, 'Failed to update voter journey');
  }
});

// ─── POST /v1/voter-journey/:userId/complete ─────────────────────────────────

/**
 * Marks a module as completed.
 *
 * Body: { moduleId: string }
 */
router.post('/v1/voter-journey/:userId/complete', async (req, res) => {
  const { userId }   = req.params;
  const { moduleId } = req.body || {};

  if (!userId || !/^[\w-]{3,64}$/.test(userId)) {
    return sendError(res, 400, 'Invalid userId');
  }
  if (!moduleId || typeof moduleId !== 'string') {
    return sendError(res, 400, 'Missing or invalid "moduleId" in request body');
  }
  if (!VALID_MODULES.has(moduleId)) {
    return sendError(res, 400, `Unknown moduleId "${moduleId}". Valid: ${[...VALID_MODULES].join(', ')}`);
  }

  try {
    const updated = await VoterJourneyAgent.completeModule(userId, moduleId);
    return res.json(updated);
  } catch (err) {
    console.error('[complete-module] Error:', err.message);
    if (isFirestoreError(err)) return sendError(res, 503, 'Firestore service temporarily unavailable');
    return sendError(res, 500, 'Failed to complete module');
  }
});

// ─── POST /v1/voter-journey/:userId/next-module ───────────────────────────────

/**
 * Returns AI-personalised next module suggestion.
 */
router.post('/v1/voter-journey/:userId/next-module', aiLimiter, async (req, res) => {
  const { userId } = req.params;

  if (!userId || !/^[\w-]{3,64}$/.test(userId)) {
    return sendError(res, 400, 'Invalid userId');
  }

  try {
    const next = await VoterJourneyAgent.getNextModule(userId);
    if (!next) return res.json({ message: 'All modules completed! Journey complete.', done: true });
    return res.json(next);
  } catch (err) {
    console.error('[next-module] Error:', err.message);
    return sendError(res, 500, 'Failed to get next module');
  }
});

// ─── GET /v1/facts ────────────────────────────────────────────────────────────

/**
 * Returns curated local election facts.
 *
 * Query: ?category=evm_security|voting_process|candidate_info&search=keyword
 */
router.get('/v1/facts', externalApiLimiter, (req, res) => {
  const { category, search } = req.query;
  const factsServer          = require('../mcp/factsServer');

  if (category && !VALID_CATEGORIES.has(category)) {
    return sendError(res, 400, `Invalid category "${category}". Valid: ${[...VALID_CATEGORIES].join(', ')}`);
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
    return sendError(res, 500, 'Failed to retrieve facts');
  }
});

// ─── GET /v1/myths ────────────────────────────────────────────────────────────

/**
 * Returns verified myths from Firestore.
 *
 * Query: ?category=...&limit=50 (max 100)
 */
router.get('/v1/myths', externalApiLimiter, async (req, res) => {
  const { category } = req.query;
  const limit        = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

  if (category && !VALID_CATEGORIES.has(category)) {
    return sendError(res, 400, `Invalid category "${category}"`);
  }

  try {
    const myths = await firestoreService.getAllMyths(category || null, limit);
    return res.json({ myths, count: myths.length });
  } catch (err) {
    console.error('[myths] Error:', err.message);
    if (isFirestoreError(err)) return sendError(res, 503, 'Firestore service temporarily unavailable');
    return sendError(res, 500, 'Failed to retrieve myths');
  }
});

// ─── GET /v1/explainer/capabilities ──────────────────────────────────────────

/**
 * Returns what the ExplainerAgent supports (topics, languages, complexity range).
 * Cheap metadata endpoint — no AI cost.
 */
router.get('/v1/explainer/capabilities', (req, res) => {
  try {
    return res.json(ExplainerAgent.getCapabilities());
  } catch (err) {
    console.error('[capabilities] Error:', err.message);
    return sendError(res, 500, 'Failed to retrieve capabilities');
  }
});

module.exports = router;
