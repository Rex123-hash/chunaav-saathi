'use strict';

/**
 * @file firestore.js
 * @description Core module for firestore functionality.
 */


const { Firestore } = require('@google-cloud/firestore');

// ─── JSDoc Types ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Myth
 * @property {string} id
 * @property {string} text_hi - Myth text in Hindi/Hinglish
 * @property {string} text_en - Myth text in English
 * @property {"voting_process"|"evm_security"|"candidate_info"} category
 * @property {number} truth_level - 0–100 (0=completely false, 100=verified true)
 * @property {Array<{title:string, url:string, credibility:number}>} sources
 * @property {FirebaseFirestore.Timestamp} created_at
 */

/**
 * @typedef {Object} VoterJourney
 * @property {string} user_id
 * @property {number} stage - Current step (1–5)
 * @property {string[]} completed_modules
 * @property {number} progress - 0–100 percentage
 * @property {{started_at: FirebaseFirestore.Timestamp, last_updated: FirebaseFirestore.Timestamp, completed_at?: FirebaseFirestore.Timestamp}} timestamps
 */

/**
 * @typedef {Object} TruthTableEntry
 * @property {string} myth_id
 * @property {{verdict:string, confidence:number, ai_model_used:string}} fact_check_result
 * @property {"gemini-2.0-flash-lite"|"manual_review"} verified_by
 * @property {FirebaseFirestore.Timestamp} last_updated
 */

// ─── LRU Cache (Map-based, max 100 items, 5-min TTL) ─────────────────────────

const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX     = 100;

class TTLCache {
  constructor(max = CACHE_MAX) {
    /** @type {Map<string, {value: any, expires: number}>} */
    this._store = new Map();
    this._max   = max;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) { this._store.delete(key); return undefined; }
    // LRU: re-insert to move to end
    this._store.delete(key);
    this._store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this._store.has(key)) this._store.delete(key); // refresh position
    else if (this._store.size >= this._max) {
      // Evict oldest (first) entry
      this._store.delete(this._store.keys().next().value);
    }
    this._store.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  }

  delete(key) { this._store.delete(key); }
  clear()     { this._store.clear(); }

  clearByPrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }
}

// ─── Collections ─────────────────────────────────────────────────────────────

const COLLECTIONS = {
  MYTHS:        'myths',
  VOTER_JOURNEY:'voter_journeys',
  TRUTH_TABLE:  'truth_table',
};

// ─── FirestoreService ─────────────────────────────────────────────────────────

