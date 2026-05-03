'use strict';

/**
 * @file geminiClient.js
 * @description Core module for geminiClient functionality.
 */


const { GoogleGenAI } = require('@google/genai');
const { TTLCache }    = require('./cache');

// ─── Default Safety Settings ──────────────────────────────────────────────────

const DEFAULT_SAFETY = [
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

// ─── GeminiClient ─────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * @typedef {Object} ModelOptions
 * @property {string}  model             - e.g. 'gemini-2.5-flash'
 * @property {string}  systemInstruction - System prompt text
 * @property {number}  [temperature]     - Default 0.4
 * @property {number}  [maxOutputTokens] - Default 2048
 * @property {number}  [topK]            - Default 20
 * @property {number}  [topP]            - Default 0.8
 * @property {any[]}   [tools]           - Function declarations
 */

class GeminiClient {
  constructor() {
    this._ai    = null;
    this._cache = new TTLCache();
  }

  /** @private — lazy-init the SDK using Vertex AI + ADC */
  _sdk() {
    if (this._ai) return this._ai;
    const project  = process.env.GCLOUD_PROJECT;
    const location = process.env.GCLOUD_LOCATION || 'us-central1';
    if (!project) throw new Error('[GeminiClient] GCLOUD_PROJECT is not set');
    this._ai = new GoogleGenAI({ vertexai: true, project, location });
    return this._ai;
  }

  /**
   * Returns a config object used for generate calls.
   * @param {ModelOptions} options
   */
  getModel(options) {
    const {
      model             = DEFAULT_MODEL,
      systemInstruction = '',
      temperature       = 0.4,
      maxOutputTokens   = 2048,
      topK              = 20,
      topP              = 0.8,
      tools             = [],
    } = options;

    // Return a plain config — actual calls use _sdk().models.generateContent()
    return {
      _sdk:             this._sdk.bind(this),
      model,
      config: {
        systemInstruction,
        safetySettings:   DEFAULT_SAFETY,
        temperature,
        maxOutputTokens,
        topK,
        topP,
        ...(tools.length ? { tools } : {}),
      },
    };
  }

  /**
   * Sends a single prompt and returns the raw text response.
   * @param {{ _sdk: Function, model: string, config: object }} modelHandle
   * @param {string} prompt
   * @param {string} [cacheKey]
   * @returns {Promise<string>}
   */
  async generate(modelHandle, prompt, cacheKey) {
    if (cacheKey) {
      const hit = this._cache.get(cacheKey);
      if (hit !== undefined) return hit;
    }
    const result = await modelHandle._sdk()
      .models.generateContent({ model: modelHandle.model, contents: prompt, config: modelHandle.config });
    const text = result.text;
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

  /**
   * Generates a text embedding for the given input string using text-embedding-004.
   * @param {string} text 
   * @returns {Promise<number[]>}
   */
  async embed(text) {
    const ai = this._sdk();
    const result = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: text
    });
    // For Vertex AI / GenAI SDK, embeddings[0].values contains the vector
    return result.embeddings[0].values;
  }

  /** Expose shared cache so agents can write their own entries. */
  get cache() { return this._cache; }
}

const geminiClient = new GeminiClient();
module.exports = geminiClient;
