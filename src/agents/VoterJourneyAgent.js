'use strict';

const geminiClient     = require('../utils/geminiClient');
const firestoreService = require('../services/firestore');

// ─── Journey Module Definitions ───────────────────────────────────────────────

/**
 * @typedef {Object} JourneyModule
 * @property {string}   id
 * @property {number}   step        - 1–5
 * @property {string}   title_hi
 * @property {string}   title_en
 * @property {string}   description - Brief topic summary (for Gemini context)
 */

/** @type {JourneyModule[]} */
const JOURNEY_MODULES = [
  {
    id: 'voter_registration', step: 1,
    title_hi: 'Voter Registration — क्या आप registered हैं?',
    title_en: 'Voter Registration — Are you on the electoral roll?',
    description: 'How to check voter ID, register on NVSP, and correct errors on Form 6/7/8.',
  },
  {
    id: 'know_your_candidate', step: 2,
    title_hi: 'अपने Candidate को जानें',
    title_en: 'Know Your Candidate',
    description: 'How to read ECI affidavits, criminal records, asset declarations on Voter Helpline App.',
  },
  {
    id: 'voting_day_process', step: 3,
    title_hi: 'Voting Day — क्या होता है polling booth पर?',
    title_en: 'Voting Day — What happens at the polling booth?',
    description: 'Valid IDs, VVPAT slip, indelible ink, mock poll, presiding officer duties.',
  },
  {
    id: 'evm_and_vvpat', step: 4,
    title_hi: 'EVM & VVPAT — Technology को समझें',
    title_en: 'EVM & VVPAT — Understanding the Technology',
    description: 'How EVM works, air-gap security, VVPAT paper trail, randomisation process.',
  },
  {
    id: 'post_election_rights', step: 5,
    title_hi: 'Election Results & आपके Rights',
    title_en: 'Election Results & Your Rights',
    description: 'Counting process, NOTA impact, grievance redressal, Right to Recall awareness.',
  },
];

const MODULE_MAP = Object.fromEntries(JOURNEY_MODULES.map(m => [m.id, m]));

// ─── Gemini model (lazy, via geminiClient) ────────────────────────────────────

const SYSTEM_INSTRUCTION =
  'आप एक friendly Voter Education Guide हैं। ' +
  'You motivate first-time voters in India through their civic education journey. ' +
  'Always respond in warm Hinglish. Be encouraging and concise. ' +
  'Output must be valid JSON matching the requested schema exactly.';

function getModel() {
  return geminiClient.getModel({
    model:             'gemini-2.0-flash-lite',
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature:       0.5,
    maxOutputTokens:   2048,
  });
}

// ─── VoterJourneyAgent ────────────────────────────────────────────────────────

/**
 * @typedef {Object} ModuleSuggestion
 * @property {string}   moduleId
 * @property {string}   title_hi
 * @property {string}   title_en
 * @property {string}   why_hi         - Personalised reason in Hinglish
 * @property {string}   why_en
 * @property {string[]} tips           - 2–3 quick tips for this module
 */

class VoterJourneyAgent {
  constructor() {
    this._model = null;
  }

  /** @private @returns {import('@google-cloud/generative-ai').GenerativeModel} */
  _ensureModel() {
    if (!this._model) this._model = getModel();
    return this._model;
  }

  // ── Journey Lifecycle ───────────────────────────────────────────────────────

  /**
   * Starts a new voter education journey (or fetches existing).
   * @param {string} userId
   * @returns {Promise<import('../services/firestore').VoterJourney>}
   */
  async startJourney(userId) {
    if (!userId?.trim()) throw new Error('[VoterJourneyAgent] userId is required');
    const journey = await firestoreService.getVoterJourney(userId);
    console.log(`[VoterJourneyAgent] Journey started/resumed for ${userId} at stage ${journey.stage}`);
    return journey;
  }