class FirestoreService {
  constructor() {
    /** @type {Firestore|null} */
    this._db        = null;
    this._initPromise = null;
    this._cache     = new TTLCache();
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  /** @returns {Promise<Firestore>} */
  async _initialize() {
    if (this._db) return this._db;
    // Prevent multiple concurrent init calls
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      /** @type {ConstructorParameters<typeof Firestore>[0]} */
      const settings = { ignoreUndefinedProperties: true };

      if (process.env.FIRESTORE_EMULATOR_HOST) {
        // Local emulator — no credentials needed
        console.log(`[Firestore] Using emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
        settings.projectId = process.env.GCLOUD_PROJECT || 'chunav-saathi-dev';
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // Explicit service account key (local staging)
        console.log('[Firestore] Using GOOGLE_APPLICATION_CREDENTIALS');
        settings.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (process.env.GCLOUD_PROJECT) settings.projectId = process.env.GCLOUD_PROJECT;
      } else {
        // Cloud Run / ADC — always pass projectId if provided
        console.log('[Firestore] Using Application Default Credentials');
        if (process.env.GCLOUD_PROJECT) settings.projectId = process.env.GCLOUD_PROJECT;
      }

      this._db = new Firestore(settings);
      return this._db;
    })();

    return this._initPromise;
  }

  /** @returns {Promise<Firestore>} */
  async _client() { return this._initialize(); }

  // ── Myth Methods ────────────────────────────────────────────────────────────

  /**
   * @param {string} id
   * @returns {Promise<Myth|null>}
   */
  async getMythById(id) {
    const cached = this._cache.get(`myth:${id}`);
    if (cached) return cached;
    try {
      const db  = await this._client();
      const doc = await db.collection(COLLECTIONS.MYTHS).doc(id).get();
      if (!doc.exists) return null;
      const myth = { id: doc.id, ...doc.data() };
      this._cache.set(`myth:${id}`, myth);
      return myth;
    } catch (err) {
      console.error('[Firestore] getMythById error:', err.message);
      return null;
    }
  }

  /**
   * @param {string|null} category
   * @param {number} limit
   * @returns {Promise<Myth[]>}
   */
  async getAllMyths(category = null, limit = 50) {
    const cacheKey = `myths:${category ?? 'all'}:${limit}`;
    const cached   = this._cache.get(cacheKey);
    if (cached) return cached;
    try {
      const db = await this._client();
      let query = db.collection(COLLECTIONS.MYTHS).orderBy('created_at', 'desc').limit(limit);
      if (category) query = query.where('category', '==', category);
      const snap  = await query.get();
      const myths = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this._cache.set(cacheKey, myths);
      return myths;
    } catch (err) {
      console.error('[Firestore] getAllMyths error:', err.message);
      return [];
    }
  }

  /**
   * @param {Omit<Myth,'id'|'created_at'>} mythData
   * @returns {Promise<string>} Created document ID
   */
  async createMyth(mythData) {
    const { text_hi, text_en, category, truth_level, sources } = mythData;
    if (!text_hi || !text_en || !category || truth_level == null) {
      throw new Error('[Firestore] createMyth: missing required fields (text_hi, text_en, category, truth_level)');
    }
    const db  = await this._client();
    const ref = await db.collection(COLLECTIONS.MYTHS).add({
      text_hi, text_en, category,
      truth_level: Number(truth_level),
      sources: sources ?? [],
      created_at: Firestore.Timestamp.now(),
    });
    this._cache.clearByPrefix('myths:'); // invalidate all myth list caches
    return ref.id;
  }

  // ── Voter Journey Methods ───────────────────────────────────────────────────

  /** @param {string} userId @returns {Promise<VoterJourney>} */
  async getVoterJourney(userId) {
    try {
      const db  = await this._client();
      const doc = await db.collection(COLLECTIONS.VOTER_JOURNEY).doc(userId).get();
      if (doc.exists) return { user_id: doc.id, ...doc.data() };
      // Default new journey
      const defaults = {
        user_id:           userId,
        stage:             1,
        completed_modules: [],
        progress:          0,
        timestamps: {
          started_at:   Firestore.Timestamp.now(),
          last_updated: Firestore.Timestamp.now(),
        },
      };
      await db.collection(COLLECTIONS.VOTER_JOURNEY).doc(userId).set(defaults);
      return defaults;
    } catch (err) {
      console.error('[Firestore] getVoterJourney error:', err.message);
      return null;
    }
  }

  /** @param {string} userId @param {Partial<VoterJourney>} updates @returns {Promise<VoterJourney|null>} */
  async updateVoterJourney(userId, updates) {
    try {
      const db  = await this._client();
      const ref = db.collection(COLLECTIONS.VOTER_JOURNEY).doc(userId);
      const payload = {
        ...updates,
        'timestamps.last_updated': Firestore.Timestamp.now(),
      };
      await ref.set(payload, { merge: true });
      const updated = await ref.get();
      return { user_id: updated.id, ...updated.data() };
    } catch (err) {
      console.error('[Firestore] updateVoterJourney error:', err.message);
      throw new Error(`Failed to update voter journey for ${userId}: ${err.message}`);
    }
  }

  // ── Truth Table Methods ─────────────────────────────────────────────────────

  /** @param {string} mythId @returns {Promise<TruthTableEntry|null>} */
  async getTruthTableEntry(mythId) {
    const cached = this._cache.get(`truth:${mythId}`);
    if (cached) return cached;
    try {
      const db  = await this._client();
      const doc = await db.collection(COLLECTIONS.TRUTH_TABLE).doc(mythId).get();
      if (!doc.exists) return null;
      const entry = { ...doc.data() };
      this._cache.set(`truth:${mythId}`, entry);
      return entry;
    } catch (err) {
      console.error('[Firestore] getTruthTableEntry error:', err.message);
      return null;
    }
  }

  /** @param {string} mythId @param {Omit<TruthTableEntry,'myth_id'|'last_updated'>} result */
  async updateTruthTable(mythId, result) {
    try {
      const db = await this._client();
      await db.collection(COLLECTIONS.TRUTH_TABLE).doc(mythId).set(
        { myth_id: mythId, ...result, last_updated: Firestore.Timestamp.now() },
        { merge: true }
      );
      this._cache.delete(`truth:${mythId}`);
    } catch (err) {
      console.error('[Firestore] updateTruthTable error:', err.message);
      throw new Error(`Failed to update truth table for myth ${mythId}: ${err.message}`);
    }
  }

  // ── Utility ─────────────────────────────────────────────────────────────────

  /** @returns {Promise<{healthy: boolean, latency_ms: number}>} */
  async healthCheck() {
    const start = Date.now();
    try {
      const db = await this._client();
      await db.collection(COLLECTIONS.MYTHS).limit(1).get();
      return { healthy: true, latency_ms: Date.now() - start };
    } catch (err) {
      console.error('[Firestore] healthCheck failed:', err.message);
      return { healthy: false, latency_ms: Date.now() - start };
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
const firestoreService = new FirestoreService();
module.exports = firestoreService;
