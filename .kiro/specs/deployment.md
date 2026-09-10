# Nexora — Deployment

## Deployment Architecture

Nexora uses a split deployment:

| Component | Platform | Notes |
|---|---|---|
| **Backend (FastAPI)** | [Render](https://render.com) | Persistent web service, `LLM_PROVIDER=gemini` |
| **Frontend (React SPA)** | [Vercel](https://vercel.com) | Static build from `frontend/dist/` |

**Live backend URL:** `https://nexora-ogeo.onrender.com`  
**Frontend default API target:** `https://nexora-ogeo.onrender.com/api` (hardcoded in `frontend/src/config.ts` as the default; overridable via `VITE_API_BASE`)

### Why this split

- The backend is a **persistent FastAPI process** — it holds `_progress_store` in memory for polling, runs background tasks, and writes to a local SQLite file. Serverless functions (Vercel Functions, Netlify Functions) cannot maintain this state between requests. A persistent server is required.
- The frontend is a **pure static build** — `npm run build` outputs `frontend/dist/` with no server-side rendering. Any CDN or static host works.
- Ollama is **not available on hosted platforms**. The deployment uses `LLM_PROVIDER=gemini` so all inference goes to Google's API. Ollama mode is for local development only.

---

## Backend Deployment (Render)

### Service type
Render **Web Service** (not a static site, not a function).

### Start command
```bash
cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

`$PORT` is set automatically by Render. `--host 0.0.0.0` is required — the default `127.0.0.1` refuses external connections.

### Build command
```bash
cd backend && pip install -r requirements.txt
```

`sentence-transformers` and `chromadb` are intentionally **not** in `requirements.txt` — they would pull in PyTorch (~200 MB) and exceed Render's free-tier 512 MB memory limit. The Gemini RAG engine uses only stdlib.

### Environment variables (set in Render dashboard)

| Variable | Value |
|---|---|
| `LLM_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | `<your key from aistudio.google.com>` |
| `GEMINI_MODEL` | `gemini-3.5-flash` *(or leave unset for default)* |
| `GEMINI_API_KEY_1` | `<optional second key for failover>` |

### Root directory
Set Render's **Root Directory** to `backend` so that `uvicorn` runs from within `backend/` and resolves `nexora.db`, `app/temp/`, and `app/prompts/` with correct relative paths.

### Startup behaviour
On first startup (or after a redeploy):
1. `init_db()` creates `nexora.db` with all six tables (idempotent — safe on every restart)
2. `validate_provider()` confirms `GEMINI_API_KEY` is set; raises `RuntimeError` immediately if not
3. Background warmup thread logs `[WARMUP] Gemini provider active — skipping heavy model warmup.`

---

## Frontend Deployment (Vercel)

### Build settings

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

### Environment variable (Vercel dashboard)

| Variable | Value |
|---|---|
| `VITE_API_BASE` | `https://nexora-ogeo.onrender.com/api` |

If deploying to a different backend URL, update this value. The default in `frontend/src/config.ts` already points to the Render URL, so this env var is optional unless you change the backend location.

### SPA routing
Vercel handles React Router's client-side routing automatically for Vite projects. No `vercel.json` rewrite rules are needed — the framework preset configures this correctly.

---

## Post-Deployment Checks

After every deployment, run through this checklist:

- [ ] `GET https://nexora-ogeo.onrender.com/health` returns `{"status": "ok"}`
- [ ] Frontend loads at the Vercel URL without console errors
- [ ] Upload a test resume — verify analysis completes (Gemini call succeeds)
- [ ] Check Render logs for `validate_provider()` success and `[WARMUP] Complete.`
- [ ] Verify CORS: the frontend domain must receive `Access-Control-Allow-Origin: *` on API responses
- [ ] Run a mock interview to verify the Gemini Embedding API is accessible from Render's network

---

## Known Deployment Limitations

### Ephemeral disk on Render free tier

Render's free web service tier does not provide persistent disk. `nexora.db` is recreated empty on every redeploy or instance restart. Users lose their analysis history and interview sessions on each deploy.

**Workarounds:**
- Accept this behaviour for demo/hackathon use (the app starts fresh but all features work)
- Upgrade to Render's paid tier with a persistent disk add-on
- Migrate the database layer to a managed Postgres instance (requires changes to `database.py`)

### Render free-tier cold starts

Render's free web service spins down after ~15 minutes of inactivity. The first request after a cold start takes ~30 seconds while the instance restarts. The frontend's progress polling loop (2-second interval, no timeout) handles this gracefully — it simply waits.

### Gemini rate limits

The Gemini free tier enforces a per-minute and per-day request quota. Under heavy demo usage:
- Configure 2–3 API keys via `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2` for automatic failover
- The backend's `FallbackProvider` will rotate keys automatically on HTTP 429 responses
- If all keys are exhausted, users see a `"temporarily at capacity"` message with a 60-second retry suggestion

### No HTTPS enforcement on the backend

Render provides HTTPS automatically via its load balancer. Do not configure manual SSL termination in uvicorn.

---

## Updating the Deployment

### Backend update
1. Push changes to the linked Git branch
2. Render auto-deploys on push (if configured), or trigger manually from the Render dashboard
3. The new instance restarts, `init_db()` runs (migrations are additive and safe), warmup completes

### Frontend update
1. Push changes to the linked Git repository
2. Vercel auto-deploys on push
3. The static build updates; no server restart required

### Database schema changes
`init_db()` uses `PRAGMA table_info` checks before any `ALTER TABLE`. Adding a new column is safe across redeploys. Dropping a column or changing a column type requires a manual migration script.