  /**
   * Returns the next recommended module with AI-generated personalised tips.
   * Caches response per userId + stage for 5 minutes.
   * @param {string} userId
   * @returns {Promise<ModuleSuggestion|null>}
   */
  async getNextModule(userId) {
    if (!userId?.trim()) throw new Error('[VoterJourneyAgent] userId is required');

    const journey = await firestoreService.getVoterJourney(userId);
    if (!journey) return null;

    // Find first incomplete module
    const nextModule = JOURNEY_MODULES.find(
      m => !journey.completed_modules.includes(m.id)
    );
    if (!nextModule) return null; // All done!

    const cacheKey = `journey:next:${userId}:${nextModule.id}`;
    const cached   = geminiClient.cache.get(cacheKey);
    if (cached) return cached;

    const prompt = [
      `A voter is on step ${journey.stage} of 5, progress: ${journey.progress}%.`,
      `Completed modules: ${journey.completed_modules.join(', ') || 'none yet'}.`,
      `Next module: "${nextModule.title_en}" — ${nextModule.description}`,
      '',
      'Generate a JSON object:',
      '{',
      '  "moduleId": string,',
      '  "title_hi": string,',
      '  "title_en": string,',
      '  "why_hi": "Personalised Hinglish reason why this module matters now",',
      '  "why_en": "Same in English",',
      '  "tips": ["tip1", "tip2", "tip3"]',
      '}',
    ].join('\n');

    try {
      const text   = await geminiClient.generate(this._ensureModel(), prompt);
      const parsed = geminiClient.parseJSON(text);
      if (!parsed) throw new Error('Invalid JSON');

      const result = {
        moduleId: nextModule.id,
        title_hi: nextModule.title_hi,
        title_en: nextModule.title_en,
        why_hi:   parsed.why_hi   || '',
        why_en:   parsed.why_en   || '',
        tips:     Array.isArray(parsed.tips) ? parsed.tips.slice(0, 3) : [],
      };
      geminiClient.cache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.error('[VoterJourneyAgent] getNextModule error:', err.message);
      // Graceful fallback — return module without AI tips
      return {
        moduleId: nextModule.id,
        title_hi: nextModule.title_hi,
        title_en: nextModule.title_en,
        why_hi:   'यह module आपकी civic journey के लिए important है।',
        why_en:   'This module is important for your civic journey.',
        tips:     [],
      };
    }
  }

  /**
   * Marks a module as completed and updates Firestore journey state.
   * @param {string} userId
   * @param {string} moduleId
   * @returns {Promise<import('../services/firestore').VoterJourney>}
   */
  async completeModule(userId, moduleId) {
    if (!userId?.trim())  throw new Error('[VoterJourneyAgent] userId is required');
    if (!MODULE_MAP[moduleId]) throw new Error(`[VoterJourneyAgent] Unknown moduleId: ${moduleId}`);

    const journey = await firestoreService.getVoterJourney(userId);
    if (!journey) throw new Error(`[VoterJourneyAgent] Journey not found for ${userId}`);

    if (journey.completed_modules.includes(moduleId)) return journey; // Idempotent

    const completed = [...journey.completed_modules, moduleId];
    const progress  = Math.round((completed.length / JOURNEY_MODULES.length) * 100);
    const nextStage = Math.min(5, (MODULE_MAP[moduleId]?.step ?? journey.stage) + 1);

    const updates = {
      completed_modules: completed,
      progress,
      stage: nextStage,
      ...(progress === 100 ? { 'timestamps.completed_at': 'SERVER_TIMESTAMP' } : {}),
    };

    // Invalidate next-module cache
    geminiClient.cache.delete(`journey:next:${userId}:${moduleId}`);

    const updated = await firestoreService.updateVoterJourney(userId, updates);
    console.log(`[VoterJourneyAgent] ${userId} completed "${moduleId}" — progress: ${progress}%`);
    return updated;
  }

  /** @returns {{ modules: JourneyModule[] }} */
  getCurriculum() {
    return { modules: JOURNEY_MODULES };
  }
}

const voterJourneyAgent = new VoterJourneyAgent();
module.exports = voterJourneyAgent;
