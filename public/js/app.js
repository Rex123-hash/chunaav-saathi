/**
 * @file app.js
 * @description Chunav Saathi - Main Application Module
 * Handles myth-buster and explainer modal interactions, accessibility,
 * keyboard navigation, and API calls to the backend.
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────

  /**
   * @typedef {Object} AppState
   * @property {string}  currentLanguage - Active language code ('hi'|'en'|'hinglish')
   * @property {boolean} isProcessing    - Whether an API call is in flight
   * @property {Object}  complexityLabels - Human-readable labels for complexity slider
   */
  const AppState = {
    currentLanguage: 'en',
    isProcessing: false,
    complexityLabels: {
      1: '1 - Simple (ELI5)',
      2: '2 - Easy',
      3: '3 - Balanced',
      4: '4 - Detailed',
      5: '5 - Expert',
    },
  };

  // ── Initialisation ─────────────────────────────────────────────────────────

  /**
   * Bootstrap the application once the DOM is ready.
   */
  function init() {
    lucide.createIcons();
    setupEventListeners();
    setupKeyboardNavigation();
    setupAccessibility();
  }

  // ── Event Listeners ────────────────────────────────────────────────────────

  /**
   * Attach all event listeners using delegation where appropriate.
   */
  function setupEventListeners() {
    document.querySelectorAll('[data-feature]').forEach((card) => {
      card.addEventListener('click', handleFeatureClick);
      card.addEventListener('keydown', handleFeatureKeydown);
    });

    document.getElementById('closeMythBuster')?.addEventListener('click', closeMythBuster);
    document.getElementById('closeExplainer')?.addEventListener('click', closeExplainer);

    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', handleLanguageChange);
    });

    document.getElementById('mythForm')?.addEventListener('submit', handleMythSubmit);
    document.getElementById('explainerForm')?.addEventListener('submit', handleExplainerSubmit);
    document.getElementById('complexitySlider')?.addEventListener('input', handleComplexityChange);

    const mythInput = document.getElementById('mythInput');
    if (mythInput) {
      mythInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          document.getElementById('mythForm')?.dispatchEvent(
            new Event('submit', { cancelable: true, bubbles: true })
          );
        }
      });
    }

    document.addEventListener('keydown', handleEscapeKey);
    document.getElementById('mythBusterModal')?.addEventListener('click', handleBackdropClick);
    document.getElementById('explainerModal')?.addEventListener('click', handleBackdropClick);
  }

  /**
   * Enable Enter/Space activation on all role="button" elements for accessibility.
   */
  function setupKeyboardNavigation() {
    document.querySelectorAll('[role="button"]').forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    });
  }

  /**
   * Sync ARIA attributes on interactive controls.
   */
  function setupAccessibility() {
    const slider = document.getElementById('complexitySlider');
    if (slider) {
      slider.addEventListener('input', () => {
        slider.setAttribute('aria-valuenow', slider.value);
      });
    }
  }

  // ── Feature Card Handlers ──────────────────────────────────────────────────

  /**
   * Route feature card clicks to the appropriate action.
   * @param {Event} e - Click event
   */
  function handleFeatureClick(e) {
    const feature = e.currentTarget.dataset.feature;
    switch (feature) {
      case 'journey':      window.location.href = '/journey.html'; break;
      case 'myth-buster':  openMythBuster();   break;
      case 'explainer':    openExplainer();    break;
    }
  }

  /**
   * Allow keyboard users to activate feature cards with Enter or Space.
   * @param {KeyboardEvent} e - Keyboard event
   */
  function handleFeatureKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.currentTarget.click();
    }
  }

  // ── Myth Buster Modal ──────────────────────────────────────────────────────

  /** Open the Myth Buster modal and focus the first interactive element. */
  function openMythBuster() {
    document.getElementById('mythBusterModal')?.classList.remove('hidden');
    setTimeout(() => document.querySelector('.lang-btn')?.focus(), 100);
    lucide.createIcons();
  }

  /** Close the Myth Buster modal and return focus to its trigger. */
  function closeMythBuster() {
    document.getElementById('mythBusterModal')?.classList.add('hidden');
    document.querySelector('[data-feature="myth-buster"]')?.focus();
  }

  /**
   * Update active language state and button visual state.
   * @param {Event} e - Click event on a language button
   */
  function handleLanguageChange(e) {
    const lang = e.target.dataset.lang;
    if (!lang) return;
    AppState.currentLanguage = lang;

    document.querySelectorAll('.lang-btn').forEach((btn) => {
      const isActive = btn.dataset.lang === lang;
      btn.classList.toggle('bg-white/30', isActive);
      btn.classList.toggle('font-bold', isActive);
      btn.classList.toggle('bg-white/10', !isActive);
      btn.classList.toggle('font-medium', !isActive);
      btn.setAttribute('aria-pressed', isActive);
    });
  }

  /**
   * Handle myth-check form submission.
   * @param {Event} e - Submit event
   */
  async function handleMythSubmit(e) {
    e.preventDefault();
    if (AppState.isProcessing) return;

    const input = document.getElementById('mythInput');
    const text  = input?.value.trim();
    if (!text) return;

    AppState.isProcessing = true;
    try {
      await checkMyth(text);
      input.value = '';
    } catch (error) {
      handleError(error, 'myth-check');
    } finally {
      AppState.isProcessing = false;
    }
  }

  /**
   * Call the myth-check API and render the result in the chat container.
   * @param {string} mythText - Claim text to fact-check
   * @returns {Promise<void>}
   */
  async function checkMyth(mythText) {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;

    document.getElementById('chatPlaceholder')?.remove();
    appendMessage(chatContainer, 'user', sanitizeHtml(mythText));

    const loadingId = appendLoadingMessage(chatContainer);

    try {
      const response = await fetch('/api/v1/myth-check', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: mythText, lang: AppState.currentLanguage }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      document.getElementById(loadingId)?.remove();
      appendMythResult(chatContainer, data);
    } catch (error) {
      document.getElementById(loadingId)?.remove();
      appendMessage(chatContainer, 'error', `Error: ${sanitizeHtml(error.message)}`);
      throw error;
    }
  }

  /**
   * Append a chat message bubble to the container.
   * @param {HTMLElement} container - Chat scroll container
   * @param {'user'|'assistant'|'error'} type - Message origin
   * @param {string} content - Already-sanitized HTML string
   */
  function appendMessage(container, type, content) {
    const alignment = type === 'user' ? 'justify-end' : 'justify-start';
    const bgClass   = type === 'error'
      ? 'bg-red-500/30 text-red-200'
      : type === 'user'
        ? 'bg-white/20'
        : 'bg-white/10 border border-white/10';

    container.insertAdjacentHTML('beforeend', `
      <div class="flex ${alignment} mb-4">
        <div class="${bgClass} rounded-xl p-4 max-w-[85%] text-sm md:text-base">${content}</div>
      </div>
    `);
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Append a loading spinner while waiting for the API.
   * @param {HTMLElement} container - Chat scroll container
   * @returns {string} ID of the loading element (used to remove it later)
   */
  function appendLoadingMessage(container) {
    const id = 'loading-' + Date.now();
    container.insertAdjacentHTML('beforeend', `
      <div class="flex justify-start mb-4" id="${id}">
        <div class="bg-white/10 border border-white/10 rounded-xl p-3 flex items-center gap-2">
          <i data-lucide="loader" class="w-4 h-4 spin"></i>
          <span class="text-sm">Fact-checking...</span>
        </div>
      </div>
    `);
    lucide.createIcons();
    container.scrollTop = container.scrollHeight;
    return id;
  }

  /**
   * Render a structured myth-check result card in the chat.
   * @param {HTMLElement} container - Chat scroll container
   * @param {Object} data - MythAgentResponse from the API
   * @param {boolean} data.isMythBusted
   * @param {string}  data.explanation_hi
   * @param {string}  data.explanation_en
   * @param {number}  data.truthScore
   * @param {Array}   data.sources
   */
  function appendMythResult(container, data) {
    const explanation = AppState.currentLanguage === 'hi'
      ? data.explanation_hi
      : data.explanation_en;

    const score      = Number(data.truthScore ?? 0);
    const scoreClass = score >= 70 ? 'progress-high' : score >= 30 ? 'progress-med' : 'progress-low';
    const verdictClass = data.isMythBusted ? 'text-red-300' : 'text-green-300';
    const verdictText  = data.isMythBusted ? '❌ MYTH (False/Misleading)' : '✅ VERIFIED (True)';

    const sourcesHtml = data.sources?.length > 0 ? `
      <details class="text-xs mt-3 text-white/60">
        <summary class="cursor-pointer font-semibold text-white/80">📚 Sources (${data.sources.length})</summary>
        <ul class="mt-2 space-y-1 pl-4">
          ${data.sources.map((s) => `
            <li>
              <a href="${sanitizeHtml(s.url)}" target="_blank" rel="noopener noreferrer"
                 class="underline hover:text-white transition">
                ${sanitizeHtml(s.title)}
              </a>
            </li>`).join('')}
        </ul>
      </details>` : '';

    container.insertAdjacentHTML('beforeend', `
      <div class="flex justify-start mb-4">
        <div class="bg-white/10 border border-white/10 rounded-xl p-5 max-w-[90%] text-sm md:text-base space-y-3">
          <p class="leading-relaxed">${sanitizeHtml(explanation)}</p>
          <div>
            <div class="flex justify-between text-xs mb-1 text-white/60">
              <span>Truth Score</span>
              <span class="font-bold text-white">${score}/100</span>
            </div>
            <div class="bg-white/20 rounded-full h-1.5 overflow-hidden">
              <div class="${scoreClass} h-full rounded-full transition-all duration-500"
                   style="width:${score}%"
                   role="progressbar"
                   aria-valuenow="${score}"
                   aria-valuemin="0"
                   aria-valuemax="100"></div>
            </div>
          </div>
          <div class="text-sm font-bold ${verdictClass}">${verdictText}</div>
          ${sourcesHtml}
        </div>
      </div>
    `);
    container.scrollTop = container.scrollHeight;
    lucide.createIcons();
  }

  // ── Explainer Modal ────────────────────────────────────────────────────────

  /** Open the Explainer modal and focus the topic selector. */
  function openExplainer() {
    document.getElementById('explainerModal')?.classList.remove('hidden');
    setTimeout(() => document.getElementById('topicSelect')?.focus(), 100);
    lucide.createIcons();
  }

  /** Close the Explainer modal and return focus to its trigger. */
  function closeExplainer() {
    document.getElementById('explainerModal')?.classList.add('hidden');
    document.querySelector('[data-feature="explainer"]')?.focus();
  }

  /**
   * Update the complexity label when the slider moves.
   * @param {Event} e - Input event from the range element
   */
  function handleComplexityChange(e) {
    const label = document.getElementById('complexityValue');
    if (label) label.textContent = AppState.complexityLabels[e.target.value] || e.target.value;
  }

  /**
   * Handle explainer form submission.
   * @param {Event} e - Submit event
   */
  async function handleExplainerSubmit(e) {
    e.preventDefault();
    if (AppState.isProcessing) return;

    const topic      = document.getElementById('topicSelect')?.value;
    const complexity = parseInt(document.getElementById('complexitySlider')?.value || '3', 10);
    if (!topic) return;

    AppState.isProcessing = true;
    try {
      await getExplanation(topic, complexity);
    } catch (error) {
      handleError(error, 'explain');
    } finally {
      AppState.isProcessing = false;
    }
  }

  /**
   * Fetch an explanation from the API and render it in the explainer container.
   * @param {string} topic      - Electoral topic (e.g. 'VVPAT')
   * @param {number} complexity - Complexity level 1–5
   * @returns {Promise<void>}
   */
  async function getExplanation(topic, complexity) {
    const container = document.getElementById('explanationContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 gap-3 text-white/50">
        <i data-lucide="loader" class="w-8 h-8 spin"></i>
        <span class="text-sm">Generating explanation...</span>
      </div>`;
    lucide.createIcons();

    try {
      const response = await fetch('/api/v1/explain', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topic, complexity, lang: 'en' }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const keyPointsHtml = data.key_points?.length > 0 ? `
        <div class="mb-4">
          <h4 class="text-xs font-semibold text-white/50 mb-2 uppercase tracking-wide">Key Points</h4>
          <ul class="space-y-1 text-sm text-white/90">
            ${data.key_points.map((p) => `<li class="flex gap-2"><span class="text-purple-400 shrink-0">▸</span>${sanitizeHtml(p)}</li>`).join('')}
          </ul>
        </div>` : '';

      const analogyHtml = data.analogy ? `
        <div class="bg-white/5 rounded-xl p-4 mt-4 border border-white/5">
          <h4 class="text-xs font-semibold text-white/50 mb-1">💡 Analogy</h4>
          <p class="text-sm text-white/90">${sanitizeHtml(data.analogy)}</p>
        </div>` : '';

      container.innerHTML = `
        <h3 class="text-lg font-bold mb-3">${sanitizeHtml(topic)}</h3>
        <p class="mb-4 text-sm md:text-base leading-relaxed text-white/90">${sanitizeHtml(data.explanation)}</p>
        ${keyPointsHtml}
        ${analogyHtml}
        <div class="text-xs text-white/40 mt-4 pt-4 border-t border-white/10">Complexity Level: ${complexity}/5</div>`;
    } catch (error) {
      container.innerHTML = `
        <div class="text-center py-8 text-red-300 text-sm">⚠️ Error: ${sanitizeHtml(error.message)}</div>`;
      throw error;
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} text - Raw user input
   * @returns {string} Escaped HTML-safe string
   */
  function sanitizeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Close open modals when the Escape key is pressed.
   * @param {KeyboardEvent} e - Keydown event
   */
  function handleEscapeKey(e) {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('mythBusterModal')?.classList.contains('hidden')) {
      closeMythBuster();
    } else if (!document.getElementById('explainerModal')?.classList.contains('hidden')) {
      closeExplainer();
    }
  }

  /**
   * Close a modal when the user clicks its backdrop overlay.
   * @param {Event} e - Click event on the modal wrapper
   */
  function handleBackdropClick(e) {
    if (e.target !== e.currentTarget) return;
    if (e.currentTarget.id === 'mythBusterModal') closeMythBuster();
    else if (e.currentTarget.id === 'explainerModal') closeExplainer();
  }

  /**
   * Structured error handler — logs to console.error in JSON format.
   * In production this would forward to a logging endpoint.
   * @param {Error}  error   - The caught error
   * @param {string} context - Descriptive label for the call site
   */
  function handleError(error, context) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      context,
      message: error.message,
      stack:   error.stack,
    }));
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
