'use strict';

// ─── Sample myth texts ────────────────────────────────────────────────────────

const MYTHS = {
  EVM_HACK:        'EVMs can be hacked remotely using Bluetooth',
  HINGLISH_EVM:    'EVM machines ko hack kiya ja sakta hai kya?',
  VOTER_ID:        'Is voter ID mandatory to vote?',
  HOME_VOTING:     'Can I vote from home?',
  VVPAT:           'What is VVPAT?',
  NOTA:            'What is NOTA?',
  CANDIDATE_INFO:  'Who is the candidate for my constituency?',
  EMPTY:           '',
  WHITESPACE:      '   ',
};

// ─── Canonical mock Gemini responses ─────────────────────────────────────────

const RESPONSES = {
  EVM_BUSTED: {
    isMythBusted:    true,
    explanation_hi:  'यह गलत है। EVMs standalone machines हैं, internet से connected नहीं।',
    explanation_en:  'This is false. EVMs are standalone machines, not connected to the internet.',
    truthScore:      5,
    sources:         [{ title: 'ECI VVPAT Guidelines', url: 'https://eci.gov.in/vvpat', credibility: 95 }],
    category:        'evm_security',
  },

  VOTER_ID_TRUE: {
    isMythBusted:    false,
    explanation_hi:  'हाँ, voting के लिए valid ID ज़रूरी है।',
    explanation_en:  'Yes, a valid government-issued photo ID is required to vote.',
    truthScore:      95,
    sources:         [{ title: 'ECI Voter Guidelines', url: 'https://eci.gov.in', credibility: 99 }],
    category:        'voting_process',
  },

  VOTING_PROCESS: {
    isMythBusted:    true,
    explanation_hi:  'EVM से voting बहुत simple है। VVPAT से verify होती है।',
    explanation_en:  'Voting via EVM is simple. VVPAT provides a verifiable paper trail.',
    truthScore:      10,
    sources:         [{ title: 'ECI EVM Guide', url: 'https://eci.gov.in/evm', credibility: 99 }],
    category:        'voting_process',
  },

  CANDIDATE_INFO: {
    isMythBusted:    false,
    explanation_hi:  'Candidate की जानकारी ECI affidavit portal पर मिलती है।',
    explanation_en:  'Candidate info is available on the ECI affidavit portal.',
    truthScore:      90,
    sources:         [{ title: 'ECI Affidavit Portal', url: 'https://affidavit.eci.gov.in', credibility: 99 }],
    category:        'candidate_info',
  },

  PARTIAL: {
    // Missing explanation_hi — should fail _parseResponse validation
    isMythBusted: true,
    truthScore:   50,
  },
};

// ─── Mock Firestore truth table entries ───────────────────────────────────────

const TRUTH_TABLE = {
  CACHED_EVM: {
    myth_id:           'ZXZtcyBjYW4gYmUgaGFja2VkI',
    fact_check_result: RESPONSES.EVM_BUSTED,
    verified_by:       'gemini-1.5-flash',
  },
};

// ─── Model factory helpers ────────────────────────────────────────────────────

/**
 * Creates a mock Gemini model that returns a single JSON response (no tool calls).
 * @param {object} jsonResponse  - The parsed response object to return as JSON.
 * @returns {object}             - Mock model compatible with MythAgent._model API.
 */
function createMockModel(jsonResponse) {
  const mockResponse = {
    functionCalls: () => null,
    text:          () => JSON.stringify(jsonResponse),
    candidates:    [{ finishReason: 'STOP' }],
  };
  return {
    startChat: () => ({
      sendMessage: async () => ({ response: mockResponse }),
    }),
  };
}

/**
 * Creates a mock model that returns SAFETY as finish reason.
 * @returns {object}
 */
function createSafetyBlockModel() {
  const mockResponse = {
    functionCalls: () => null,
    text:          () => '',
    candidates:    [{ finishReason: 'SAFETY' }],
  };
  return {
    startChat: () => ({
      sendMessage: async () => ({ response: mockResponse }),
    }),
  };
}

/**
 * Creates a mock model that throws on the first N calls, then succeeds.
 * @param {number} failCount  - How many times to throw before succeeding.
 * @param {string} errorMsg   - Error message (include '429' to trigger rate-limit path).
 * @param {object} successResponse - Final success payload.
 * @returns {{ model: object, callLog: string[] }}
 */
function createRetryModel(failCount, errorMsg, successResponse) {
  const callLog = [];
  let   calls   = 0;
  const model   = {
    startChat: () => ({
      sendMessage: async () => {
        calls++;
        callLog.push(`call-${calls}`);
        if (calls <= failCount) throw new Error(errorMsg);
        return {
          response: {
            functionCalls: () => null,
            text:          () => JSON.stringify(successResponse),
            candidates:    [{ finishReason: 'STOP' }],
          },
        };
      },
    }),
  };
  return { model, callLog };
}

/**
 * Creates a mock model that first requests a tool call, then returns a normal response.
 * @param {string} toolName       - Tool name Gemini "calls" (e.g. 'searchLocalFacts').
 * @param {object} toolArgs       - Arguments for the tool call.
 * @param {object} finalResponse  - Final JSON response after tool result is sent.
 * @returns {object}
 */
function createToolCallingModel(toolName, toolArgs, finalResponse) {
  let turn = 0;
  return {
    startChat: () => ({
      sendMessage: async () => {
        turn++;
        if (turn === 1) {
          // First turn: request a tool call
          return {
            response: {
              functionCalls: () => [{ name: toolName, args: toolArgs }],
              text:          () => '',
              candidates:    [{ finishReason: 'STOP' }],
            },
          };
        }
        // Second turn: return final answer
        return {
          response: {
            functionCalls: () => null,
            text:          () => JSON.stringify(finalResponse),
            candidates:    [{ finishReason: 'STOP' }],
          },
        };
      },
    }),
  };
}

module.exports = {
  MYTHS,
  RESPONSES,
  TRUTH_TABLE,
  createMockModel,
  createSafetyBlockModel,
  createRetryModel,
  createToolCallingModel,
};
