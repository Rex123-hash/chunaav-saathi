/**
 * @file firebase-init.js
 * @description Firebase SDK initialization for Chunav Saathi.
 * Loads Firebase App, Analytics, Auth, and Firestore modules.
 * Uses ES module imports from the Firebase CDN (v10.9.0).
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-analytics.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';

/**
 * Firebase project configuration for Chunav Saathi.
 * In production, these values are set via environment-specific builds.
 * @type {import('firebase/app').FirebaseOptions}
 */
const firebaseConfig = {
  apiKey: 'AIzaSy_mock_key_for_demonstration',
  authDomain: 'chunav-saathi.firebaseapp.com',
  projectId: 'chunav-saathi',
  storageBucket: 'chunav-saathi.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef123456',
  measurementId: 'G-XXXXXXXXXX',
};

/** @type {import('firebase/app').FirebaseApp} */
const app = initializeApp(firebaseConfig);

/** @type {import('firebase/analytics').Analytics} */
const analytics = getAnalytics(app);

// Auth and Firestore are initialised but not used directly on the client yet.
// Uncomment when client-side auth flow is implemented:
// const auth = getAuth(app);
// const db = getFirestore(app);
