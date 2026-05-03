'use strict';

/**
 * @file factsServer.js
 * @description Core module for factsServer functionality.
 */


const fs   = require('fs');
const path = require('path');

// ─── Load & Normalise facts.json ──────────────────────────────────────────────

const FACTS_PATH = path.join(__dirname, '../../data/facts.json');

/**
 * Normalised MCP fact shape (flattened from rich schema).
 * @typedef {Object} MCPFact
 * @property {string} id
 * @property {string} fact      - English fact text
 * @property {string} fact_hi   - Hindi/Hinglish fact text
 * @property {string} category  - 'evm_security' | 'voting_process' | 'candidate_info'
 * @property {string} lang      - 'bilingual' | 'en' | 'hi'
 * @property {string[]} keywords
 * @property {Array<{title:string, url:string, credibility:number}>} sources
 * @property {number} credibility - 0–100
 */

/** @returns {MCPFact[]} */
function loadFacts() {
  try {
    const raw  = JSON.parse(fs.readFileSync(FACTS_PATH, 'utf8'));
    const facts = Array.isArray(raw.facts) ? raw.facts : [];
    return facts.map(f => ({
      id:          f.id          || '',
      fact:        f.fact_en     || '',
      fact_hi:     f.fact_hi     || '',
      category:    f.category    || 'voting_process',
      lang:        (f.fact_en && f.fact_hi) ? 'bilingual' : f.fact_en ? 'en' : 'hi',
      keywords:    Array.isArray(f.keywords) ? f.keywords : [],
      sources:     Array.isArray(f.sources)  ? f.sources  : [],
      credibility: typeof f.credibility === 'number' ? f.credibility : 90,
    }));
  } catch (err) {
    console.warn('[FactsServer] Could not load facts.json:', err.message);
    return [];
  }
}

// Eager load once at module initialisation (facts are static)
const FACTS = loadFacts();

// ─── Validation helpers ───────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set(['evm_security', 'voting_process', 'candidate_info']);

/**
 * @param {any} value
 * @param {string} name
 * @param {'string'|'number'} type
 */
function assertType(value, name, type) {
  if (typeof value !== type || !value.toString().trim()) {
    throw new TypeError(`[FactsServer] "${name}" must be a non-empty ${type}`);
  }
}

// ─── MCP Tool Implementations ─────────────────────────────────────────────────

/**
 * Lists all facts for a given category.
 *
 * @param {string} category - 'evm_security' | 'voting_process' | 'candidate_info'
 * @returns {{ facts: MCPFact[], count: number }}
 */
function listFactsByCategory(category) {
  assertType(category, 'category', 'string');
  const cat = category.trim().toLowerCase();
  if (!VALID_CATEGORIES.has(cat)) {
    throw new RangeError(
      `[FactsServer] Invalid category "${cat}". Valid: ${[...VALID_CATEGORIES].join(', ')}`
    );
  }
  const facts = FACTS.filter(f => f.category === cat);
  return { facts, count: facts.length };
}

/**
 * Full-text keyword search across fact text and keyword tags (case-insensitive).
 *
 * @param {string} query
 * @returns {{ facts: MCPFact[], count: number, query: string }}
 */
function searchFacts(query) {
  assertType(query, 'query', 'string');
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { facts: [], count: 0, query };

  function score(f) {
    let s = 0;
    const kwHaystack  = f.keywords.join(' ').toLowerCase();
    const enHaystack  = f.fact.toLowerCase();
    const hiHaystack  = f.fact_hi.toLowerCase();
    const catHaystack = f.category.toLowerCase();
    for (const t of terms) {
      if (kwHaystack.includes(t))  s += 3;
      if (enHaystack.includes(t))  s += 2;
      if (hiHaystack.includes(t))  s += 1;
      if (catHaystack.includes(t)) s += 1;
    }
    return s;
  }

  const scored = FACTS
    .map(f => ({ f, s: score(f) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s);

  const facts = scored.map(({ f }) => f);
  return { facts, count: facts.length, query };
}

/**
 * Fetches a single fact by its ID.
 *
 * @param {string} id
 * @returns {{ fact: MCPFact | null, found: boolean }}
 */
function getFactById(id) {
  assertType(id, 'id', 'string');
  const fact = FACTS.find(f => f.id === id.trim()) || null;
  return { fact, found: !!fact };
}

// ─── MCP Tool Descriptors (for Gemini function calling registration) ──────────

/**
 * Ready-to-use Gemini FunctionDeclaration objects.
 * Import these into MythAgent's MCP_TOOLS array.
 * @type {import('@google-cloud/generative-ai').FunctionDeclaration[]}
 */
const MCP_FUNCTION_DECLARATIONS = [
  {
    name: 'listFactsByCategory',
    description: 'Returns all curated election facts for a specific category from the local facts database.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          description: 'Category to filter by. One of: "evm_security", "voting_process", "candidate_info"',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'searchFacts',
    description: 'Keyword search across all curated election facts (English + Hindi). Returns ranked results.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Search terms in any language (e.g. "EVM hack", "bogus vote", "NOTA")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'getFactById',
    description: 'Fetches a single fact entry by its unique ID (e.g. "evm_001", "vote_002").',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'Fact document ID from the local database' },
      },
      required: ['id'],
    },
  },
];

// ─── Dispatcher (called from MythAgent._dispatchTools) ───────────────────────

/**
 * Routes a tool call by name to the correct implementation.
 * Returns a serialisable result object.
 *
 * @param {string} toolName
 * @param {Record<string, any>} args
 * @returns {object}
 */
function dispatch(toolName, args = {}) {
  try {
    if (toolName === 'listFactsByCategory') return listFactsByCategory(args.category);
    if (toolName === 'searchFacts')         return searchFacts(args.query);
    if (toolName === 'getFactById')         return getFactById(args.id);
    return { error: `Unknown tool: ${toolName}` };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Stats helper ─────────────────────────────────────────────────────────────

/** @returns {{ total: number, byCategory: Record<string, number> }} */
function stats() {
  const byCategory = {};
  for (const f of FACTS) byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  return { total: FACTS.length, byCategory };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Tool functions
  listFactsByCategory,
  searchFacts,
  getFactById,
  dispatch,
  stats,
  // Gemini integration
  MCP_FUNCTION_DECLARATIONS,
};
