# Deploying `toctracker.com`

`toctracker.com` ships as a **single Rust + React Docker container** serving the SPA, open JSON API, OAuth callbacks, dynamic PNG OG cards (`/og/*`), meta-tag-injected HTML (`/a/:handle`, `/compare`), `sitemap.xml`, and background Arweave publisher from one origin.

## Recommended Stack (5 Minutes to Live)

1. **App Host + Postgres:** [Railway](https://railway.app) (auto-detects `railway.toml` + `Dockerfile`) or [Fly.io](https://fly.io) (`fly launch --copy-config`).
2. **DNS (you already bought `toctracker.com` on Vercel):** Point `toctracker.com` directly to Railway/Fly in Vercel DNS so cookies, OAuth callbacks, and OG cards all share one origin with zero proxy lag.

---

## Step 1: Deploy Container + Postgres (Railway)

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub Repo** → select `toc-tracker`.
3. Click **+ New → Database → PostgreSQL**.
4. On the `toc-tracker` service → **Variables**, set:
   ```env
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   PUBLIC_BASE_URL=https://toctracker.com
   ```
5. Railway builds `Dockerfile`, runs SQLx migrations automatically, seeds the 26 AI Safety profiles if the DB is empty, and verifies `GET /api/v1/health`.

## Step 2: Connect `toctracker.com` in Vercel DNS

1. In Railway → Service → **Settings → Networking → Custom Domain**, add `toctracker.com` (and optionally `www.toctracker.com`). Railway gives you a CNAME target (e.g. `xxxx.up.railway.app`).
2. In **Vercel Dashboard → Domains → `toctracker.com` → DNS Records**:
   - Add `ALIAS` (or `ANAME`/`CNAME` flattening at apex `@`) → Railway's target host.
   - Add `CNAME` for `www` → Railway's target host.
3. Wait ~1–2 minutes for TLS certificate provisioning. Verify `https://toctracker.com/api/v1/health`.

## Step 3: Turn On Auth & Intelligence Keys (Optional — Enable Anytime)

| Feature | Where to get keys | Env vars to set |
| :--- | :--- | :--- |
| **X (Twitter) OAuth** | [X Developer Portal](https://developer.x.com) → OAuth 2.0 Web App → Callback `https://toctracker.com/auth/x/callback` | `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REDIRECT_URI=https://toctracker.com/auth/x/callback` |
| **GitHub OAuth** | GitHub Settings → Developer Settings → OAuth Apps → Callback `https://toctracker.com/auth/github/callback` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI=https://toctracker.com/auth/github/callback` |
| **Email Magic Links** | [Resend](https://resend.com) → verify `toctracker.com` domain (2 DNS records in Vercel) → Create API Key | `RESEND_API_KEY`, `EMAIL_FROM=ToC Tracker <login@toctracker.com>` |
| **AI Extraction & Stress-Test** | [OpenRouter](https://openrouter.ai) (1 key gives Gemini 2.5 Flash, Claude Sonnet, GPT-4.1) | `OPENROUTER_API_KEY` (optional: `LLM_MODEL=google/gemini-2.5-flash`) |
| **Arweave Archiving** | ArDrive Turbo | `ARWEAVE_UPLOAD_ENDPOINT`, `ARWEAVE_API_TOKEN` |

> **Security Note:** Whenever `PUBLIC_BASE_URL` starts with `https://`, unverified dev email login is automatically disabled and session cookies automatically enable `Secure`. Only verified X OAuth, GitHub OAuth, or Resend magic links can sign in.
