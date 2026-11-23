# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in `toctracker.com` (authentication, SSRF, XSS, claim hijacking, rate-limiting bypass, or data leakage), please **do not** open a public issue.

Instead, report it privately via GitHub Security Advisories (**Security → Advisories → Report a vulnerability**) or contact the maintainer directly. Include reproduction steps and impact; we aim to respond within 48 hours.

## Security Model

- **Public Open Read API:** `GET /api/v1/*` endpoints are intentionally public and CORS-open.
- **Authenticated Mutations:** Creating profiles, publishing snapshots, claiming drafts, and updating criteria require an authenticated session (`HttpOnly; SameSite=Lax; Secure` cookie).
- **Verified Claim Protection:** In production (`https://`), automatic profile claiming requires an OAuth-verified handle matching the profile's registered handle.
- **SSRF Protection:** Document URL fetching blocks private, loopback, link-local, and internal DNS addresses and disables cross-host redirects.
- **No Secrets in Repo:** All API keys, OAuth secrets, and private research notes stay out of version control (`.gitignore`).
