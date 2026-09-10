# Nexora — Setup and Development

## Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| Python | 3.10+ | Backend runtime |
| Node.js | 18+ | Frontend runtime |
| npm | 9+ (ships with Node 18) | Frontend package management |
| Ollama | Latest | Local LLM runtime *(Ollama mode only)* |

---

## Running Locally — Ollama Mode (Fully Offline)

This mode requires no API keys. All inference runs locally via Ollama. No data leaves your machine.

### 1. Pull the model

Install [Ollama](https://ollama.com) and pull the required model:

```bash
ollama pull qwen2.5:1.5b
```

This downloads approximately 1 GB. Ollama must be running before you start the backend.

### 2. Set up the backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv

# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

# Install core dependencies
pip install -r requirements.txt

# Ollama mode also needs these (not in requirements.txt — see note below)
pip install sentence-transformers chromadb
```

> **Why separate installs?** `sentence-transformers` pulls in PyTorch (~200 MB CPU build). This is fine for local dev but would exceed Render's free-tier memory limit on a cloud deployment. The `requirements.txt` is intentionally minimal for Gemini-mode deploys.

### 3. Configure the environment

```bash
cp .env.example .env
```

The default `.env.example` already sets `LLM_PROVIDER=ollama`. No other changes are needed for local Ollama mode.

### 4. Start the backend

```bash
# From the backend/ directory, with the virtual environment active:
uvicorn app.main:app --reload
```

The server starts on `http://127.0.0.1:8000`. On first startup it:
- Creates `nexora.db` with all six tables (idempotent — safe to re-run)
- Validates the LLM provider configuration
- Starts a warmup thread that loads the SentenceTransformer model and pings Ollama

Allow ~15–30 seconds for warmup to complete before the first upload.

### 5. Set up the frontend

```bash
cd frontend
npm install
```

Create a local env override so the frontend points to your local backend:

```bash
# frontend/.env.local
VITE_API_BASE=http://127.0.0.1:8000/api
```

Start the dev server:

```bash
npm run dev
```

The app is available at `http://localhost:5173`.

---

## Running Locally — Gemini Mode (Cloud LLM)

Use this if you do not want to install Ollama or need faster inference.

### 1. Get a Gemini API key

Visit [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a free key.

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash
```

### 3. Install backend dependencies (no ML extras needed)

```bash
pip install -r requirements.txt
```

`sentence-transformers` and `chromadb` are **not** needed in Gemini mode. The Gemini RAG engine uses Google's Embedding API and a plain in-memory list — no PyTorch.

### 4. Start backend and frontend

Same commands as Ollama mode:

```bash
# Backend
uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend && npm run dev
```

---

## Multiple Gemini API Keys (Optional)

To enable automatic failover when a key hits its rate limit:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=key_primary
GEMINI_API_KEY_1=key_two
GEMINI_API_KEY_2=key_three
```

The backend scans `GEMINI_API_KEY_1` through `GEMINI_API_KEY_99` and builds an ordered provider chain. When key N returns HTTP 429 or 503, the request automatically retries with key N+1.

---

## Environment Variables Reference

All variables are read by the **backend**. Copy `backend/.env.example` to `backend/.env`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | No | `ollama` | `"ollama"` for local inference, `"gemini"` for cloud |
| `GEMINI_API_KEY` | Gemini only | — | Primary Google Gemini API key |
| `GEMINI_API_KEY_1` | No | — | Additional Gemini key for failover |
| `GEMINI_API_KEY_2` | No | — | Additional Gemini key for failover |
| `GEMINI_MODEL` | No | `gemini-3.5-flash` | Gemini completion model override |

Frontend variable (set in `frontend/.env.local` for local dev):

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE` | `https://nexora-ogeo.onrender.com/api` | Backend API base URL |

---

## Available Commands

### Backend

| Command | Description |
|---|---|
| `uvicorn app.main:app --reload` | Start development server with hot reload |
| `uvicorn app.main:app --host 0.0.0.0 --port $PORT` | Production start (Render) |
| `python app/core/database.py` | Initialize the database manually |

Run all backend commands from the `backend/` directory with the virtual environment active.

### Frontend

Run all frontend commands from the `frontend/` directory.

| Command | Description |
|---|---|
| `npm run dev` | Start Vite development server (localhost:5173) |
| `npm run build` | TypeScript compile + Vite production build → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run oxlint across all source files |

---

## Troubleshooting

### `RuntimeError: LLM_PROVIDER must be 'ollama' or 'gemini'`

The `LLM_PROVIDER` env var is set to an unrecognized value, or `backend/.env` was not loaded. Verify the `.env` file exists in the `backend/` directory and that `uvicorn` is started from within `backend/`.

### `RuntimeError: LLM_PROVIDER=gemini requires at least one GEMINI_API_KEY`

`LLM_PROVIDER=gemini` is set but `GEMINI_API_KEY` is empty. Add your API key to `backend/.env`.

### `Failed to connect to Ollama at http://localhost:11434`

Ollama is not running, or the model has not been pulled. Run `ollama pull qwen2.5:1.5b` and ensure the Ollama service is active before starting the backend.

### Analysis stuck at "processing" indefinitely

The background analysis task likely failed silently. Check the backend terminal for Python tracebacks. Common causes:
- Ollama is not running (connection refused)
- Gemini API key is invalid (HTTP 403 at first call)
- The uploaded file is corrupted or has an extension mismatch

If the analysis row is stuck, `GET /api/resumes/:id/status` will return `{"status": "error", "message": "..."}` once the exception is caught. The frontend displays the error and offers a retry.

### `ImportError: No module named 'sentence_transformers'`

You are running in Ollama mode but did not install the optional ML dependencies. Run:
```bash
pip install sentence-transformers chromadb
```

### Frontend shows "Failed to fetch" or network errors

The `VITE_API_BASE` env var is not set for local dev. Create `frontend/.env.local` with:
```
VITE_API_BASE=http://127.0.0.1:8000/api
```

Then restart the Vite dev server.

### TypeScript build errors (`tsc -b`)

Run `npm run lint` first to catch oxlint issues. Then check for type errors in `frontend/src/types/index.ts` — the type definitions are the shared contract between services and pages.

### `nexora.db` permission error on Windows

If the database file is open in another process (e.g., SQLite Browser), uvicorn may fail to write to it. Close any external DB tools and restart the backend.
