'use strict';

const geminiClient = require('../utils/geminiClient');

// ─── Supported Topics ─────────────────────────────────────────────────────────

/**
 * @typedef {'hi'|'en'|'hinglish'} LangPref
 *
 * @typedef {Object} ExplanationResult
 * @property {string}   topic
 * @property {string}   explanation        - Primary explanation in requested language
 * @property {string}   explanation_other  - Explanation in the other language (bonus)
 * @property {string[]} key_points         - 3–5 bullet points
 * @property {string}   analogy            - Real-world analogy for the concept
 * @property {number}   complexity_used    - 1–5 complexity level applied
 */

// ─── System Instruction Builder ───────────────────────────────────────────────

/**
 * Builds a language-aware system instruction for the model.
 * @param {LangPref} langPref
 * @param {number}   complexity - 1 (ELI5) to 5 (expert)
 * @returns {string}
 */
function buildSystemInstruction(langPref, complexity) {
  const complexityGuides = {
    1: 'Use the simplest words possible, as if explaining to a 5-year-old. Short sentences, fun analogies.',
    2: 'Explain like talking to a curious teenager. Simple vocabulary, relatable examples.',
    3: 'Clear explanation for an educated adult. Avoid jargon unless you define it.',
    4: 'Detailed explanation for someone studying civics. Technical terms are fine.',
    5: 'Expert-level explanation with full legal/technical precision.',
  };

  const langGuides = {
    hi:      'Respond primarily in Hindi (Devanagari). Use English terms only when no Hindi equivalent exists.',
    en:      'Respond primarily in English. Keep it accessible.',
    hinglish:'Respond in natural Hinglish — mix Hindi and English as educated urban Indians speak. Devanagari for Hindi words.',
  };

  return [
    'आप एक Election Education Expert हैं who makes Indian civic processes crystal clear.',
    langGuides[langPref] || langGuides['hinglish'],
    complexityGuides[complexity] || complexityGuides[3],
    'Always use relatable everyday analogies.',
    'Output must be valid JSON matching the requested schema exactly.',
  ].join(' ');
}

// ─── Known Topics (for cache key normalisation) ───────────────────────────────

const KNOWN_TOPICS = new Set([
  'evm', 'vvpat', 'nota', 'voter_id', 'form6', 'form7', 'form8',
  'model_code_of_conduct', 'election_commission', 'lok_sabha',
  'rajya_sabha', 'vidhan_sabha', 'counting_process', 'postal_ballot',
  'booth_capturing', 'electorat_roll', 'nvsp', 'affidavit',
]);

/**
 * Normalises topic string to a stable cache key.
 * @param {string} topic
 * @returns {string}
 */
function normaliseTopic(topic) {
  return topic.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60);
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * @param {string}   topic
 * @param {LangPref} langPref
 * @param {number}   complexity
 * @returns {string}
 */
function buildPrompt(topic, langPref, complexity) {
  const otherLang = langPref === 'en' ? 'Hindi' : 'English';
  return [
    `Explain this Indian election/civic topic at complexity level ${complexity}/5: "${topic}"`,
    '',
    'Return a JSON object with this exact schema:',
    '{',
    '  "topic": string,',
    `  "explanation": "${langPref === 'en' ? 'English' : langPref === 'hi' ? 'Hindi' : 'Hinglish'} explanation (2-4 sentences based on complexity)",`,
    `  "explanation_other": "${otherLang} version of the explanation",`,
    '  "key_points": ["point1", "point2", "point3"],   // 3-5 items',
    '  "analogy": "A relatable real-world analogy (e.g. compare to cricket, train system, etc.)",',
    `  "complexity_used": ${complexity}`,
    '}',
  ].join('\n');
}

// ─── ExplainerAgent ───────────────────────────────────────────────────────────

class ExplainerAgent {
  constructor() {
    /** @type {Map<string, import('@google-cloud/generative-ai').GenerativeModel>} */
    this._models = new Map(); // keyed by "langPref:complexity"
  }

