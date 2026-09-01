# Nexora

**An honest AI career coach that never invents skills you don't have.**

Nexora analyzes your resume, tailors your bullets, runs mock interviews scoped to your actual experience, scores your performance, and builds a learning roadmap — all grounded in what you actually wrote on your resume, not what an AI thinks you should have.

---

## The Problem

Fresh graduates and early-career candidates run into the same three walls:

1. **Resume blindness** — they can't tell why their application was rejected, whether their resume passes ATS screening, or which keywords are missing for a specific role.
2. **Generic feedback** — most AI tools respond with encouragement instead of the evidence-based critique recruiters actually apply: weak impact statements, missing keywords, projects that can't be defended under questioning.
3. **Interview uncertainty** — candidates don't know what questions to expect, how answers are evaluated, or how to improve between attempts.

Nexora's response to all three is the same: **be specific, be honest, and stay grounded in what the user actually has.** The Truth Guard system (see Architecture below) is what makes that guarantee structural rather than aspirational.

---

## Key Features

| Feature | What it does |
|---|---|
| **Resume Analysis** | ATS compatibility score (0–100), five-dimension breakdown (content, impact, skills, experience, formatting), missing keywords vs. a pasted job description or target role, one-sentence recruiter verdict with a stated reason |
| **Resume Tailoring** | Rewrites your experience bullets to better match a target role, using only skills and projects you actually listed — every output is verified by a post-generation grounding check before it reaches you |
| **Mock Interview — HR** | Behavioral and situational questions ("Tell me about a time…"); evaluates communication structure and confidence, not technical depth |
| **Mock Interview — Technical** | Domain/technical questions scoped strictly to your verified skill set — will not ask about technology you didn't claim to know |
| **Mock Interview — Resume-Based** | Project-by-project audit; picks a specific entry from your resume and makes you defend your role, decisions, and outcomes |
| **Interview Scoring** | Post-session scoring across technical accuracy, communication, and confidence; each issue references what you actually said and gives a concrete fix |
| **Job Match** | Compares your extracted skills against a specific job description and returns a match percentage with matching and missing skill lists |
| **Career Roadmap** | Given your missing skills and target role, generates a month-by-month learning plan with focus areas and explanations of why each step matters |

---

## Architecture

### Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                   React 19 Frontend (Vite + TS)                   │
│  Landing · Dashboard · ResumeUpload · AnalysisResults ·           │
│  ResumeFeedback · InterviewRoom · JobMatch · Roadmap · Profile    │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTP/REST  (port 8000)
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python)                        │
│  Background tasks · SQLite persistence · Progress polling         │
└──────┬───────────────────────────────────────────┬───────────────┘
       │                                           │
       ▼                                           ▼
┌─────────────────────┐                 ┌──────────────────────┐
│    AI Pipeline      │                 │  SQLite (nexora.db)   │
│  pdf_parser.py      │                 │  resumes             │
│  truth_guard.py     │                 │  analyses            │
│  rag_pipeline.py    │                 │  interviews          │
│  grounding.py       │                 │  interview_feedback  │
│  llm_client.py      │                 │  job_matches         │
└──────┬──────────────┘                 │  roadmaps            │
       │                                └──────────────────────┘
       ├── SentenceTransformer (all-MiniLM-L6-v2)
       │        └── ChromaDB (in-memory, per-session)
       │
       └── LLM Provider  ←── LLM_PROVIDER env var
                ├── ollama  →  localhost:11434  [qwen2.5:1.5b, fully offline]
                └── gemini  →  generativelanguage.googleapis.com  [cloud]
```

### The Two-Path Pipeline

Every resume upload splits down two parallel paths before anything reaches the LLM:

```
PDF / DOCX
    │
    ▼
extract_resume_text()        ← PyMuPDF (PDF) or python-docx (DOCX)
    │
    ├──► PATH A: Truth Guard Extraction
    │        truth_guard.py → LLM (512 tok)
    │        → { name, education, skills[], tools[], projects[] }
    │        → stored as analyses.truthFacts
    │        → grounds every downstream LLM call
    │
    └──► PATH B: RAG Embedding
             rag_pipeline.py → SentenceTransformer (all-MiniLM-L6-v2)
             → per-session ChromaDB collection
             → top-2 relevant facts retrieved per interview turn
             → injected as [RAG_CONTEXT] in interviewer system prompt
