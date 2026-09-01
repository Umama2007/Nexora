# Nexora — Technical Design

**Project:** Nexora (formerly CareerMirror AI)  
**Version:** 2.0 — August 2026  
**Stack:** FastAPI · Ollama (qwen2.5:1.5b) / Gemini (gemini-3.5-flash) · ChromaDB · SQLite · React 19 + TypeScript

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React Frontend (Vite)                        │
│  Landing → Dashboard → ResumeUpload → AnalysisResults →             │
│  ResumeFeedback → InterviewModeSelect → InterviewRoom →             │
│  InterviewFeedback → JobMatch → Roadmap → AnalysisHistory → Profile │
│                     (CSS Modules · lucide-react)                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP/REST  (localhost:8000)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (main.py)                       │
│                                                                      │
│  POST /api/resumes/upload ──► BackgroundTask: run_async_analysis    │
│  GET  /api/resumes/{id}/status  (progress polling)                  │
│  GET  /api/analyses/{id}                                            │
│  PATCH /api/analyses/{id}/improvements                              │
│  POST /api/tailor                                                    │
│  POST /api/job-match                                                 │
│  POST /api/roadmap  ──────────► BackgroundTask: _run_roadmap_sync   │
│  POST /api/interviews                                                │
│  POST /api/interviews/{id}/chat                                     │
│  POST /api/interviews/{id}/score                                    │
└──────┬────────────────────────────────────────────────────┬─────────┘
       │                                                    │
       ▼                                                    ▼
┌──────────────────┐                             ┌──────────────────┐
│  AI Pipeline     │                             │  SQLite (nexora.db)│
│                  │                             │                   │
│ pdf_parser.py    │                             │ resumes           │
│ truth_guard.py   │                             │ analyses          │
│ rag_pipeline.py  │                             │ interviews        │
│ grounding.py     │                             │ interview_feedback│
│ llm_client.py    │                             │ job_matches       │
│                  │                             │ roadmaps          │
└──────┬───────────┘                             └──────────────────┘
       │
       ├─── SentenceTransformer (all-MiniLM-L6-v2)
       │         └── ChromaDB (in-memory, per-session)
       │
       └─── LLM Provider (swappable via LLM_PROVIDER env var)
                 ├── Ollama  →  localhost:11434  (qwen2.5:1.5b, offline)
                 └── Gemini  →  generativelanguage.googleapis.com  (cloud)
```

---

## 2. Data Flow: Upload Through All Six Feature Modules

```
User uploads PDF/DOCX + targetRole + jobDescription (optional)
       │
       ▼
  pdf_parser.py
  extract_resume_text()
  ├── .docx → python-docx (paragraphs + table cells)
  └── .pdf  → PyMuPDF (page-by-page text concat)
       │
       ▼
  truth_guard.py
  extract_truth_guard_facts()
  → LLM call (truth_guard_extract.txt, 512 tok)
  → JSON: { name, education, skills[], tools[], projects[] }
  → stored: analyses.truthFacts
       │
       ├─────────────────────────────────────────────────────────────┐
       │  FAST PATH (512 tok)                                        │
       ▼                                                             │
  resume.py: analyze_resume_fast()                                   │
  → LLM: score, verdict_reason, breakdown{5 dims}, missing_keywords │
  → deterministic score normalization (≥85/70/50)                   │
  → deterministic missing-keyword fallback (TECH_TERMS scan of JD)  │
  → analyses row written: analysisStatus = 'fast_completed'         │
  → frontend polling detects 'fast_completed' → navigates to        │
    AnalysisResults (score + keywords visible immediately)           │
       │                                                             │
       │  DETAILED PATH (1536 tok, background)                       │
       ▼                                                             │
  resume.py: analyze_resume_detailed()                               │
  → LLM: summary, strengths[], improvements[{section,current,       │
         feedback,suggestion,status}]                                │
  → section normalization (_normalize_section → 4 canonical values) │
  → analyses row updated: analysisStatus = 'completed' (or 'error') │
  → frontend useAnalysisPolling() detects change → updates UI       │
       │                                                             │
       └─────────────────────────────────────────────────────────────┘

