'use strict';

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// ─── Default Safety Settings ──────────────────────────────────────────────────

/** @type {import('@google-cloud/generative-ai').SafetySetting[]} */
const DEFAULT_SAFETY = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// ─── LRU Cache (shared across agents) ────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX    = 100;

class TTLCache {
  constructor(max = CACHE_MAX) {
    /** @type {Map<string, {value:any, expires:number}>} */
    this._store = new Map();
    this._max   = max;
  }
  get(key) {
    const e = this._store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) { this._store.delete(key); return undefined; }
    this._store.delete(key);
    this._store.set(key, e); // LRU refresh
    return e.value;
  }
  set(key, value) {
    if (this._store.has(key)) this._store.delete(key);
    else if (this._store.size >= this._max)
      this._store.delete(this._store.keys().next().value);
    this._store.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  }
  delete(key) { this._store.delete(key); }
}

// ─── GeminiClient ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ModelOptions
 * @property {string}  model             - e.g. 'gemini-2.0-flash-lite'
 * @property {string}  systemInstruction - System prompt
 * @property {number}  [temperature]     - Default 0.4
 * @property {number}  [maxOutputTokens] - Default 2048
 * @property {number}  [topK]            - Default 20
 * @property {number}  [topP]            - Default 0.8
 * @property {import('@google-cloud/generative-ai').Tool[]} [tools]
 */

class GeminiClient {
  constructor() {
    this._genAI  = null;
    this._cache  = new TTLCache();
  }

  /** @private */
  _sdk() {
    if (this._genAI) return this._genAI;
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('[GeminiClient] GEMINI_API_KEY is not set');
    this._genAI = new GoogleGenerativeAI(key);
    return this._genAI;
  }

  /**
   * Returns a configured GenerativeModel instance.
   * @param {ModelOptions} options
   * @returns {import('@google-cloud/generative-ai').GenerativeModel}
   */
  getModel(options) {
    const {
      model             = 'gemini-2.0-flash-lite',
      systemInstruction = '',
      temperature       = 0.4,
      maxOutputTokens   = 2048,
      topK              = 20,
      topP              = 0.8,
      tools             = [],
    } = options;

    return this._sdk().getGenerativeModel({
      model,
      systemInstruction,
      safetySettings:  DEFAULT_SAFETY,
      generationConfig: { temperature, maxOutputTokens, topK, topP },
      ...(tools.length ? { tools } : {}),
    });
  }

  /**
   * Sends a single prompt and returns the text response.
   * Uses in-memory cache keyed on cacheKey.
   * @param {import('@google-cloud/generative-ai').GenerativeModel} model
   * @param {string} prompt
   * @param {string} [cacheKey]
   * @returns {Promise<string>}
   */
  async generate(model, prompt, cacheKey) {
    if (cacheKey) {
      const hit = this._cache.get(cacheKey);
      if (hit !== undefined) return hit;
    }
    const result = await model.generateContent(prompt);
    const text   = result.response.text();
    if (cacheKey) this._cache.set(cacheKey, text);
    return text;
  }

  /**
   * Strips markdown fences and parses JSON from model output.
   * @param {string} text
   * @returns {any|null}
   */
  parseJSON(text) {
    try {
      const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/```$/m, '').trim();
      return JSON.parse(clean);
    } catch {
      return null;
    }
  }

  /** Expose shared cache so agents can write their own entries. */
  get cache() { return this._cache; }
}

const geminiClient = new GeminiClient();
module.exports = geminiClient;