```

Both outputs feed into every downstream LLM call. The analysis prompts receive the extracted facts verbatim. The interview prompts receive both the facts and the RAG-retrieved context most relevant to the candidate's last message.

### Truth Guard — 3-Step Grounding System

The core honesty guarantee. A prompt instruction alone ("don't invent skills") is unreliable on small local models. Truth Guard makes the constraint structural:

**Step 1 — Extraction** (`truth_guard.py`)  
A dedicated LLM pass over the resume text produces a structured JSON fact list: `{name, education, skills[], tools[], projects[]}`. The extraction prompt explicitly forbids invention: *"Do not invent anything. If it is not in the text, do not include it."*

**Step 2 — Grounded generation** (all `api/` modules)  
The extracted facts are injected verbatim into every downstream prompt — tailoring, analysis, and all three interview modes. Each prompt is instructed to reference only items from that list. The Technical interview prompt adds a hard constraint: *"HARD CONSTRAINT: only ask about skills, tools, or technologies that appear in the candidate's verified facts below. Never invent a tech stack the candidate has not claimed."*

**Step 3 — Post-generation verification** (`grounding.py`)  
After generation, `verify_grounding()` scans the output against a curated lexicon of 100+ technology terms (`TECH_TERMS` — languages, frameworks, databases, cloud tools, DevOps, testing methodologies). Any term found in the generated text but absent from the user's extracted facts is flagged as ungrounded and returned to the caller as `hallucinations_caught`. This check is entirely deterministic — no LLM involved.

This was validated with a deliberate injection test: the tailoring prompt was forced to include "GraphQL" and "MongoDB" for a candidate who had neither. Both were caught by Step 3.

### Fast-Path / Detailed-Path Analysis Split

On CPU-only hardware running `qwen2.5:1.5b` at ~10–11 tokens/second, a single combined analysis prompt would generate ~1,600–2,000 tokens, taking 145–180 seconds end-to-end. Holding the user on a loading screen that long is not acceptable.

The pipeline splits the work:

```
Upload
  │
  ├── Truth Guard extraction (512 tok)       ← ~15–30 s
  │
  ├── FAST PATH (512 tok cap)                ← ~45–60 s from extraction end
  │   Score (0–100), verdict reason,
  │   5-dimension breakdown, missing keywords
  │   → writes analysisStatus = 'fast_completed'
  │   → frontend polling detects this → navigates to results NOW
  │
  └── DETAILED PATH (1536 tok cap, background)  ← ~60–90 s more
      Summary, strengths[], improvements[≤3]
      → writes analysisStatus = 'completed'
      → frontend polling replaces skeleton UI with real data
