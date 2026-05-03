'use strict';

/**
 * @file TTLCache.js
 * @description A simple LRU Cache with TTL.
 */

class TTLCache {
  constructor(max = 100, defaultTtlMs = 5 * 60 * 1000) {
    /** @type {Map<string, {value:any, expires:number}>} */
    this._store = new Map();
    this._max   = max;
    this._defaultTtlMs = defaultTtlMs;
  }
  
  get(key) {
    const e = this._store.get(key);
    if (!e) return null;
    if (Date.now() > e.expires) { this._store.delete(key); return null; }
    this._store.delete(key);
    this._store.set(key, e); // LRU refresh
    return e.value;
  }
  
  set(key, value, customTtlMs = null) {
    if (this._store.has(key)) this._store.delete(key);
    else if (this._store.size >= this._max)
      this._store.delete(this._store.keys().next().value);
    
    const ttl = customTtlMs !== null ? customTtlMs : this._defaultTtlMs;
    this._store.set(key, { value, expires: Date.now() + ttl });
  }
  
  delete(key) { 
    this._store.delete(key); 
  }

  clearByPrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }
}

module.exports = TTLCache;
