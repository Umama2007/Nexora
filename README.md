# Nexora — AI Career Coach

Full-stack resume analysis, interview preparation, and career guidance platform. React frontend with FastAPI backend, supporting two fully independent LLM backends: local (Ollama) and cloud (Google Gemini).

## Architecture

```
frontend/              React + TypeScript + Vite
  src/
    pages/             Dashboard, AnalysisResults, InterviewRoom, Profile, ...
    services/          HTTP clients for each backend feature
    components/        Shared UI (Card, Badge, ScoreCard, ProgressBar, ...)

backend/               FastAPI + Python
  app/
    main.py            Server entry point, all HTTP routes
    api/               Feature modules (resume, interview, tailor, job_match, roadmap)
    core/
      llm_client.py    Dual-provider LLM interface (Ollama / Gemini)
      rag_pipeline.py  Dual-engine RAG for interview context retrieval
      truth_guard.py   Grounded fact extraction from resumes
      grounding.py     Deterministic hallucination checker
      pdf_parser.py    PDF + DOCX text extraction
      database.py      SQLite schema and migrations
    prompts/           LLM prompt templates (per feature, per interview mode)
```

## LLM Provider System

The backend runs one of two LLM backends, selected at boot via `LLM_PROVIDER`:

| | Ollama Mode | Gemini Mode |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | `gemini` |
| LLM | qwen2.5:1.5b (local) | gemini-3.5-flash (cloud) |
| Interface | `generate_completion()` | `generate_completion()` |
| Offline | Yes — fully local | No — requires internet |
| API key | None | `GEMINI_API_KEY` required |

All callers use the same `generate_completion(prompt, system, num_predict, timeout)` signature regardless of provider. The branching is internal to `llm_client.py`.

## RAG Pipeline (Interview Context Retrieval)

The interview system indexes a user's resume facts (skills, tools, projects) and retrieves relevant context for each turn, so the interviewer's questions stay grounded in the actual resume.

Two engines are available, automatically selected based on `LLM_PROVIDER`:

### Gemini Mode RAG

```
Embeddings:  Google gemini-embedding-001 (cloud REST API)
Storage:     In-memory list + cosine similarity
Memory:      ~2.6 MB per session (just the embedding vectors)
Dependencies: None beyond stdlib (urllib + math)
```

Zero ML packages loaded. The embedding model runs on Google's servers. The per-session corpus (~20-30 documents) is small enough that brute-force cosine similarity over a Python list outperforms a vector DB lookup and avoids chromadb's transitive dependency tree entirely.

### Ollama Mode RAG

```
Embeddings:  sentence-transformers all-MiniLM-L6-v2 (local CPU)
Storage:     ChromaDB ephemeral in-memory client
Memory:      ~280 MB per session (torch + transformers + chromadb)
Dependencies: sentence-transformers, chromadb (not in requirements.txt)
```

Uses the same embedding quality as a local model can provide, with ChromaDB handling vector storage and nearest-neighbour search. All heavy imports are deferred to function scope — they only load when an interview actually starts, not at server boot.

### Why Two Paths

Both are real, tested implementations — neither is a fallback. Gemini mode is designed for cloud deployment where memory is tight (Render free tier: 512 MB). Ollama mode is for fully offline local development where no external API calls are made — not even for embeddings.

### Swapping Engines

The engine is selected once at first use based on `LLM_PROVIDER` and cached as a singleton. The public interface is identical:

```python
from app.core.rag_pipeline import initialize_interview_rag, get_interview_context

initialize_interview_rag(session_id, truth_facts)  # index resume facts
context = get_interview_context(session_id, query, k=2)  # retrieve top-k
```

Callers never need to know which engine is active.

## Memory Footprint (Gemini Mode — Render Deployment Target)

| State | tracemalloc | Est. RSS | Heavy modules |
|---|---|---|---|
| Server boot | 21.7 MB | ~40 MB | 0 |
| After RAG init (interview start) | 24.3 MB | ~53 MB | 0 |
| After full interview (5 turns) | ~25 MB | ~55 MB | 0 |

Fits comfortably within Render's 512 MB free tier with ~450 MB of headroom.

## Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- Ollama (only for local/ollama mode — not needed for Gemini mode)

### Backend

```bash
cd backend

# Create .env (copy from .env.example)
cp .env.example .env
# Edit .env to set LLM_PROVIDER and GEMINI_API_KEY if using Gemini mode

# Install dependencies
pip install -r requirements.txt

# For Ollama mode, additionally install:
pip install sentence-transformers chromadb

# Start the server
uvicorn app.main:app --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | No | `ollama` | `ollama` or `gemini` |
| `GEMINI_API_KEY` | Gemini only | — | Google AI Studio API key |
| `GEMINI_MODEL` | No | `gemini-3.5-flash` | Gemini completion model |

## Deployment (Render)

1. Create a Web Service on Render pointing to this repository
2. Set root directory to `backend/`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Environment variables: `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=<key>`
6. Instance type: Free (512 MB) is sufficient

The Procfile in `backend/` is also respected by Render if present.

## Features

- **Resume Analysis** — Upload PDF/DOCX, get scored feedback with strengths and improvements
- **Truth Guard** — Grounded fact extraction prevents the LLM from hallucinating resume details
- **Interview Room** — Practice interviews in HR, Technical, or Resume-Based modes with RAG-grounded questions
- **Job Match** — Compare resume skills against a job description for match percentage
- **Tailor** — Rewrite resume bullets toward a target role with hallucination detection
- **Career Roadmap** — Generate learning plans for missing skills
- **Profile** — Auto-populated from resume extractions, fully editable

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, CSS Modules
- **Backend**: FastAPI, Uvicorn, SQLite, PyMuPDF
- **LLM (local)**: Ollama — qwen2.5 1.5b
- **LLM (cloud)**: Google Gemini API — gemini-3.5-flash (completion), gemini-embedding-001 (embeddings)
- **RAG (local)**: sentence-transformers all-MiniLM-L6-v2 + ChromaDB
- **RAG (cloud)**: Gemini embedding API + in-memory cosine similarity