```

The 512-token fast cap was calibrated against observed output (~95–200 tokens). The 1536-token detailed cap replaced an earlier 1024 limit after testing showed large resumes produced truncated JSON.

### Dual LLM Backend

Both modes are first-class and fully tested. Neither is a fallback.

**Ollama mode** (`LLM_PROVIDER=ollama`, default)
- Runs `qwen2.5:1.5b` via a local Ollama server on `localhost:11434`
- Fully offline — no API key, no data leaves the machine
- Recommended for local development and privacy-sensitive use
- `keep_alive: 60m` keeps the model loaded between requests to avoid cold-load penalty on each call

**Gemini mode** (`LLM_PROVIDER=gemini`)
- Calls Google's Generative AI REST API (`gemini-3.5-flash` by default)
- Requires internet and a `GEMINI_API_KEY`
- Uses `urllib` directly (not the google-genai SDK) to avoid httpx SSL handshake issues on Windows
- Token budget is multiplied by 6x for API calls to compensate for thinking-model internal reasoning tokens (~1,500 tokens of reasoning on top of visible output)
- Required for deployment on hosting platforms that can't run a local model

Both modes share an identical `generate_completion(prompt, system, num_predict, timeout)` interface. No application code knows which provider is active — the abstraction is in `core/llm_client.py`.

The provider is validated at startup (`validate_provider()`). A misconfigured Gemini deployment — wrong provider name, missing API key — raises a `RuntimeError` before any request is served, not on the first upload.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19 + TypeScript | CSS Modules for styles, lucide-react for icons, Vite build |
| Routing | react-router-dom v7 | Client-side SPA routing |
| Backend | FastAPI (Python) | Async endpoints, `BackgroundTasks` for long-running analysis |
| LLM — local | Ollama + qwen2.5:1.5b | Fully offline, ~10–11 tok/s on CPU-only hardware |
| LLM — cloud | Google Gemini API (gemini-3.5-flash) | Cloud deployment mode, requires API key |
| Embeddings | Sentence-Transformers (all-MiniLM-L6-v2) | Encodes resume facts for per-session RAG retrieval |
| Vector store | ChromaDB | In-memory, per-session interview context retrieval |
| PDF parsing | PyMuPDF | Page-by-page text extraction |
| DOCX parsing | python-docx | Paragraph + table cell extraction |
| Database | SQLite | Local file (`nexora.db`), auto-created on first startup |
| Grounding | Custom (`grounding.py`) | Deterministic regex scan, 100+ term TECH_TERMS lexicon, no LLM |

---

## Running Locally — Ollama Mode (fully offline)

This mode requires no API keys and sends no data to any external service.

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com) installed and running

### 1. Pull the model

```bash
ollama pull qwen2.5:1.5b
```

This downloads ~1 GB. Ollama must be running before you start the backend.

### 2. Clone and set up the backend

```bash
git clone <repo-url>
cd Nexora/backend

# Create and activate a virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure environment

```bash
# Copy the example file
cp .env.example .env
```

The default `.env.example` already sets `LLM_PROVIDER=ollama` — no changes needed for local Ollama mode.

### 4. Start the backend

```bash
uvicorn app.main:app --reload
```

The server starts on `http://localhost:8000`. On first startup it:
- Creates `nexora.db` with all six tables
- Loads the SentenceTransformer model into memory (~90 MB)
- Sends a warmup ping to Ollama to load `qwen2.5:1.5b`

Expect ~15–30 seconds before the warmup completes and the first analysis request will be fast.

### 5. Set up and start the frontend

```bash
cd ../frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Running with Gemini — Cloud Mode

Use this if you don't want to install Ollama or need faster inference.

### 1. Get a Gemini API key

Go to [Google AI Studio](https://aistudio.google.com/apikey) and create a free API key.

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash
```

### 3. Start backend and frontend

Same commands as Ollama mode:

```bash
uvicorn app.main:app --reload   # backend
npm run dev                      # frontend (in a separate terminal from frontend/)
```

