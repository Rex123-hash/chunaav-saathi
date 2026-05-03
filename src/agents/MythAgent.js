'use strict';

const { GoogleGenAI } = require('@google/genai');
const crypto = require('node:crypto');
const path = require('path');
const fs   = require('fs');
const firestoreService = require('../services/firestore');

// ─── Local facts DB (loaded once at startup) ──────────────────────────────────

const FACTS_PATH = path.join(__dirname, '../../data/facts.json');

/** @type {{ facts: import('../../data/facts.json')['facts'], trusted_domains: import('../../data/facts.json')['trusted_domains'] }} */
let _localFacts = null;

function getLocalFacts() {
  if (!_localFacts) {
    try {
      _localFacts = JSON.parse(fs.readFileSync(FACTS_PATH, 'utf8'));
    } catch {
      _localFacts = { facts: [], trusted_domains: [] };
      console.warn('[MythAgent] Could not load data/facts.json');
    }
  }
  return _localFacts;
}

// ─── MCP Tool Definitions (Gemini Function Calling) ──────────────────────────

/** @type {import('@google-cloud/generative-ai').Tool[]} */
const MCP_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'searchTruthTable',
        description: 'Searches the Firestore truth_table for a previously fact-checked myth. Returns cached verdict if available.',
        parameters: {
          type: 'OBJECT',
          properties: {
            mythText: {
              type:        'STRING',
              description: 'The myth or claim text to search for in Hindi, English, or Hinglish',
            },
          },
          required: ['mythText'],
        },
      },
      {
        name: 'searchLocalFacts',
        description: 'Searches the local curated facts database (data/facts.json) for relevant election facts by keyword.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type:        'STRING',
              description: 'Keywords to search for (e.g. "EVM hack", "bogus voting", "NOTA")',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'verifySource',
        description: 'Validates the credibility score of a news/government URL based on trusted domain list.',
        parameters: {
          type: 'OBJECT',
          properties: {
            url: {
              type:        'STRING',
              description: 'Full URL to verify (e.g. "https://ecisveep.nic.in/evm")',
            },
          },
          required: ['url'],
        },
      },
    ],
  },
];

// ─── Safety Settings ──────────────────────────────────────────────────────────

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL_NAME      = 'gemini-2.5-flash';
const MAX_RETRIES     = 3;
const BASE_DELAY_MS   = 500;

const SYSTEM_INSTRUCTION =
  'आप एक Election Fact-Checker हैं। Your job is to bust fake news about Indian elections ' +
  'with compassion and facts. Always cite sources. Respond in simple Hinglish. ' +
  'हमेशा respectful रहें और voters को empower करें। ' +
  'Output must be valid JSON matching the specified response schema exactly.';

/** @type {import('@google-cloud/generative-ai').GenerationConfig} */
const GENERATION_CONFIG = {
  temperature:     0.3,
  maxOutputTokens: 2048,
  topK:            20,
  topP:            0.8,
};

// ─── Response Schema ──────────────────────────────────────────────────────────

/**
 * @typedef {'voting_process'|'candidate_info'|'evm_security'} MythCategory
 *
 * @typedef {Object} MythAgentResponse
 * @property {boolean}  isMythBusted
 * @property {string}   explanation_hi
 * @property {string}   explanation_en
 * @property {number}   truthScore         - 0–100
 * @property {Array<{title:string, url:string, credibility:number}>} sources
 * @property {MythCategory} category
 */

// ─── MythAgent ────────────────────────────────────────────────────────────────

class MythAgent {
  constructor() {
    this._ai = null;
  }

  // ── Internal Init ───────────────────────────────────────────────────────────

  _ensureClient() {
    if (this._ai) return;
    const project  = process.env.GCLOUD_PROJECT;
    const location = process.env.GCLOUD_LOCATION || 'us-central1';
    if (!project) throw new Error('[MythAgent] GCLOUD_PROJECT environment variable is not set');
    this._ai = new GoogleGenAI({ vertexai: true, project, location });
  }

  // ── MCP Tool Handlers ───────────────────────────────────────────────────────

