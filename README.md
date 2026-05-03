<div align="center">

# 🗳️ Chunav Saathi
### India's AI-Powered Election Intelligence & Civic Education Platform

[![CI Pipeline](https://github.com/Rex123-hash/chunaav-saathi/actions/workflows/main.yml/badge.svg)](https://github.com/Rex123-hash/chunaav-saathi/actions/workflows/main.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Gemini AI](https://img.shields.io/badge/Gemini_2.5-Flash-8E75B2?logo=google&logoColor=white)](https://cloud.google.com/vertex-ai)
[![Firestore](https://img.shields.io/badge/Firestore-Database-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Vertex AI](https://img.shields.io/badge/Vertex_AI-Powered-4285F4?logo=google-cloud&logoColor=white)](https://cloud.google.com/vertex-ai)
[![Helmet](https://img.shields.io/badge/Security-Helmet.js-blueviolet)](https://helmetjs.github.io/)

*Empowering every Indian voter with AI, real-time data, and civic education.*

### 🌐 [Live Demo → https://chunav-saathi-516328774204.asia-south1.run.app](https://chunav-saathi-516328774204.asia-south1.run.app)

</div>

---

![Chunav Saathi Landing Page](docs/assets/hero.jpg)

## 📖 Table of Contents

- [Challenge Vertical](#-challenge-vertical)
- [Approach & Logic](#-approach--logic)
- [How the Solution Works](#-how-the-solution-works)
- [Assumptions](#-assumptions)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Google Services Integration](#-google-services-integration)
- [Security](#-security)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Authentication](#-authentication-google-oauth2)
- [Testing](#-testing)
- [CI/CD](#-cicd-pipeline)
- [Project Structure](#-project-structure)

---

## 🎯 Challenge Vertical

**Civic Tech / Public Service AI**

Chunav Saathi ("Election Companion") addresses a critical gap in Indian democracy: millions of voters lack access to accurate, simple, multilingual information about elections. Misinformation about EVMs, voter ID requirements, and the voting process spreads rapidly on social media, eroding public trust.

This platform acts as an always-available, AI-powered civic companion that:
- **Busts election myths** with cited, authoritative sources
- **Explains complex electoral processes** in Hindi, English, and Hinglish
- **Guides voters** through a personalized civic education journey
- **Provides real-time election data** through an interactive dashboard

---

## 🧠 Approach & Logic

### The Problem Statement
Indian democracy involves nearly a billion voters, but civic education struggles to keep pace. Voters — especially first-time voters and those in semi-urban areas — face three critical challenges:
1. **The Misinformation Epidemic** — Fabricated claims about EVM tampering, bogus voting, and election fraud spread rapidly on WhatsApp and social media, eroding public trust in democratic institutions.
2. **The Jargon Barrier** — Official Election Commission documents, legal guidelines (like the Model Code of Conduct), and electoral procedures are written in dense, bureaucratic language that is difficult for the average citizen to parse.
3. **The Language Divide** — The vast majority of high-quality civic resources and fact-checking tools are available exclusively in English, alienating millions of regional language speakers.

### How We Solved It (Our Approach)
Chunav Saathi tackles these exact problems using a **Three-Agent AI Architecture** built on Google Gemini 2.5 Flash:

| The Problem | Our Solution | How it works technically |
|:---|:---|:---|
| **Misinformation** | **MythAgent** | Uses *MCP (Model Context Protocol)* to hook Gemini directly into a curated database of verified Election Commission facts. It cross-references claims, scores credibility, and provides cited rebuttals (cached in Firestore for instant retrieval). |
| **Jargon** | **ExplainerAgent** | A dynamic AI explainer that translates complex topics (e.g. VVPAT, NOTA) into 5 adjustable complexity levels (from "Explain Like I'm 5" to "Expert"). |
| **Language** | **Multilingual AI** | Both agents automatically detect and respond in the user's preferred language, with native support for English, pure Hindi, and conversational Hinglish. |
| **Voter Apathy** | **JourneyAgent** | Creates a gamified, personalized 5-step civic education journey stored in Firestore, guiding voters from ignorance to complete civic readiness. |

### Solution Design

The platform uses a **three-agent AI architecture** built on Google Gemini 2.5 Flash via Vertex AI:

#### 1. MythAgent — Fact-Checking Engine
- Receives a claim in any language (Hindi, English, Hinglish)
- Searches a **Firestore truth table cache** first (avoids redundant AI calls)
- Uses **MCP (Model Context Protocol) tool calling** to search a curated local facts database and verify source credibility
- Returns a structured verdict: `isMythBusted`, `truthScore` (0–100), bilingual explanations, and cited sources
- Implements **exponential backoff** with up to 3 retries on rate limits
- Persists results to Firestore for future cache hits

#### 2. ExplainerAgent — Civic Education Engine
- Accepts any electoral topic (VVPAT, NOTA, Model Code of Conduct, etc.)
- Adjustable complexity from Level 1 (ELI5) to Level 5 (Expert)
- Returns bilingual explanations tailored to the user's language preference
- Supports batch processing of up to 5 topics in parallel

#### 3. VoterJourneyAgent — Personalized Learning Path
- Creates a unique 5-step civic education journey per user (stored in Firestore)
- Uses AI to recommend the next learning module based on completed steps
- Tracks progress across sessions

### Decision Logic
```
User Query → Language Detection → Cache Lookup (Firestore)
    ├── Cache HIT  → Return cached result instantly
    └── Cache MISS → Gemini 2.5 Flash (Vertex AI)
                         ├── Tool Call: searchLocalFacts
                         ├── Tool Call: verifySource
                         └── Tool Call: searchTruthTable
                     → Parse + Validate JSON response
                     → Store in Firestore cache
                     → Return to user
```

---

## ⚙️ How the Solution Works

### End-to-End Flow

1. **User opens the app** → Static HTML/CSS/JS served from `/public`
2. **User submits a myth** → `POST /api/v1/myth-check` with claim text
3. **Server checks Firestore cache** → Returns instantly if previously fact-checked
4. **On cache miss**, MythAgent calls **Gemini 2.5 Flash on Vertex AI**
5. Gemini invokes **MCP tools** (local facts DB + source verifier) before responding
6. Response is **validated** against a strict JSON schema
7. Result is **cached in Firestore** for future requests
8. **Bilingual response** (Hindi + English) returned to user with sources and truth score

### Authentication Flow (Google OAuth2)
1. User clicks "Sign in with Google" → `GET /api/v1/auth/google`
2. Redirects to Google's OAuth2 consent screen
3. Google redirects back to `/api/v1/auth/google/callback` with an auth code
4. Server exchanges code for a **verified user profile** via `google-auth-library`
5. Server issues a **signed JWT** (7-day expiry) using `jsonwebtoken`
6. All protected endpoints verify the JWT via `requireAuth` middleware

---

## 💡 Assumptions

1. **Language**: Users primarily communicate in Hindi, English, or Hinglish. The AI is instructed to respond in natural Hinglish by default.
2. **Scope**: The platform covers Indian national and state elections only. Local body elections are out of scope.
3. **Myth Categories**: Facts are pre-categorized into three buckets: `voting_process`, `evm_security`, `candidate_info`.
4. **Cache Key**: Myths are hashed with SHA-256 for Firestore lookup. Semantically similar but differently-worded myths are treated as separate entries (embedding-based similarity is a future enhancement).
5. **Authentication**: Google OAuth2 is used for identity. No passwords are stored. JWTs are stateless — logout is client-side token deletion.
6. **Firestore**: The application uses Google Cloud Firestore in Native mode. During development, the Firestore emulator can be used via `FIRESTORE_EMULATOR_HOST`.
7. **AI Availability**: The application implements graceful degradation — if Vertex AI is unavailable, it returns cached results where possible, or a structured fallback response.

---

## ✨ Features

| Feature | Description |
|:---|:---|
| **🤖 AI Myth Buster** | Debunks election misinformation in real-time using Gemini 2.5 Flash with Firestore caching |
| **🧠 AI Explainer** | Translates electoral jargon (VVPAT, NOTA, Model Code) into simple Hinglish/Hindi/English |
| **🔐 Google Login** | Full OAuth2 sign-in with JWT session management |
| **🗺️ Voter Heatmap** | Color-coded crowd density map across Indian states with booth intelligence |
| **⏰ Election Time Machine** | Interactive timeline from 1952→2024 with side-by-side comparison |
| **📊 Live Dashboard** | Real-time turnout charts, demographic splits, and hourly voting data |
| **🎮 3D EVM Simulator** | Fully interactive Electronic Voting Machine simulation |
| **🧭 Voter Journey** | AI-personalized 5-step civic education wizard tracked via Firestore |
| **📰 Verified News Feed** | ECI-sourced election news with myth-busting integration |

![Live Election Dashboard](docs/assets/dashboard.jpg)

---

## 🛠️ Tech Stack

### Backend
| Layer | Technology |
|:---|:---|
| Runtime | Node.js 20 (LTS) |
| Framework | Express 4 |
| AI Engine | Google Gemini 2.5 Flash via **Vertex AI** (`@google/genai`) |
| Database | Google Cloud Firestore (`@google-cloud/firestore`) |
| Auth | Google OAuth2 (`google-auth-library`) + JWT (`jsonwebtoken`) |
| Security | Helmet.js, express-rate-limit, custom CSP, input sanitisation |
| Compression | gzip/brotli via `compression` |

### Frontend
| Layer | Technology |
|:---|:---|
| Markup | HTML5 with semantic elements + WAI-ARIA |
| Styling | Tailwind CSS (CDN) + custom glassmorphism system |
| Charts | Chart.js 4 |
| Icons | Lucide Icons |
| Animations | CSS keyframes + Canvas Confetti |

### Infrastructure
| Layer | Technology |
|:---|:---|
| Container | Docker (multi-stage build) |
| Deployment | Google Cloud Run |
| CI/CD | GitHub Actions (5-stage pipeline) |
| Auth | Application Default Credentials (ADC) for GCP |

---

## 🏗️ Architecture

```mermaid
graph TD
    Browser["🌐 Browser (public/)"]
    Auth["🔐 Auth Routes\n/api/v1/auth/*"]
    Server["⚙️ Express Server\n(src/index.js)"]
    SecMw["🛡️ Security Middleware\nHelmet · Rate Limiter · CSP · Sanitiser"]
    Routes["📡 API Routes\n(src/routes/api.js)"]
    MythAgent["🤖 MythAgent\n(Gemini + MCP Tools)"]
    ExplainAgent["🧠 ExplainerAgent\n(Gemini)"]
    JourneyAgent["🧭 VoterJourneyAgent\n(Gemini + Firestore)"]
    Firestore["🔥 Firestore\n(Truth Table · Myths · Journeys)"]
    VertexAI["✨ Vertex AI\nGemini 2.5 Flash"]
    FactsDB["📦 facts.json\n(Local MCP Facts Server)"]
    GoogleOAuth["🔑 Google OAuth2\n(accounts.google.com)"]

    Browser -->|"HTTPS"| Server
    Server --> SecMw
    SecMw --> Auth
    SecMw --> Routes
    Auth -->|"OAuth flow"| GoogleOAuth
    Routes --> MythAgent
    Routes --> ExplainAgent
    Routes --> JourneyAgent
    MythAgent -->|"generateContent"| VertexAI
    MythAgent -->|"cache read/write"| Firestore
    MythAgent --> FactsDB
    ExplainAgent -->|"generateContent"| VertexAI
    JourneyAgent -->|"generateContent"| VertexAI
    JourneyAgent -->|"journey state"| Firestore
```

> **Key Principle:** The browser **never** contacts Google APIs directly. All Vertex AI and Firestore calls are server-side — credentials are never exposed to the client.

---

## 🌐 Google Services Integration

Chunav Saathi is built **entirely on Google's ecosystem** — every layer from AI inference to identity, storage, deployment, and CI/CD runs on Google infrastructure.

---

### 🤖 1. Vertex AI — Gemini 2.5 Flash
> *The brain of the entire platform.*

All three AI agents are powered by **Google Gemini 2.5 Flash** accessed through **Vertex AI** using the `@google/genai` SDK. This is the most capable, fastest, and most cost-efficient Gemini model available.

- **MythAgent** sends election claims to Gemini with a structured system prompt and receives a fully validated JSON verdict with bilingual explanations, a truth score (0–100), and cited sources.
- **ExplainerAgent** uses Gemini to convert complex electoral jargon (VVPAT, NOTA, Model Code of Conduct) into plain language at 5 adjustable complexity levels.
- **VoterJourneyAgent** uses Gemini to generate a personalized next learning module based on a user's completed journey steps.
- **MCP Tool Calling** — Gemini invokes custom function tools (`searchLocalFacts`, `verifySource`, `searchTruthTable`) mid-conversation before producing its final answer, giving it access to real Indian election data.
- Authentication uses **Application Default Credentials (ADC)** — no API keys, fully keyless and production-safe.

---

### 🔥 2. Google Cloud Firestore
> *The memory of the platform.*

**Firestore (Native mode)** is used as both a persistent database and a high-speed cache layer.

- **Truth Table Cache** — Every fact-checked myth is stored in Firestore using a SHA-256 hash key. On repeated queries, results are returned instantly without calling Gemini — saving latency and cost.
- **Voter Journey Store** — Each user's 5-step civic education progress is tracked in Firestore, persisting across sessions and devices.
- **Myths Collection** — A curated database of verified election myths is stored and queryable by category (`evm_security`, `voting_process`, `candidate_info`).
- **LRU In-Memory TTL Cache** — A two-tier caching strategy (in-memory LRU → Firestore) ensures sub-millisecond responses for hot data while maintaining durability.

---

### 🔑 3. Google OAuth2 / Google Identity
> *Secure, passwordless sign-in.*

The platform integrates **Google Sign-In** using the official `google-auth-library` package, supporting two flows:

- **Web OAuth2 flow** — users are redirected to Google's consent screen, grant permissions, and are redirected back with a verified profile. No passwords are ever stored.
- **SPA/Mobile ID Token flow** — mobile apps using the Google Sign-In SDK send their `idToken` directly to the server for verification.
- On successful authentication, the server issues a **signed JWT** (7-day expiry) using `jsonwebtoken`. All protected API endpoints verify this JWT via `requireAuth` middleware.
- Scopes requested: `userinfo.profile`, `userinfo.email`, `openid` — minimal, privacy-respecting.

---

### ☁️ 4. Google Cloud Run
> *Zero-config, auto-scaling serverless deployment.*

The application is containerized with a **multi-stage Docker build** and deployed to **Google Cloud Run** in the `asia-south1` (Mumbai) region for lowest latency to Indian users.

- Scales to zero when idle — no cost for unused compute
- Scales up automatically under load — no infrastructure management
- HTTPS is provided automatically by Cloud Run
- The non-root Docker user and read-only container filesystem enforce security best practices

---

### ⚙️ 5. Google Cloud Build
> *Automated build and deployment pipeline.*

The `cloudbuild.yaml` defines a full **Google Cloud Build** pipeline:

- Builds the Docker image using the multi-stage Dockerfile
- Pushes to **Google Artifact Registry**
- Deploys the new image to Cloud Run automatically on every merge to `main`

---

### 🛡️ 6. Cloud IAM & Application Default Credentials (ADC)
> *Keyless, zero-trust authentication.*

Rather than managing API keys, the application uses **Application Default Credentials (ADC)** throughout — the GCP SDK automatically discovers credentials from the environment (local `gcloud` session or Cloud Run's attached service account). This means:

- **No secrets in code** — ever
- **No key rotation headaches** — IAM roles grant least-privilege access
- **Seamless local ↔ production parity** — same auth code works everywhere

---

### Summary

| # | Google Service | Role in Chunav Saathi |
|:-:|:---|:---|
| 1 | **Vertex AI — Gemini 2.5 Flash** | All AI inference: myth-busting, explaining, journey personalization, MCP tool calling |
| 2 | **Google Cloud Firestore** | Truth table cache, voter journey state, myths database, LRU TTL caching |
| 3 | **Google OAuth2 / Google Identity** | Passwordless sign-in, ID token verification, JWT issuance |
| 4 | **Google Cloud Run** | Serverless container deployment, auto-scaling, HTTPS |
| 5 | **Google Cloud Build** | Automated Docker build, Artifact Registry push, Cloud Run deploy |
| 6 | **Cloud IAM / ADC** | Keyless, least-privilege authentication across all GCP services |

---

## 🔐 Security

Security is **first-class** in this project, not an afterthought.

### Zero Secret Exposure
- All credentials use **Application Default Credentials (ADC)** — no API keys in code
- The frontend (`/public`) contains **zero** secret values — only proxied `/api` calls
- CI pipeline runs `git grep` to detect accidental key commits
- CI pipeline runs TruffleHog secret scanning on every push
- `.env` is excluded by `.gitignore`; `.env.example` contains only placeholders

### HTTP Security Headers (Helmet.js)
```
Content-Security-Policy:   strict allowlist — no wildcard sources
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options:           DENY
X-Content-Type-Options:    nosniff
Referrer-Policy:           strict-origin-when-cross-origin
Permissions-Policy:        geolocation=(), microphone=(), camera=()
```

### Rate Limiting
| Scope | Limit |
|:---|:---|
| Global API | 100 req / 15 min / IP |
| AI endpoints (`/myth-check`, `/explain`) | 10 req / min / IP |
| Data endpoints (`/facts`, `/myths`) | 30 req / min / IP |

### Input Hardening
- All request bodies capped at **50 KB**
- `userId` validated against strict regex `^[\w-]{3,64}$`
- Text fields capped at 2000 chars
- HTML/script injection patterns stripped from all inputs
- Stack traces **never** returned in production responses

---

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 18
- A Google Cloud project with Firestore and Vertex AI enabled
- Google Cloud SDK with `gcloud auth application-default login`

### Installation

```bash
# 1. Clone
git clone https://github.com/Rex123-hash/chunaav-saathi.git
cd chunaav-saathi

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your values (see table below)

# 4. Authenticate with Google Cloud
gcloud auth application-default login

# 5. Start dev server
npm run dev
```

Server starts at `http://localhost:3000`.

### Environment Variables

| Variable | Required | Description |
|:---|:---:|:---|
| `GCLOUD_PROJECT` | ✅ | GCP project ID (e.g. `my-project-123`) |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth2 Client ID for sign-in |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth2 Client Secret |
| `GOOGLE_REDIRECT_URI` | ✅ | OAuth2 callback URL (e.g. `http://localhost:3000/api/v1/auth/google/callback`) |
| `JWT_SECRET` | ✅ | Random secret for signing user session JWTs |
| `GCLOUD_LOCATION` | optional | Vertex AI region (default: `us-central1`) |
| `FIRESTORE_EMULATOR_HOST` | dev | `localhost:8080` for local emulator |
| `CORS_ORIGIN` | prod | Comma-separated allowed origins |
| `NODE_ENV` | optional | `production` hides error stack traces |
| `PORT` | optional | Default: `3000` |

---

## 📡 API Reference

All endpoints are under `/api/v1/`. Rate limits apply per IP.

### 🔐 Auth Endpoints

| Method | Path | Description |
|:---|:---|:---|
| `GET` | `/api/v1/auth/google` | Redirect to Google OAuth2 consent screen |
| `GET` | `/api/v1/auth/google/callback` | OAuth2 callback — returns `{ token, user }` |
| `POST` | `/api/v1/auth/google/verify` | Verify Google ID token (SPA/mobile) → returns JWT |
| `GET` | `/api/v1/auth/me` | Get current user profile (requires `Authorization: Bearer <token>`) |
| `POST` | `/api/v1/auth/logout` | Stateless logout (client discards token) |

### 🤖 AI Endpoints (10 req/min)

#### `POST /api/v1/myth-check`
Fact-checks an election claim using Gemini 2.5 Flash + Firestore cache.

```json
// Request
{ "text": "EVMs can be hacked via Bluetooth", "lang": "hinglish" }

// Response
{
  "isMythBusted": true,
  "explanation_hi": "यह गलत है। EVMs standalone हैं — कोई wireless connection नहीं होती।",
  "explanation_en": "This is false. EVMs are air-gapped standalone devices with no wireless capability.",
  "truthScore": 5,
  "sources": [{ "title": "ECI VVPAT Guidelines", "url": "https://eci.gov.in/vvpat", "credibility": 99 }],
  "category": "evm_security"
}
```

#### `POST /api/v1/explain`
Explains a civic topic at adjustable complexity.

```json
// Request
{ "topic": "VVPAT", "complexity": 2, "lang": "hinglish" }
```

#### `POST /api/v1/explain/batch`
Batch-explains up to 5 topics in parallel.

```json
// Request
{ "topics": ["EVM", "NOTA", "VVPAT"], "lang": "hinglish" }
```

### 📊 Data Endpoints (30 req/min)

| Method | Path | Description |
|:---|:---|:---|
| `GET` | `/api/v1/facts?category=evm_security` | Curated election facts |
| `GET` | `/api/v1/facts?search=vvpat` | Full-text search facts |
| `GET` | `/api/v1/myths?category=voting_process&limit=20` | Myths from Firestore |
| `GET` | `/api/v1/explainer/capabilities` | Agent capabilities metadata |
| `GET` | `/api/v1/voter-journey/:userId` | Get or create voter journey |
| `PUT` | `/api/v1/voter-journey/:userId` | Update journey progress |
| `POST` | `/api/v1/voter-journey/:userId/complete` | Mark module complete |
| `POST` | `/api/v1/voter-journey/:userId/next-module` | AI-recommended next step |

### 🩺 System

| Method | Path | Description |
|:---|:---|:---|
| `GET` | `/health` | Health check — Firestore latency + Vertex AI status |

---

## 🔑 Authentication (Google OAuth2)

### Browser / Web Flow
```
1. Redirect user to:  GET /api/v1/auth/google
2. User signs in with Google
3. Google redirects to: GET /api/v1/auth/google/callback
4. Response: { token: "eyJ...", expires_in: "7d", user: { googleId, email, name, picture } }
5. Store token client-side, send as: Authorization: Bearer <token>
```

### Mobile / SPA Flow
```
1. Use Google Sign-In SDK to get idToken
2. POST /api/v1/auth/google/verify  { "idToken": "<google-id-token>" }
3. Response: { token: "eyJ...", user: { ... } }
```

### Protected Endpoints
```
GET /api/v1/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Response: { googleId, email, name, picture }
```

---

## 🧪 Testing

```bash
# Run all unit tests
npm test

# Unit tests only (no emulator needed)
npm run test:unit

# Integration tests (requires Firestore emulator)
npm run emulator        # terminal 1
npm run test:integration # terminal 2

# CI-style output with spec reporter
npm run test:ci
```

### Test Coverage (68 Total Passing Tests)

| Suite | Tests | Coverage Area |
|:---|:---:|:---|
| `mythAgent.test.js` | 17 | MythAgent core, cache, retry, MCP tools, safety, schema validation |
| `explainerAgent.test.js` | 13 | Explain batching, language fallback, complexity clamping, caching |
| `authService.test.js` | 13 | JWT issuance/verification, tampered tokens, requireAuth middleware |
| `factsServer.test.js` | 25 | MCP tools, dispatch routing, schema validation, relevance sorting |
| `api.test.js` | Integration | HTTP routes, validation, error handling, Firestore integration |

### What's tested across the platform
- **MythAgent (17 tests):** EVM myths identified, bilingual outputs, Firestore caching, retry logic, MCP tool dispatching.
- **ExplainerAgent (13 tests):** Complexity clamping (1-5), batch processing, graceful fallbacks on Gemini failure, caching.
- **AuthService (13 tests):** JWT token issuance/verification, secure middleware handling, expired/tampered tokens rejection.
- **MCP FactsServer (25 tests):** Synchronous tests for tool declarations, search relevance, strict schema compliance.

---

## ⚙️ CI/CD Pipeline

5-stage GitHub Actions pipeline runs on every push to `main`:

```
Security Audit → Code Quality → Unit Tests → Integration Tests → Build Validation
```

| Stage | What it checks |
|:---|:---|
| **Security** | `npm audit`, TruffleHog secret scan, hardcoded key detection |
| **Quality** | JS syntax check, repo size < 10MB, `.env` not committed |
| **Unit Tests** | All 17 MythAgent tests with spec reporter |
| **Integration** | HTTP route tests against live Firestore emulator |
| **Build** | Production `npm ci --omit=dev`, server smoke test |

---

## 📂 Project Structure

```
chunaav-saathi/
├── .github/
│   └── workflows/
│       └── main.yml              # 5-stage CI/CD pipeline
├── public/                       # Static frontend (zero secrets)
│   ├── index.html                # Main app — glassmorphism dashboard
│   └── journey.html              # 5-step voter education wizard
├── src/
│   ├── index.js                  # Express entry point (security-hardened)
│   ├── middleware/
│   │   └── security.js           # Helmet, rate limiters, sanitiser, CSP
│   ├── routes/
│   │   ├── api.js                # Core API route handlers
│   │   └── auth.js               # Google OAuth2 + JWT auth routes
│   ├── agents/
│   │   ├── MythAgent.js          # Gemini myth-busting + MCP tool dispatch
│   │   ├── ExplainerAgent.js     # Multilingual civic topic explainer
│   │   └── VoterJourneyAgent.js  # AI-personalized learning path
│   ├── services/
│   │   ├── firestore.js          # Firestore service with LRU cache
│   │   └── authService.js        # Google OAuth2 + JWT service
│   ├── mcp/
│   │   └── factsServer.js        # Local facts DB + tool declarations
│   └── utils/
│       └── geminiClient.js       # Shared Vertex AI client with TTL cache
├── tests/
│   ├── agents/
│   │   ├── explainerAgent.test.js# 13 unit tests
│   │   └── mythAgent.test.js     # 17 unit tests
│   ├── integration/
│   │   └── api.test.js           # HTTP integration tests
│   └── utils/
│       ├── authService.test.js   # 13 unit tests for JWT + middleware
│       ├── factsServer.test.js   # 25 unit tests for MCP server
│       ├── mockData.js           # Canonical test fixtures
│       └── testHelpers.js        # Server lifecycle + HTTP helpers
├── data/
│   └── facts.json                # Curated election facts database
├── scripts/
│   └── check-size.js             # Repo size budget enforcer
├── .env.example                  # All variables documented — no real values
├── .gitignore                    # Comprehensive secret file exclusions
├── Dockerfile                    # Production container (multi-stage)
├── app.yaml                      # App Engine Flexible config
├── cloudbuild.yaml               # Cloud Build pipeline
└── package.json                  # Dependencies + npm scripts
```

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

<div align="center">
<br>
Built with ❤️ for Indian Democracy
<br>
<sub>Powered by Google Vertex AI · Gemini 2.5 Flash · Firestore · Google OAuth2 · Cloud Run</sub>
</div>
