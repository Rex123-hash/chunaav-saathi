# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately:

1. **Email:** Send details to the repository maintainer (find contact in the GitHub profile).
2. **Subject line:** `[SECURITY] chunav-saathi — <brief description>`
3. **Include:**
   - Description of the vulnerability and its potential impact
   - Steps to reproduce (proof of concept if possible)
   - Affected file(s) and version(s)
   - Suggested fix if you have one

You will receive an acknowledgement within **48 hours** and a resolution timeline within **7 days**.

## Scope

In scope:
- Remote code execution
- Authentication or authorisation bypass
- Injection attacks (SQL, NoSQL, command, prompt injection)
- Sensitive data exposure (API keys, PII)
- Rate-limit bypass that enables abuse of Gemini API quota

Out of scope:
- Issues requiring physical access to the server
- Social engineering of contributors
- Denial-of-service via volumetric traffic (infrastructure concern)

## Key Security Practices in this Project

- API keys are **never** stored in source code — loaded from `.env` (dev) or GCP Secret Manager (prod)
- All HTTP responses are hardened with Helmet.js (CSP, HSTS, X-Frame-Options, etc.)
- Input validation and sanitisation on every endpoint
- Rate limiting: 100 req/15 min global, 10 req/min for AI endpoints
- No secrets in `/public` — only proxied `/api` calls reach the backend