  /**
   * Tool: searchTruthTable — checks Firestore cache first
   * @param {string} mythText
   * @returns {Promise<Object>}
   */
  async _tool_searchTruthTable(mythText) {
    try {
      // Naive text-to-ID hash for lookup (real impl: use embedding similarity)
      const mythId = crypto.createHash('sha256').update(mythText.trim().toLowerCase()).digest('hex').slice(0, 32);
      const entry  = await firestoreService.getTruthTableEntry(mythId);
      if (entry) return { found: true, ...entry };
      return { found: false, message: 'No cached fact-check found' };
    } catch {
      return { found: false, message: 'Truth table unavailable' };
    }
  }

  /**
   * Tool: searchLocalFacts — keyword search against facts.json
   * @param {string} query
   * @returns {Object}
   */
  _tool_searchLocalFacts(query) {
    const { facts } = getLocalFacts();
    const terms     = query.toLowerCase().split(/\s+/);
    const matches   = facts.filter(f =>
      f.keywords.some(kw => terms.some(t => kw.includes(t) || t.includes(kw)))
    );
    if (!matches.length) return { found: false, results: [] };
    return {
      found:   true,
      results: matches.map(m => ({
        category: m.category,
        fact_en:  m.fact_en,
        fact_hi:  m.fact_hi,
        sources:  m.sources,
      })),
    };
  }

  /**
   * Tool: verifySource — domain credibility lookup
   * @param {string} url
   * @returns {Object}
   */
  _tool_verifySource(url) {
    try {
      const { trusted_domains } = getLocalFacts();
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const trusted  = trusted_domains.find(d => d.domain === hostname);
      if (trusted) return { credible: true, credibility: trusted.credibility, name: trusted.name };
      return { credible: false, credibility: 0, name: 'Unknown source' };
    } catch {
      return { credible: false, credibility: 0, name: 'Invalid URL' };
    }
  }

  /**
   * Dispatch MCP tool calls returned by Gemini
   * @param {import('@google-cloud/generative-ai').FunctionCall[]} calls
   * @returns {Promise<import('@google-cloud/generative-ai').FunctionResponsePart[]>}
   */
  async _dispatchTools(calls) {
    return Promise.all(calls.map(async ({ name, args }) => {
      let response;
      if      (name === 'searchTruthTable') response = await this._tool_searchTruthTable(args.mythText);
      else if (name === 'searchLocalFacts') response = this._tool_searchLocalFacts(args.query);
      else if (name === 'verifySource')     response = this._tool_verifySource(args.url);
      else                                  response = { error: `Unknown tool: ${name}` };
      return { functionResponse: { name, response } };
    }));
  }

  // ── Exponential Backoff ─────────────────────────────────────────────────────

  /**
   * @param {number} attempt - 0-indexed attempt number
   * @returns {Promise<void>}
   */
  async _backoff(attempt) {
    const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
    await new Promise(r => setTimeout(r, delay));
  }

  // ── Parse & Validate Response ───────────────────────────────────────────────