From analyses.truthFacts (FR-6 facts) ──────────────────────────────►
       │                                                             │
       ├──► FR-7/FR-8: Tailoring + Grounding Check                  │
       │    tailor.py: generate_tailored_resume()                    │
       │    → LLM: tailored_bullets[{original,tailored}] (512 tok)  │
       │    → grounding.py: verify_grounding()                       │
       │      (regex TECH_TERMS scan, deterministic, no LLM)        │
       │    → returns {tailoredBullets, grounding{is_grounded,       │
       │               hallucinations_caught[]}}                     │
       │                                                             │
       ├──► FR-14: Job Match                                         │
       │    job_match.py: analyze_job_match()                        │
       │    → LLM: {matchPercentage, matchingSkills[], missingSkills[]}│
       │    → stored: job_matches table                              │
       │                                                             │
       ├──► FR-13: Roadmap (background)                              │
       │    roadmap.py: generate_roadmap()                           │
       │    → LLM: {steps[{month,title,focus,whyItMatters}]}         │
       │    → stored: roadmaps table                                 │
       │                                                             │
       └──► FR-9/10/11/12: Mock Interview                           │
            rag_pipeline.py: initialize_interview_rag()              │
            → SentenceTransformer encodes facts into ChromaDB        │
              (per-session in-memory collection)                     │
            interview.py: generate_opening_question()                │
            → mode-branched system prompt (HR/Technical/Resume-Based)│
            → RAG: top-2 relevant facts via cosine similarity        │
            → LLM: opening question (160 tok)                        │
            → stored: interviews.chatHistory                         │
            Per turn: chat_turn()                                    │
            → RAG query on user message → inject [RAG_CONTEXT]      │
            → LLM: next question or wrap-up close (160 tok)         │
            → session status = 'completed' after answer 5           │
            score_interview()                                        │
            → full transcript → LLM scoring (512 tok)               │
            → stored: interview_feedback table                       │
