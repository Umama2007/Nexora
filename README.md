<div align="center">

# Nexora

**An AI career coach that never invents skills you don't have.**

Nexora analyzes your resume, runs grounded mock interviews, scores your performance, and builds a learning roadmap — all anchored to what you actually wrote, not what an AI thinks you should have.

[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Ollama](https://img.shields.io/badge/Ollama-qwen2.5:1.5b-black?style=flat-square)](https://ollama.com)
[![Gemini](https://img.shields.io/badge/Gemini-API-4285F4?style=flat-square&logo=google)](https://aistudio.google.com)

**[Live Demo](https://nexora-ogeo.onrender.com)** · **[API Docs](#api-reference)** · **[Full Documentation](.kiro/specs/)**

</div>

---

## Overview

Fresh-graduates and job seekers face three compounding problems: they cannot tell why their resume is being rejected, they receive vague AI encouragement instead of recruiter-level critique, and they practice for interviews without knowing which dimension of their performance is actually weak.

Nexora addresses all three through its **Truth Guard system** — a three-step pipeline that structurally prevents the AI from fabricating skills or experience:

1. **Local extraction** — a deterministic Python parser (no LLM) pulls structured facts from the resume: skills, tools, projects, education, name.
2. **Grounded generation** — every LLM prompt injects those facts and is explicitly constrained to reference only them.
3. **Post-generation verification** — a regex scan of the output against a 100+ term technology lexicon flags any claim that was not in the user's extracted facts before the result is shown.

---

## Key Features

| Feature | Description |
|---|---|
| **Resume Analysis** | ATS score (0–100), five-dimension breakdown, missing keywords vs. a real job description, recruiter-style verdict sentence |
| **Feedback Editor** | Five-tab improvement editor (Experience, Skills, Education, Formatting, Overview) with apply/dismiss per item, persisted to SQLite |
| **Resume Tailoring** | Rewrites bullets toward the target role using only verified facts; grounding check result shown to user |
| **Job Match** | Compares extracted skills against a pasted JD; returns match percentage, matching and missing skills |
| **Career Roadmap** | Month-by-month learning plan from missing skills; background generation with polling |
| **Mock Interview — HR** | Behavioral questions; evaluates communication structure and confidence |
| **Mock Interview — Technical** | Technical questions scoped strictly to the candidate's verified skill set |
| **Mock Interview — Resume-Based** | Project-by-project audit; challenges answers that exceed what the resume actually claims |
| **Interview Scoring** | Post-session scoring across technical accuracy, communication, and confidence; issues cite actual words from the transcript |
| **Dashboard** | Live KPIs (resume score, interview readiness average, skills tracked, action items), health bars, activity feed |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              React 19 SPA  (Vercel / localhost:5173)         │
│  CSS Modules · lucide-react · react-router-dom v7           │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         FastAPI Backend  (Render / localhost:8000)           │
│                                                             │
│  truth_guard.py ──► Local deterministic fact extraction     │
│  resume.py      ──► Single unified LLM call (750 tokens)    │
│  grounding.py   ──► Post-generation TECH_TERMS regex scan   │
│  rag_pipeline.py──► Provider-aware interview context RAG    │
│  llm_client.py  ──► FallbackProvider with LRU cache         │
│  database.py    ──► SQLite, 6-table schema, auto-migration   │
└───────────┬─────────────────────────────────────────────────┘
            │
  ┌─────────┴──────────┐
  │  LLM_PROVIDER env  │
  ├────────────────────┤
  │ ollama             │──► qwen2.5:1.5b  localhost:11434
  │   RAG: SentTrans   │    (fully offline, no API key)
  │       + ChromaDB   │
  ├────────────────────┤
  │ gemini             │──► gemini-3.5-flash  googleapis.com
  │   RAG: Embed API   │    (cloud, multi-key failover)
  │       + cosine sim │
  └────────────────────┘
```

The two LLM modes are first-class equals. Ollama runs everything locally with no data leaving the machine. Gemini is used for hosted deployment because free-tier servers cannot run local models. The same codebase, same prompts, same interface — switched by one environment variable.

For the complete architecture with Mermaid diagrams, data flow, database schema, and RAG design, see [`.kiro/specs/architecture.md`](.kiro/specs/architecture.md).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript ~6.0, Vite ^8.2, CSS Modules, lucide-react |
| Routing | react-router-dom v7 |
| Linting | oxlint |
| Backend | FastAPI, Python 3.10+, uvicorn |
| LLM local | Ollama + qwen2.5:1.5b |
| LLM cloud | Google Gemini API (gemini-3.5-flash) |
| Embeddings local | sentence-transformers (all-MiniLM-L6-v2) |
| Embeddings cloud | Google Gemini Embedding API (gemini-embedding-001) |
| Vector store | ChromaDB (in-memory, Ollama mode only) |
| PDF parsing | PyMuPDF |
| DOCX parsing | python-docx |
| Database | SQLite (auto-created on startup) |

---

## Quick Start

### Option A — Local, fully offline (Ollama)

No API key. No data leaves your machine.

```bash
# 1. Pull the model (~1 GB)
ollama pull qwen2.5:1.5b

# 2. Backend setup
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
# source .venv/bin/activate                       # macOS/Linux
pip install -r requirements.txt
pip install sentence-transformers chromadb        # Ollama RAG deps
cp .env.example .env                              # default is LLM_PROVIDER=ollama

# 3. Start backend
uvicorn app.main:app --reload

# 4. Frontend setup (new terminal)
cd frontend
npm install
echo "VITE_API_BASE=http://127.0.0.1:8000/api" > .env.local
npm run dev
```

Open **http://localhost:5173**.

---

### Option B — Cloud inference (Gemini)

Faster than Ollama. Requires a free API key.

```bash
# 1. Get a key at https://aistudio.google.com/apikey

# 2. Backend setup
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt                   # No ML extras needed
cp .env.example .env
# Edit .env:
#   LLM_PROVIDER=gemini
#   GEMINI_API_KEY=your_key_here

# 3. Start backend
uvicorn app.main:app --reload

# 4. Frontend (same as above)
cd frontend && npm install
echo "VITE_API_BASE=http://127.0.0.1:8000/api" > .env.local
npm run dev
```

---

## Environment Variables

**Backend** — set in `backend/.env` (copy from `backend/.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | No | `ollama` | `"ollama"` for local, `"gemini"` for cloud |
| `GEMINI_API_KEY` | Gemini only | — | Primary API key from Google AI Studio |
| `GEMINI_API_KEY_1` | No | — | Second key — auto-failover on quota hit |
| `GEMINI_API_KEY_2` | No | — | Third key — auto-failover chain |
| `GEMINI_MODEL` | No | `gemini-3.5-flash` | Gemini model override |

**Frontend** — set in `frontend/.env.local` for local dev:

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE` | Production Render URL | Backend API base URL |

---

## Usage Flow

```
1. Upload resume (PDF or DOCX) + set target role + optionally paste a job description
         ↓
2. Analysis results: score, breakdown, missing keywords, verdict reason, strengths
         ↓
3. Feedback editor: apply / dismiss AI improvement suggestions per section
         ↓  (also: generate tailored bullets with grounding check)
         ↓
4. Job Match: paste a job description → see match percentage + missing skills
         ↓
5. Roadmap: auto-generated from missing skills → month-by-month learning plan
         ↓
6. Mock Interview: choose HR / Technical / Resume-Based mode
   → 5-question session grounded in your resume facts
   → Scoring: accuracy + communication + confidence + specific issue citations
         ↓
7. Dashboard: live KPIs, health bars, activity feed, AI insight card
```

---

## Commands Reference

### Backend

```bash
# Development (from backend/, venv active)
uvicorn app.main:app --reload

# Production
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Frontend

```bash
# Development
npm run dev

# Production build
npm run build

# Lint
npm run lint

# Preview production build locally
npm run preview
```

---

## Deployment

The project deploys as a split stack:

| Component | Platform | Notes |
|---|---|---|
| Backend | [Render](https://render.com) Web Service | Start cmd: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Frontend | [Vercel](https://vercel.com) | Root: `frontend`, build: `npm run build`, output: `dist` |

Production runs `LLM_PROVIDER=gemini` — Ollama cannot run on hosted servers. Set `GEMINI_API_KEY` (and optional `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2` for failover) in the Render environment dashboard.

> **Render free tier note:** The SQLite database is ephemeral. Data resets on each redeploy or after idle spin-down. Acceptable for demos; upgrade to a persistent disk for production use.

Full deployment guide: [`.kiro/specs/deployment.md`](.kiro/specs/deployment.md)

---

## Project Structure

```
Nexora/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entry point, all routes
│   │   ├── core/             # database, llm_client, truth_guard,
│   │   │                     #   grounding, rag_pipeline, pdf_parser
│   │   ├── api/              # resume, interview, tailor, job_match, roadmap
│   │   ├── models/           # Pydantic schemas
│   │   └── prompts/          # Plain-text LLM system prompts
│   ├── .env.example          # Environment variable template
│   └── requirements.txt      # Core deps (no PyTorch — Gemini-mode safe)
│
├── frontend/
│   └── src/
│       ├── pages/            # One folder per route (14 pages)
│       ├── components/       # Shared UI: layout, charts, ui primitives
│       ├── services/         # API client modules (fetch-based)
│       ├── types/            # TypeScript interfaces
│       └── config.ts         # API_BASE constant
│
├── .kiro/specs/              # Full project documentation
└── README.md
```

Full annotated structure: [`.kiro/specs/project-structure.md`](.kiro/specs/project-structure.md)

---

## Documentation

All detailed documentation lives in [`.kiro/specs/`](.kiro/specs/):

| Document | Contents |
|---|---|
| [`overview.md`](.kiro/specs/overview.md) | Problem statement, target users, complete user journey, limitations |
| [`architecture.md`](.kiro/specs/architecture.md) | Tech stack, data flow diagrams, database schema, RAG design, LLM failover |
| [`features.md`](.kiro/specs/features.md) | Every feature — how it works technically, edge cases, error handling |
| [`api-reference.md`](.kiro/specs/api-reference.md) | Every endpoint: method, route, request, response, error codes, examples |
| [`setup-and-development.md`](.kiro/specs/setup-and-development.md) | Prerequisites, install steps, env vars, commands, troubleshooting |
| [`testing.md`](.kiro/specs/testing.md) | Manual testing checklist, responsive checklist, LLM provider smoke tests |
| [`deployment.md`](.kiro/specs/deployment.md) | Render + Vercel configuration, post-deploy checks, known limitations |
| [`project-structure.md`](.kiro/specs/project-structure.md) | Annotated file tree with descriptions of every module |
| [`changelog.md`](.kiro/specs/changelog.md) | Current implemented state, superseded approaches |

---

## Testing

No automated test suite exists. A full manual testing checklist is available in [`.kiro/specs/testing.md`](.kiro/specs/testing.md), covering:

- Resume upload (PDF + DOCX, validation edge cases)
- Analysis results and score normalization
- Feedback editor (apply/dismiss/restore persistence)
- Tailoring and grounding check output
- Job match and roadmap generation
- All three interview modes and the scoring pass
- Dashboard live data accuracy
- Responsive / mobile layout

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Follow the existing code style — CSS Modules on the frontend, typed Python on the backend
4. For backend changes: run `uvicorn app.main:app --reload` and verify against the manual checklist
5. For frontend changes: run `npm run lint` and `npm run build` before opening a PR
6. Open a pull request with a clear description of what changed and why

---

## Spec-Driven Development

This project was built using [Kiro](https://kiro.dev)'s spec-driven workflow. The `.kiro/specs/` folder contains the requirements, design decisions, and task checklist used throughout development. Key decisions documented there include:

- Why Truth Guard extraction moved from an LLM call to a deterministic Python parser
- Why the RAG engine has two independent implementations (Ollama vs. Gemini) rather than a single shared library
- Why the LLM client uses urllib directly instead of the google-genai SDK
- How the multi-key failover chain and LRU cache were designed

---

*Built with [Kiro](https://kiro.dev)*