  /**
   * Extracts and validates JSON from Gemini text output
   * @param {string} text
   * @returns {MythAgentResponse|null}
   */
  _parseResponse(text) {
    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/```$/m, '').trim();
      const parsed  = JSON.parse(cleaned);
      // Validate required fields
      if (
        typeof parsed.isMythBusted   !== 'boolean'    ||
        typeof parsed.explanation_hi !== 'string'     ||
        typeof parsed.explanation_en !== 'string'     ||
        typeof parsed.truthScore     !== 'number'     ||
        !Array.isArray(parsed.sources)                ||
        !['voting_process', 'candidate_info', 'evm_security'].includes(parsed.category)
      ) return null;
      parsed.truthScore = Math.min(100, Math.max(0, parsed.truthScore));
      return parsed;
    } catch {
      return null;
    }
  }

  // ── Safety Warning ──────────────────────────────────────────────────────────

  /** @returns {MythAgentResponse} */
  _safetyWarningResponse() {
    return {
      isMythBusted:    false,
      explanation_hi:  'यह content हमारी safety guidelines के against है। कृपया election से related सवाल पूछें।',
      explanation_en:  'This content violates our safety guidelines. Please ask election-related questions.',
      truthScore:      0,
      sources:         [],
      category:        'voting_process',
    };
  }

  // ── Core: Check Myth ────────────────────────────────────────────────────────

  /**
   * Fact-checks an election myth using Gemini 2.0 Flash Lite + MCP tools
   * @param {string} mythText - User-submitted myth in any language
   * @param {'hi'|'en'|'hinglish'} [lang='hinglish'] - Preferred response language
   * @returns {Promise<MythAgentResponse>}
   */
  async checkMyth(mythText, lang = 'hinglish') {
    if (!mythText?.trim()) throw new Error('[MythAgent] mythText is required');

    // 1. Check Firestore cache first (skip Gemini if hit)
    const cached = await this._tool_searchTruthTable(mythText);
    if (cached.found && cached.fact_check_result) {
      console.log('[MythAgent] Returning cached result from truth table');
      return cached.fact_check_result;
    }

    this._ensureClient();

    const langGuide = {
      hi:      'Respond in Hindi (Devanagari). Use English election terms only when unavoidable.',
      en:      'Respond in English.',
      hinglish:'Respond in natural Hinglish — mix Hindi and English as educated urban Indians speak.',
    }[lang] ?? 'Respond in natural Hinglish.';

    const prompt = [
      `Fact-check this election claim: "${mythText}"`,
      '',
      `Language: ${langGuide}`,
      'Use the available tools to search the truth table and local facts database.',
      'Then respond with a JSON object matching this exact schema:',
      '{',
      '  "isMythBusted": boolean,',
      '  "explanation_hi": "Hinglish explanation (2-3 sentences)",',
      '  "explanation_en": "English explanation (2-3 sentences)",',
      '  "truthScore": number (0-100),',
      '  "sources": [{"title": string, "url": string, "credibility": number}],',
      '  "category": "voting_process" | "candidate_info" | "evm_security"',
      '}',
    ].join('\n');

    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Agentic loop: handle multi-turn function calling via chat
        const chat = this._ai.chats.create({
          model:  MODEL_NAME,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools:             MCP_TOOLS,
            safetySettings:    SAFETY_SETTINGS,
            ...GENERATION_CONFIG,
          },
        });

        let result   = await chat.sendMessage({ message: prompt });
        let response = result;

        // MCP tool loop — Gemini may call tools multiple times
        while (response.functionCalls?.length) {
          const toolResults = await this._dispatchTools(response.functionCalls);
          // Send tool results back as function responses
          const parts = toolResults.map(t => ({ functionResponse: t.functionResponse }));
          result   = await chat.sendMessage({ message: parts });
          response = result;
        }

        // Check for safety blocks
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason === 'SAFETY') return this._safetyWarningResponse();

        const text   = response.text;
        const parsed = this._parseResponse(text);

        if (!parsed) throw new Error(`[MythAgent] Invalid JSON from model: ${text.slice(0, 100)}`);

        // Persist result to Firestore truth table (fire & forget)
        const mythId = crypto.createHash('sha256').update(mythText.trim().toLowerCase()).digest('hex').slice(0, 32);
        firestoreService.updateTruthTable(mythId, {
          fact_check_result: parsed,
          verified_by:       'gemini-2.0-flash-lite',
        }).catch(e => console.error('[MythAgent] Failed to cache to truth table:', e.message));

        return parsed;

      } catch (err) {
        lastError = err;
        const isRateLimit = err.message?.includes('429') || err.message?.toLowerCase().includes('quota');
        if (!isRateLimit || attempt === MAX_RETRIES - 1) break;
        console.warn(`[MythAgent] Rate limited. Retry ${attempt + 1}/${MAX_RETRIES}...`);
        await this._backoff(attempt);
      }
    }

    // All retries exhausted — return cached if available, else throw
    console.error('[MythAgent] All retries failed:', lastError?.message);
    if (cached.found && cached.fact_check_result) return cached.fact_check_result;
    throw new Error(`[MythAgent] Fact-check failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
  }

  // ── Health Check ────────────────────────────────────────────────────────────

  /** @returns {{ configured: boolean, model: string }} */
  healthCheck() {
    return {
      configured: !!process.env.GCLOUD_PROJECT,
      model:      MODEL_NAME,
    };
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
const mythAgent = new MythAgent();
module.exports = mythAgent;
