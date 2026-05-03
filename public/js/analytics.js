/**
 * @file analytics.js
 * @description Google Analytics (gtag.js) initialization for Chunav Saathi.
 * Configures the global dataLayer and sends the initial page-view event.
 * @see https://developers.google.com/tag-platform/gtagjs
 */

window.dataLayer = window.dataLayer || [];

/**
 * Push events into the Google Analytics dataLayer.
 * @param {...*} args - gtag command arguments (e.g. 'config', 'event')
 */
function gtag() { dataLayer.push(arguments); }

gtag('js', new Date());
gtag('config', 'G-XXXXXXXXXX');