**Note:** Gemini mode sends resume text and prompts to Google's Generative AI API. Review [Google's data policies](https://ai.google.dev/terms) before processing sensitive personal data in this mode.

---

## Live Deployment

The project is deployed in split configuration:

| Service | Platform | Notes |
|---|---|---|
| Backend (FastAPI) | [Render](https://render.com) | Persistent web service, `LLM_PROVIDER=gemini` |
| Frontend (static) | [Vercel](https://vercel.com) | Serves the `npm run build` output |

**Live URL:** [DEPLOYED_URL_HERE]

Production runs in Gemini mode because hosting platforms cannot run a local Ollama model. Ollama mode is the recommended way to run the project locally for full offline and private operation.

### Backend start command (Render)

```bash
cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Frontend build command (Vercel)

```bash
cd frontend && npm run build
# Output: frontend/dist/
```

---

## Environment Variables

All variables are read by the backend. Copy `backend/.env.example` to `backend/.env` and fill in the values relevant to your chosen mode.

| Variable | Description | Ollama mode | Gemini mode |
|---|---|---|---|
| `LLM_PROVIDER` | LLM backend to use: `"ollama"` or `"gemini"`. Defaults to `"ollama"` if not set. | Set to `ollama` | Set to `gemini` |
| `GEMINI_API_KEY` | Your Google AI Studio API key. Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). | Not required | **Required** |
| `GEMINI_MODEL` | Gemini model name to use. Defaults to `gemini-3.5-flash` (verified working). | Not used | Optional override |

The backend validates provider configuration at startup and raises a clear error if `LLM_PROVIDER=gemini` is set without a `GEMINI_API_KEY`.

---

## Project Structure

```
Nexora/
├── backend/
│   ├── app/
│   │   ├── api/          # Route handlers: resume.py, interview.py, tailor.py,
│   │   │                 #   job_match.py, roadmap.py
│   │   ├── core/         # AI pipeline: pdf_parser, truth_guard, rag_pipeline,
│   │   │                 #   grounding, llm_client, database
│   │   ├── models/       # Pydantic schemas (schemas.py)
│   │   ├── prompts/      # Plain-text LLM system prompts (*.txt) — tunable
│   │   │                 #   without touching Python code
│   │   ├── temp/         # Uploaded file landing directory (gitignored contents)
│   │   └── main.py       # FastAPI app, CORS, startup hooks, all route wiring
│   ├── .env.example      # Environment variable template (safe to commit)
│   └── requirements.txt  # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── pages/        # One folder per route: Dashboard, ResumeUpload,
│   │   │                 #   AnalysisResults, ResumeFeedback, InterviewRoom,
│   │   │                 #   JobMatch, Roadmap, Recommendations, Profile, etc.
│   │   ├── components/   # Shared UI: charts/, layout/, ui/
│   │   ├── services/     # API client modules: resumeService, interviewService,
│   │   │                 #   jobMatchService, profileService, recommendationService
│   │   ├── hooks/        # useAnalysisPolling — live polling for async analysis
│   │   ├── types/        # TypeScript interfaces for all API shapes
│   │   └── styles/       # Global CSS variables and base styles
│   ├── public/           # Static assets (favicon, icon sprite)
│   └── package.json
│
├── .kiro/
│   └── specs/            # Spec-driven development documents (see below)
│       ├── requirements.md
│       ├── design.md
│       └── tasks.md
│
├── .gitignore
├── requirements.md       # Original product requirements document
└── README.md
```

---

## Built With Kiro

This project was built using [Kiro](https://kiro.dev)'s spec-driven development workflow. The `.kiro/specs/` folder contains the full documentation produced before and during the build:

- **`requirements.md`** — 15 functional requirements as user stories with concrete, code-grounded acceptance criteria; 7 non-functional requirements covering performance, privacy, portability, and groundedness
- **`design.md`** — Technical architecture, full data-flow diagram, SQLite schema, and a detailed rationale for each key implementation decision (the fast/detailed split, the Truth Guard 3-step design, the dual-LLM abstraction, the urllib-over-SDK choice for Gemini)
- **`tasks.md`** — ~70-task implementation checklist organized by feature area, all marked completed

The spec-driven process directly shaped two architectural decisions that wouldn't have emerged from just writing code: the fast/detailed pipeline split (writing testable latency acceptance criteria exposed that a single combined prompt was too slow) and the dual-LLM abstraction (the design phase required documenting the provider interface before any integration code was written, making the Gemini addition a clean swap rather than a retrofit).

---

## Known Limitations

- **Ollama inference speed** — On 8 GB RAM, CPU-only hardware with `qwen2.5:1.5b` at ~10–11 tok/s: the fast path (score + keywords) takes ~60–90 s; the full pipeline (including detailed feedback) takes ~140–175 s. Interview chat turns are faster (~5 s) due to a tighter 160-token cap. Gemini mode is substantially faster (~5–15 s per analysis call) but requires internet and an API key.

- **Gemini free-tier quota** — The free tier is limited to 20 requests/day per model. Sustained use or demos with multiple resume uploads will exhaust this quickly. Enable billing on your Google Cloud project for higher limits.

- **Render free-tier ephemeral disk** — Render's free web service tier does not provide a persistent disk. The `nexora.db` file is recreated empty on each redeploy or instance restart. For persistent session history on the live deployment, you'd need Render's paid persistent disk add-on or a swap to a managed Postgres instance.

- **Resume parsing accuracy** — The text extractor is tuned for standard single-column resume layouts. Heavily designed, multi-column, or heavily graphics-based resumes may extract with reduced accuracy, which degrades everything downstream.

- **No authentication** — Nexora is a single-user, local-first tool by design. There are no accounts, login, or per-user data isolation. All data in the SQLite database is globally accessible to anyone with access to the running instance.
