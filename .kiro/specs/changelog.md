# Nexora — Changelog

> No historical commit records or version tags exist in the repository. This document reflects the **current documented state** of the project as determined from the source code. It is organized by feature area rather than by date.

---

## Current State — v2.0

The following represents the fully implemented and deployed system.

### Core Infrastructure

- **FastAPI backend** with CORS (`allow_origins=["*"]`), SQLite persistence via 6-table schema, and `BackgroundTasks` for async processing
- **Dual LLM provider system** controlled by `LLM_PROVIDER` environment variable:
  - `"ollama"` — local `qwen2.5:1.5b` via Ollama, fully offline
  - `"gemini"` — Google Gemini API (`gemini-3.5-flash` default) for cloud deployment
- **Multi-key Gemini failover**: `GEMINI_API_KEY`, `GEMINI_API_KEY_1`, ... `GEMINI_API_KEY_99` with automatic rotation on HTTP 429/503
- **LRU response cache** (128 entries, 10-minute TTL) for identical LLM inputs
- **`AllProvidersExhaustedError`** mapped to HTTP 503 with structured JSON and `Retry-After: 60` header
- **Input hash caching** (SHA-256 of `resume_text + role + jd + v2`) — re-uploads of identical resumes skip the LLM and complete instantly
- **Provider-aware RAG engine**: Gemini mode uses `gemini-embedding-001` API (zero ML dependencies); Ollama mode uses SentenceTransformer + ChromaDB (deferred import, does not load on startup)
- **Startup validation**: `validate_provider()` fails fast on misconfigured provider or missing API key before any request is served
- **Additive database migrations** guarded by `PRAGMA table_info` checks

### Truth Guard System

- **Step 1 — Local extraction** (`truth_guard.py`): fully deterministic Python parser, no LLM involved. Extracts `{name, education, skills[], tools[], projects[]}` using multi-stage section scanning, regex-based TECH_TERMS matching, name filtering, and project title detection. Replaced an earlier LLM-based extraction approach.
- **Step 2 — Grounded generation**: all LLM prompts inject extracted facts and instruct the model to reference only those facts
- **Step 3 — Post-generation verification** (`grounding.py`): deterministic regex scan of generated text against `TECH_TERMS` lexicon; reports any technology term present in output but absent from the user's extracted facts as `hallucinations_caught`

### Resume Analysis

- **Unified single LLM call** (`analyze_resume_once`, 750 tokens): returns score, breakdown, verdict reason, missing keywords, summary, strengths, and improvements in one JSON object. Replaced an earlier fast-path/detailed-path split.
- **Deterministic score normalization**: `>=85 Outstanding`, `>=70 Good`, `>=50 Average`, else `Poor` — LLM label overwritten
- **Deterministic section normalization** (`_normalize_section`): improvement sections mapped to canonical tab values, preventing model drift from hiding improvements in the editor
- **Missing keyword fallback**: when LLM returns empty keywords but a JD was provided, scans JD against TECH_TERMS lexicon for up to 10 missing terms with proper display casing
- **`analysisStatus` column** with `completed`/`error` values for reliable frontend polling termination

### Resume Feedback Editor

- **Five-tab editor** (Overview, Experience, Skills, Education, Formatting)
- **Per-improvement apply/dismiss/restore** actions persisted to SQLite via `PATCH /api/analyses/:id/improvements`
- **On-demand bullet tailoring** with post-generation grounding check displayed to user

### Mock Interview System

- **Three distinct interview modes** with separate system prompt files: HR, Technical, Resume-Based
- **Per-session RAG context retrieval** — top-2 most relevant facts retrieved per chat turn, injected into system prompt
- **5-question session limit** with automatic wrap-up close on the final answer
- **Early end** supported — user can trigger scoring at any point after one answer
- **Scoring pass** (512 tokens) produces `accuracy`, `communication`, `confidence` sub-scores plus 2–4 issue objects with specific references to the candidate's actual words
- **Idempotent scoring endpoint** — re-visiting feedback does not re-run the LLM

### Frontend

- **React 19** SPA with Vite, TypeScript ~6.0, CSS Modules, lucide-react
- **react-router-dom v7** with 14 routes inside `AppLayout` shell (+ landing outside)
- **Progress polling** in `ResumeUpload.tsx` (2-second interval with progress stage labels and elapsed timer)
- **Roadmap polling** in `Roadmap.tsx` (2-second interval)
- **Optimistic chat UI** in `InterviewRoom.tsx`
- **Profile service** with `localStorage` persistence, schema versioning (`nexora_profile_v2`), once-per-resumeId auto-population guard, and manual sync from latest resume
- **Recommendation service** derives all action items from live analysis and interview data — no hardcoded content
- **Job Match → Roadmap** integration via `location.state` router state
- **`VITE_API_BASE`** env var override with Render production URL as default

### Removed / Superseded

The following were present in earlier development phases but have been removed:

- 31 development/diagnostic test scripts from `backend/` root
- 10 project-root cruft files (old test scripts, generated PDFs, report artifacts)
- Personal resume files from `backend/app/temp/`
- Stale `nexora.db` files outside of `backend/`
- Empty `frontend/src/data/mock/` directory
- Development test data from the SQLite database (reset to empty for deployment)
- `truth_guard_extract.txt` prompt is no longer called at runtime (extraction is now pure Python); the file is retained as a historical artifact