```

---

## 3. Component Architecture

### 3.1 Backend Layers

| Layer | Files | Responsibility |
|---|---|---|
| **API layer** | `main.py`, `api/resume.py`, `api/interview.py`, `api/tailor.py`, `api/job_match.py`, `api/roadmap.py` | HTTP request/response, background task dispatch, serialization, SQLite read/write |
| **Parsing** | `core/pdf_parser.py` | File-type dispatch; PyMuPDF for PDF, python-docx for DOCX |
| **Extraction** | `core/truth_guard.py` | Truth Guard Step 1 — structured JSON facts from resume text |
| **Grounding** | `core/grounding.py` | Truth Guard Step 3 — deterministic post-generation TECH_TERMS scan |
| **Retrieval** | `core/rag_pipeline.py` | Per-session ChromaDB collection, SentenceTransformer encode/query |
| **LLM client** | `core/llm_client.py` | Provider abstraction — Ollama REST or Gemini REST, identical signature |
| **Persistence** | `core/database.py` | SQLite connection factory, schema init, additive migration guards |
| **Prompts** | `app/prompts/*.txt` | Plain-text system prompts — tunable without touching Python code |

### 3.2 Frontend Pages and Their Data Dependencies

| Page | Route | Key Backend Calls | Notes |
|---|---|---|---|
| Landing | `/` | none | Static entry point |
| Dashboard | `/dashboard` | `GET /resumes`, `GET /analyses/{id}`, `GET /interviews`, `GET /interviews/{id}/feedback` | Aggregates all session data; real skill count from truthFacts |
| ResumeUpload | `/resume-analysis` | `POST /resumes/upload`, `GET /resumes/{id}/status` (polling) | Polling loop at 2 s intervals; navigates on `fast_completed` |
| AnalysisResults | `/analysis/:id` | `GET /resumes/{id}`, `GET /analyses/{id}` | `useAnalysisPolling` hook polls every 3 s while `fast_completed`; auto-populates profile |
| ResumeFeedback | `/analysis/:id/feedback` | `GET /analyses/{id}`, `PATCH /analyses/{id}/improvements`, `POST /tailor` | Four-tab editor (Experience/Skills/Education/Formatting); improvement states persisted to backend |
| InterviewModeSelect | `/interview` | `GET /resumes` | Requires a prior analyzed resume |
| InterviewRoom | `/interview/:sessionId` | `POST /interviews`, `POST /interviews/{id}/chat` | Chat UI, 5-question session, `wrap_up` on final answer |
| InterviewFeedback | `/interview/:sessionId/feedback` | `POST /interviews/{id}/score`, `GET /interviews/{id}/feedback` | Score breakdown with 2–4 concrete issues |
| JobMatch | `/job-match` | `POST /job-match` | Loads truthFacts from latest analyzed resume |
| Roadmap | `/roadmap` | `POST /roadmap`, `GET /roadmap/{id}/status`, `GET /roadmap/{id}` | Feeds missingSkills from JobMatch result |
| AnalysisHistory | `/analysis-history` | `GET /resumes` | Table of all past uploads |
| Profile | `/profile` | `profileService` (localStorage) | Auto-populated from truthFacts; no backend storage |

---

## 4. SQLite Schema

```sql
-- Stores each uploaded resume and its context
CREATE TABLE resumes (
    id          TEXT PRIMARY KEY,     -- "resume-{8-char hex}"
    filename    TEXT,
    targetRole  TEXT,
    careerLevel TEXT,                 -- 'student'|'recent grad'|'job seeker'|'career switch'
    uploadedAt  TEXT,                 -- unix timestamp as string
    jobDescription TEXT               -- optional; migrated in if column absent
);

-- Stores analysis results; written in two phases (fast then detailed)
CREATE TABLE analyses (
    id            TEXT PRIMARY KEY,   -- "analysis-{resumeId}"
    resumeId      TEXT,
    score         INTEGER,            -- 0–100
    status        TEXT,               -- 'Poor'|'Average'|'Good'|'Outstanding' (deterministic)
    breakdown     TEXT,               -- JSON: {content,impact,skills,experience,formatting,
                                      --        missing_keywords,keyword_source,verdict_reason}
    summary       TEXT,               -- detailed path
    strengths     TEXT,               -- JSON array, detailed path
    improvements  TEXT,               -- JSON array of {id,section,current,feedback,suggestion,status}
    truthFacts    TEXT,               -- JSON: {name,education,skills[],tools[],projects[]}
    analysisStatus TEXT DEFAULT 'completed'
                                      -- 'fast_completed'|'completed'|'error'
                                      -- (migrated in if column absent)
);

-- Stores each interview session
CREATE TABLE interviews (
    id                   TEXT PRIMARY KEY,  -- "interview-{8-char hex}"
    resumeId             TEXT,             -- links to resumes.id; migrated in if absent
    type                 TEXT,             -- 'HR'|'Technical'|'Resume-Based'
    status               TEXT,             -- 'in-progress'|'completed'
    startedAt            TEXT,             -- ISO 8601 UTC
    currentQuestionIndex INTEGER,
    questionsCount       INTEGER,          -- always 5
    chatHistory          TEXT              -- JSON array of {id,sender,text,timestamp}
);

-- Stores scored interview feedback (one row per session)
CREATE TABLE interview_feedback (
    id              TEXT PRIMARY KEY,  -- "fb-{sessionId}"
    sessionId       TEXT,
    type            TEXT,
    score           INTEGER,           -- 0–100 overall, clamped
    accuracy        INTEGER,           -- technical correctness
    communication   INTEGER,           -- clarity and structure
    confidence      INTEGER,           -- firmness of assertions
    feedbackSummary TEXT,
    issues          TEXT               -- JSON array of {id,type,description,suggestion}
);

-- Stores job match results
CREATE TABLE job_matches (
    id              TEXT PRIMARY KEY,  -- "match-{8-char hex}"
    resumeId        TEXT,
    targetRole      TEXT,
    matchPercentage INTEGER,
    matchingSkills  TEXT,              -- JSON array
    missingSkills   TEXT               -- JSON array
);

-- Stores career roadmaps
CREATE TABLE roadmaps (
    id            TEXT PRIMARY KEY,    -- "roadmap-{8-char hex}"
    targetRole    TEXT,
    missingSkills TEXT,                -- JSON array
    steps         TEXT                 -- JSON array of {month,title,focus,whyItMatters}
);
```

**Migration strategy:** `init_db()` uses `PRAGMA table_info` to check for the existence of additive columns (`jobDescription`, `analysisStatus`, `resumeId`) before issuing `ALTER TABLE … ADD COLUMN`. This means the app starts cleanly against a pre-existing database from any prior build phase without needing a migration framework.

---

## 5. Truth Guard System — Design and Rationale

### Why three steps instead of a single "don't hallucinate" instruction

A prompt instruction like "only mention skills from the resume" is trivially ignored by small local models (qwen2.5:1.5b at 1.5B parameters regularly produces plausible-but-fabricated tech terms when given open-ended generation tasks). Three steps make the grounding guarantee structural, not aspirational:

```
Step 1 — Extraction (truth_guard.py)
──────────────────────────────────────────────────────────────
Resume text  ──► LLM (truth_guard_extract.txt, 512 tok)
                 Prompt: "Do not invent anything. If it is
                  not in the text, do not include it."
                 ──► JSON: {skills[], tools[], projects[]}
                 Stored in analyses.truthFacts

Step 2 — Grounded generation (every LLM call in api/)
──────────────────────────────────────────────────────────────
The extracted facts JSON is injected verbatim into EVERY
downstream prompt (tailor, interview, analysis). Each prompt
instructs the model to reference ONLY items in that list.
This is a "soft" constraint — a well-prompted model honours
it most of the time, but not always.

Step 3 — Post-generation verification (grounding.py)
──────────────────────────────────────────────────────────────
Generated text  ──► verify_grounding(text, truth_facts)
  Scans for all 100+ terms in TECH_TERMS (curated lexicon)
  using regex word-boundary matching (no LLM involved).
  Any term found in the generated text but absent from the
  user's skills/tools facts is flagged as hallucinated.
  Bidirectional substring containment handles compound
  entries (e.g., "AWS (S3, EC2)" grounds the generated "ec2").
  Returns: {is_grounded: bool, hallucinations_caught: []}
```

Step 3 is the hard check — it catches what Steps 1 and 2 miss. The `force_hallucinate=True` test mode in `tailor.py` deliberately injects `"GraphQL"` and `"MongoDB"` into the prompt to verify the checker fires correctly. That test was run and passed during development.

---

## 6. Fast/Detailed Analysis Split — Design and Rationale

### The problem it solves

On 8 GB RAM with CPU-only qwen2.5:1.5b at ~10–11 tok/s, a single combined analysis prompt (score + full detailed feedback) would generate ~1,600–2,000 tokens, taking 145–180 seconds end-to-end. Keeping the user on a loading screen that long was not acceptable.

### The split

```
Single upload request
        │
        ├── Truth Guard extraction (512 tok cap)   ≈ 15–30 s
        │
        ├── FAST PATH (512 tok cap)                ≈ 45–60 s from extract end
        │   score, breakdown{5}, verdict_reason,
        │   missing_keywords
        │   → writes analysisStatus = 'fast_completed'
        │   → HTTP polling detects this → frontend NAVIGATES NOW
        │
        └── DETAILED PATH (1536 tok cap)           ≈ 60–90 s more (background)
            summary, strengths[], improvements[≤3]
            → writes analysisStatus = 'completed'
            → useAnalysisPolling() replaces skeleton UI with real data
```

The 512-token fast cap was calibrated against observed output: the score JSON is ~95–200 tokens. The 1536-token detailed cap replaced an earlier 1024 limit after testing showed large resumes produced truncated JSON (missing closing braces), which caused `_parse_json` to fail and left the improvements array empty.

**Why Truth Guard runs before both paths, not after:** the fast path's `missing_keywords` fallback (`TECH_TERMS` scan of the JD) and the fast path's score prompt both need the extracted facts for grounding. Running extraction once and sharing the result avoids a second LLM call and guarantees both paths are grounded in the same source of truth.

---

## 7. Dual LLM Provider Abstraction — Design and Rationale

### Interface

```python
# core/llm_client.py — identical call signature for all callers
def generate_completion(
    prompt: str,
    system: str = "",
    num_predict: int = 2048,
    timeout: int = 300
) -> str:
    if LLM_PROVIDER == "gemini":
        return _generate_gemini(prompt, system, num_predict, timeout)
    return _generate_ollama(prompt, system, num_predict, timeout)
```

Every feature module calls `generate_completion` with the same arguments. Neither the API routes nor the prompt files need to know which provider is active.

### Provider selection

```
LLM_PROVIDER=ollama  (default)
  → _generate_ollama()
  → POST http://localhost:11434/api/generate
  → model: qwen2.5:1.5b
  → keep_alive: 60m (keeps model loaded between requests)
  → fully offline, no API key

LLM_PROVIDER=gemini
  → _generate_gemini()
  → POST https://generativelanguage.googleapis.com/v1beta/
         models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}
  → uses urllib directly (not the google-genai SDK)
  → api_max_tokens = num_predict × 6
```

### Why urllib instead of the google-genai SDK for Gemini

The google-genai Python SDK uses `httpx` internally. On Windows, `httpx`'s SSL handshake consistently timed out during development (confirmed across multiple test runs). Switching to `urllib.request` — the same approach already used for the Ollama backend — resolved the issue completely with no code-size penalty. This is documented in `GEMINI_INTEGRATION_REPORT.md`.

### Why the 6× token multiplier for Gemini

Gemini thinking models (e.g., `gemini-3.5-flash`) allocate part of the `maxOutputTokens` budget to internal chain-of-thought reasoning (~1,500 tokens observed). Without compensation, a `num_predict=512` cap would leave only ~0 tokens for visible output. Multiplying by 6 gives the model enough total budget to complete its reasoning and still produce the full JSON response. The model stops naturally at `STOP` when done, so extra headroom does not cause rambling.

### Why `validate_provider()` runs at startup

A misconfigured Gemini deployment (wrong `LLM_PROVIDER` string, missing `GEMINI_API_KEY`) would otherwise silently succeed until the first resume upload, then fail mid-pipeline after the file has already been written and a database row has been started. Catching it at `on_event("startup")` surfaces the problem immediately and makes the root cause obvious in server logs.

---

## 8. RAG Pipeline Design

### Purpose

ChromaDB + SentenceTransformer serves a single, specific function: per-session interview context retrieval. For each chat turn, the user's message is encoded and the top-2 most semantically relevant facts (skill, tool, or project description) are retrieved and injected as `[RAG_CONTEXT]` in the interviewer's system prompt. This ensures the interviewer asks follow-up questions grounded in the specific skills most relevant to what the candidate just said.

### Session lifecycle

```
POST /api/interviews (session start)
  → initialize_interview_rag(session_id, truth_facts)
    → client.create_collection(name=session_id)  ← in-memory, keyed by session ID
    → encode all skills, tools, projects with all-MiniLM-L6-v2
    → collection.add(embeddings, documents, ids)

Per chat turn: get_interview_context(session_id, user_message, k=2)
  → encode user_message
  → collection.query(query_embeddings, n_results=2)
  → returns top-2 matching documents as newline-joined string
```

### Why in-memory ChromaDB

Interview sessions are ephemeral — the facts they are built from are already persisted in `analyses.truthFacts`. Persisting the vector store to disk would consume space proportional to the number of sessions and add startup I/O. In-memory ChromaDB is wiped on server restart, which is acceptable because the scoring pass reads from `chatHistory` in SQLite, not from the vector store.

### Why `k=2` for retrieval

Each interviewer message is capped at 50 words (by the prompt template). Injecting more than 2 context fragments would push the total prompt over the context budget of qwen2.5:1.5b's effective window at this token cap, causing the model to silently truncate the system prompt. Two fragments provide directional grounding without crowding the prompt.

---

## 9. Interview Scoring Design

The scoring pass is a separate LLM call (`score_interview` in `interview.py`), not a by-product of the conversation. This separation was deliberate:

- The conversation LLM (CHAT_NUM_PREDICT = 160) is tuned for fast, short responses — it cannot produce a structured multi-field JSON with 2–4 detailed issues within that cap.
- The scoring LLM (SCORING_NUM_PREDICT = 512) receives the full flattened transcript and the Truth Guard facts, so it can ground its technical-accuracy judgement in what the user actually claimed to know.
- `_validate_feedback` in `interview.py` normalizes the scoring JSON against the schema before writing to SQLite, clamping all integer fields to [0, 100] and skipping any `issues` entry that lacks a `description`. This prevents a malformed LLM response from writing a null or broken row.

---

## 10. Frontend Architecture

### Stack

- **React 19** with TypeScript and Vite (ESM-native build)
- **react-router-dom v7** for client-side routing
- **CSS Modules** for component-scoped styles (not Tailwind — the build uses `.module.css` files throughout)
- **lucide-react** for all icons
- No state management library — component-local `useState`/`useEffect` throughout; services are plain async functions in `src/services/`

### Key patterns

**Polling hooks:** `useAnalysisPolling` (in `src/hooks/`) polls `GET /api/analyses/{id}` every 3 seconds while `analysisStatus === 'fast_completed'`, replacing skeleton placeholder UI with real data when the detailed path completes. The upload page has its own inline polling loop (2 s interval) against `GET /api/resumes/{id}/status` that navigates to AnalysisResults on `fast_completed`.

**Service layer:** each feature area has a dedicated service module (`resumeService.ts`, `interviewService.ts`, `jobMatchService.ts`, `profileService.ts`, `recommendationService.ts`) that owns all `fetch` calls and error handling for that domain. Pages import services directly — no global store or context provider.

**Profile auto-population:** `profileService.autoPopulateFromResume(resume, analysis)` is called from `AnalysisResults` once the analysis is loaded. It reads `analysis.truthFacts` and writes non-empty fields to localStorage (name, education, skills, tools). The call is idempotent — it never overwrites a field that already has a value, so manually edited profile data is preserved.

**Section normalization at the API boundary:** improvement `section` values are normalized by `_normalize_section` in `main.py` before any JSON is returned from `GET /api/analyses/{id}` or `PATCH /api/analyses/{id}/improvements`. The frontend never sees a raw LLM-generated section string — it always receives one of the four canonical tab values (`Experience`, `Skills`, `Education`, `Formatting`).

---

## 11. Key Implementation Decisions Summary

| Decision | What was decided | Why |
|---|---|---|
| Fast/detailed analysis split | Two separate LLM calls, first releases the frontend | Single combined call takes 145–180 s on CPU; first call is ~95 tokens so 512-token cap keeps it fast |
| `num_predict` per call | fast=512, detailed=1536, chat=160, scoring=512, extract=512, tailor=512 | Each cap is calibrated to observed output size; tight caps bound worst-case CPU latency |
| Truth Guard as 3 steps | Extract → grounded prompt → deterministic post-gen scan | Prompt-only grounding is unreliable on small models; deterministic regex provides a hard guarantee |
| Dual LLM provider via env var | `LLM_PROVIDER=ollama` (default) or `gemini` | Local dev/demo needs zero external dependencies; deployment needs speed; same codebase serves both |
| urllib for Gemini (not SDK) | Direct REST via `urllib.request` | google-genai SDK uses httpx which had SSL handshake failures on Windows during development |
| 6× token multiplier for Gemini | `api_max_tokens = num_predict × 6` | Thinking models spend ~1,500 tokens on internal reasoning; compensation ensures visible output is complete |
| In-memory ChromaDB | `chromadb.Client()` (ephemeral) | Interview facts are already in SQLite; no need to persist the vector index across restarts |
| SQLite over Firebase | Local file database | Offline-first requirement; no cloud dependency; zero configuration |
| Additive migration guards | `PRAGMA table_info` before `ALTER TABLE` | Allows the app to start against any prior-build database without a migration framework |
| Section normalization in API serializer | `_normalize_section` in `main.py` on every GET/PATCH | Prevents LLM section-name drift from making improvements invisible in the four-tab editor |
| Score normalization in API layer | Deterministic `≥85/70/50` thresholds after LLM call | Small models produce inconsistent label/score pairs; post-hoc normalization makes the badge honest |
| Startup validation + warmup | `validate_provider()` + background warmup thread | Fail fast on misconfiguration; amortize SentenceTransformer + Ollama cold-load over server start |