  /**
   * Returns (or lazily creates) a model for the given lang+complexity combo.
   * @private
   * @param {LangPref} langPref
   * @param {number}   complexity
   */
  _getModel(langPref, complexity) {
    const key = `${langPref}:${complexity}`;
    if (this._models.has(key)) return this._models.get(key);
    const model = geminiClient.getModel({
      model:             'gemini-2.0-flash-lite',
      systemInstruction: buildSystemInstruction(langPref, complexity),
      temperature:       0.4,
      maxOutputTokens:   2048,
      topK:              20,
      topP:              0.85,
    });
    this._models.set(key, model);
    return model;
  }

  // ── Core Method ─────────────────────────────────────────────────────────────

  /**
   * Explains an election/civic topic at the requested complexity and language.
   *
   * @param {string}   topic         - e.g. 'EVM', 'NOTA', 'Model Code of Conduct'
   * @param {LangPref} [langPref='hinglish']
   * @param {number}   [complexity=2] - 1 (ELI5) to 5 (expert)
   * @returns {Promise<ExplanationResult>}
   */
  async explain(topic, langPref = 'hinglish', complexity = 2) {
    if (!topic?.trim()) throw new Error('[ExplainerAgent] topic is required');

    // Clamp complexity
    const level = Math.min(5, Math.max(1, Math.round(complexity)));
    const lang  = ['hi', 'en', 'hinglish'].includes(langPref) ? langPref : 'hinglish';
    const key   = normaliseTopic(topic);
    const cacheKey = `explain:${key}:${lang}:${level}`;

    // Cache hit
    const cached = geminiClient.cache.get(cacheKey);
    if (cached) return cached;

    const model  = this._getModel(lang, level);
    const prompt = buildPrompt(topic, lang, level);

    try {
      const text   = await geminiClient.generate(model, prompt);
      const parsed = geminiClient.parseJSON(text);

      if (
        !parsed              ||
        typeof parsed.explanation !== 'string' ||
        !Array.isArray(parsed.key_points)
      ) throw new Error(`Invalid JSON response: ${text.slice(0, 120)}`);

      /** @type {ExplanationResult} */
      const result = {
        topic:             parsed.topic            || topic,
        explanation:       parsed.explanation      || '',
        explanation_other: parsed.explanation_other|| '',
        key_points:        (parsed.key_points || []).slice(0, 5),
        analogy:           parsed.analogy          || '',
        complexity_used:   level,
      };

      geminiClient.cache.set(cacheKey, result);
      return result;

    } catch (err) {
      console.error('[ExplainerAgent] explain() error:', err.message);
      // Graceful fallback
      return {
        topic,
        explanation:       `Sorry, "${topic}" के बारे में explanation अभी unavailable है। Please try again.`,
        explanation_other: `Explanation for "${topic}" is currently unavailable. Please try again.`,
        key_points:        [],
        analogy:           '',
        complexity_used:   level,
      };
    }
  }

  // ── Batch Explain ───────────────────────────────────────────────────────────

  /**
   * Explains multiple topics in parallel (max 5 at a time).
   * @param {string[]}  topics
   * @param {LangPref}  [langPref='hinglish']
   * @param {number}    [complexity=2]
   * @returns {Promise<ExplanationResult[]>}
   */
  async explainBatch(topics, langPref = 'hinglish', complexity = 2) {
    if (!Array.isArray(topics) || !topics.length) return [];
    const batch = topics.slice(0, 5); // Guard against large batches
    return Promise.all(batch.map(t => this.explain(t, langPref, complexity)));
  }

  /** @returns {{ supportedTopics: string[], langOptions: string[], complexityRange: string }} */
  getCapabilities() {
    return {
      supportedTopics:  [...KNOWN_TOPICS],
      langOptions:      ['hi', 'en', 'hinglish'],
      complexityRange:  '1 (ELI5) to 5 (Expert)',
    };
  }
}

const explainerAgent = new ExplainerAgent();
module.exports = explainerAgent;
