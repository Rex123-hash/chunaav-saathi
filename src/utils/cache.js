'use strict';

/**
 * @file cache.js
 * @description Shared LRU + TTL in-memory cache used by GeminiClient and FirestoreService.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX    = 100;

/**
 * Map-based LRU cache with per-entry TTL.
 * - get() returns null for missing or expired entries (never undefined)
 * - set() accepts an optional ttlMs override for entries with shorter lifetimes
 * - clearByPrefix() iterates a snapshot to avoid mid-iteration mutation issues
 */
class TTLCache {
  /**
   * @param {number} [max] - Maximum entries before LRU eviction (default 100)
   */
  constructor(max = DEFAULT_MAX) {
    /** @type {Map<string, {value:any, expires:number}>} */
    this._store = new Map();
    this._max   = max;
  }

  /**
   * @param {string} key
   * @returns {any|null} Cached value, or null if missing/expired
   */
  get(key) {
    const e = this._store.get(key);
    if (!e) return null;
    if (Date.now() > e.expires) { this._store.delete(key); return null; }
    // LRU: re-insert to move to tail (most recently used)
    this._store.delete(key);
    this._store.set(key, e);
    return e.value;
  }

  /**
   * @param {string} key
   * @param {any}    value
   * @param {number} [ttlMs] - Override TTL in ms; defaults to DEFAULT_TTL_MS (5 min)
   */
  set(key, value, ttlMs = DEFAULT_TTL_MS) {
    if (this._store.has(key)) this._store.delete(key); // refresh LRU position
    else if (this._store.size >= this._max)
      this._store.delete(this._store.keys().next().value); // evict oldest
    this._store.set(key, { value, expires: Date.now() + ttlMs });
  }

  /** @param {string} key */
  delete(key) { this._store.delete(key); }

  clear() { this._store.clear(); }

  /**
   * Deletes all entries whose key starts with the given prefix.
   * Iterates a snapshot so deletion inside the loop is safe.
   * @param {string} prefix
   */
  clearByPrefix(prefix) {
    for (const key of [...this._store.keys()]) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }
}

module.exports = { TTLCache, DEFAULT_TTL_MS, DEFAULT_MAX };
