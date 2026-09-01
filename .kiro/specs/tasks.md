# Nexora — Implementation Task Checklist

All tasks are **completed**. The system is fully built and verified as of August 2026.

Tasks are organized by feature area matching the FR groupings in `requirements.md`. Within each area, tasks follow the build sequence: infrastructure before logic, logic before UI, UI before integration.

---

## Phase 0 — Foundation and Risk Validation

- [x] Install Ollama and verify `qwen2.5:1.5b` runs at usable inference speed on the target 8 GB RAM, CPU-only hardware (~10–11 tok/s confirmed)
- [x] Set up FastAPI project skeleton (`backend/app/main.py`, CORS middleware, `/health` endpoint)
- [x] Configure `.env` + `.env.example` with `LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL` placeholders
- [x] Set up Python virtual environment and `requirements.txt` (`fastapi`, `uvicorn`, `pymupdf`, `python-docx`, `sentence-transformers`, `chromadb`, `langchain`, `python-multipart`, `google-genai`, `python-dotenv`)
- [x] Define the full API contract (all endpoint shapes) up front — `POST /api/resumes/upload`, `GET /api/resumes/{id}/status`, `GET /api/analyses/{id}`, `PATCH /api/analyses/{id}/improvements`, `POST /api/tailor`, `POST /api/job-match`, `POST /api/roadmap`, `GET /api/roadmap/{id}/status`, `POST /api/interviews`, `POST /api/interviews/{id}/chat`, `POST /api/interviews/{id}/score`, `GET /api/interviews/{id}/feedback`
- [x] Scaffold SQLite schema (`core/database.py`): six tables (`resumes`, `analyses`, `interviews`, `interview_feedback`, `job_matches`, `roadmaps`), `init_db()` idempotent creation, `get_db()` connection factory

---

## Phase 1 — Parsing and Truth Guard Core (FR-1, FR-2, FR-6)

- [x] Implement `core/pdf_parser.py`: `extract_text_from_pdf` via PyMuPDF (page iteration), `extract_text_from_docx` via python-docx (paragraphs + table cells), `extract_resume_text` dispatcher on file extension
- [x] Write `app/prompts/truth_guard_extract.txt`: structured extraction prompt with hard "do not invent" instruction, JSON schema `{name, education, skills[], tools[], projects[]}`
- [x] Implement `core/truth_guard.py`: `extract_truth_guard_facts` — LLM call at 512-token cap, markdown-wrapper stripping, `json.loads` parse, graceful fallback to `{"raw_extraction": response}` on failure
- [x] Implement `POST /api/resumes/upload` endpoint: multipart form (`file`, `targetRole`, `careerLevel`, `jobDescription`), UUID-based `resumeId`, temp file write, `resumes` row insert, `BackgroundTasks` dispatch
- [x] Implement `GET /api/resumes/{id}/status` polling endpoint: reads from `_progress_store` in-memory dict
- [x] Implement `GET /api/resumes` and `GET /api/resumes/{id}` list/detail endpoints

---

## Phase 2 — Resume Analysis Pipeline (FR-3, FR-4, FR-5)

- [x] Write fast-path system prompt in `api/resume.py` (`_fast_system`): requires `score_data` (score, status, verdict_reason, breakdown{5 dims}) and `missing_keywords`; JD-aware vs. role-only instruction branches; "MUST list at least 3–8 specific missing keywords" instruction
- [x] Write `app/prompts/` entries referenced by `DETAILED_SYSTEM`: four canonical section values defined explicitly; max 3 improvements instruction
- [x] Implement `analyze_resume_fast` (async, `asyncio.get_event_loop().run_in_executor`, 512-token cap): fast path LLM call, `_parse_json` with markdown stripping
- [x] Implement `analyze_resume_detailed` (async, 1536-token cap — increased from 1024 after truncated-JSON failures on large resumes)
- [x] Implement `run_async_analysis` background coroutine in `main.py`: extraction → fast → detailed sequence, progress stage tracking in `_progress_store`, `analysisStatus` two-phase write (`fast_completed` then `completed`/`error`), error row fallback for pre-fast failures
- [x] Implement deterministic score normalization: `≥85 → Outstanding`, `≥70 → Good`, `≥50 → Average`, `<50 → Poor` (overwrites LLM-assigned label)
- [x] Implement deterministic missing-keyword fallback: when `missing_keywords` is empty but a JD was provided, scan JD text against `TECH_TERMS` lexicon and populate up to 10 keywords with casing from `DISPLAY_NAMES`
- [x] Implement one-retry logic for fast-path JSON parse failure; write `analysisStatus = 'error'` after second failure
- [x] Implement `_normalize_section` in `main.py`: deterministic mapping of free-form section strings to canonical `Experience`/`Skills`/`Education`/`Formatting` via substring rules
- [x] Implement `_analysis_response` serializer in `main.py`: applies section normalization, parses `truthFacts`, exposes `analysisStatus` on every `GET /api/analyses/{id}` response
- [x] Implement `GET /api/analyses/{id}` endpoint
- [x] Implement improvement-status persistence: `PATCH /api/analyses/{resume_id}/improvements` — validates `status` in `{applied, dismissed, pending}`, reads/mutates/writes the improvements JSON array, returns updated analysis

---

## Phase 3 — Truth Guard Grounding System (FR-8)

- [x] Implement `core/grounding.py`: curate `TECH_TERMS` set (100+ technology terms across languages, frameworks, databases, cloud, DevOps, testing, methodologies)
- [x] Build `DISPLAY_NAMES` map for proper casing of terms where `.title()` or `.upper()` would produce wrong output (e.g., `"tensorflow" → "TensorFlow"`, `"ci/cd" → "CI/CD"`)
- [x] Implement `verify_grounding(generated_text, truth_facts)`: regex word-boundary scan over `TECH_TERMS`, bidirectional substring containment check against `skills` + `tools` facts, returns `{is_grounded, hallucinations_caught[]}`
- [x] Verify grounding check with `force_hallucinate=True` test in `tailor.py`: injecting `"GraphQL"` and `"MongoDB"` into the prompt confirmed caught by the checker

---

## Phase 4 — Resume Tailoring (FR-7)

- [x] Write `app/prompts/tailor_resume.txt`: explicit "ONLY use skills, tools, and projects that exist in the provided Extracted Facts. Do NOT invent or hallucinate" instruction; `{tailored_bullets: [{original, tailored}]}` output schema
- [x] Implement `api/tailor.py`: `generate_tailored_resume(target_role, extracted_facts, job_description, force_hallucinate)` — LLM call at 512-token cap, JSON parse, `verify_grounding` post-generation check, returns `{tailored_data, grounding_result, timing_seconds}`
- [x] Implement `POST /api/tailor` endpoint in `main.py`: validates `resumeId` has non-error `analysisStatus` and non-empty `truthFacts`, loads `targetRole` and `jobDescription` from `resumes`, calls `generate_tailored_resume`, returns `{resumeId, targetRole, tailoredBullets, grounding}`, HTTP 502 on unreadable output

---

## Phase 5 — Mock Interview System (FR-9, FR-10, FR-11, FR-12)

- [x] Write `app/prompts/interview_hr.txt`: behavioral/situational style, communication/confidence judging, "do not turn this into a technical quiz", one question per message, under 50 words, `[TARGET_ROLE]` / `[FACTS]` / `[RAG_CONTEXT]` placeholders
- [x] Write `app/prompts/interview_technical.txt`: domain/technical questions, hard constraint "only ask about skills, tools, or technologies that appear in the candidate's verified facts below", push-deeper instruction, one question / under 50 words
- [x] Write `app/prompts/interview_resume.txt`: project-by-project audit mode, "pick one project or experience entry, name it explicitly", stay on same project until satisfied, "if an answer contradicts or exceeds what the resume claims, point it out", one question / under 50 words
- [x] Write `app/prompts/interview_scoring.txt`: full transcript evaluation, "Judge ONLY what the candidate actually said", issues must reference actual words, four integer scores (score/accuracy/communication/confidence), 2–4 issues with type/description/suggestion
- [x] Implement `core/rag_pipeline.py`: `get_rag_model()` singleton SentenceTransformer (`all-MiniLM-L6-v2`), `get_chroma_client()` singleton in-memory ChromaDB client, `initialize_interview_rag(session_id, truth_facts)` collection creation + fact embedding, `get_interview_context(session_id, query, k=2)` retrieval
- [x] Implement `api/interview.py`: `_facts_summary` compact facts renderer, `_system_prompt` mode-branched template loader with RAG injection, `start_interview_session` (ChromaDB init), `generate_opening_question` (CHAT_NUM_PREDICT=160), `chat_turn` (last-4-messages history, `wrap_up` close instruction), `_parse_json`, `_clamp_score`, `_validate_feedback`, `score_interview` (SCORING_NUM_PREDICT=512)
- [x] Implement `POST /api/interviews` endpoint: validates `type` in `{HR, Technical, Resume-Based}`, loads `truthFacts`, initializes RAG, generates opening question, writes session row with `questionsCount=5`
- [x] Implement `POST /api/interviews/{id}/chat` endpoint: loads session + truth facts, computes `answered` count, sets `wrap_up` flag when answers reach `questionsCount`, appends user + AI messages to `chatHistory`, updates `status` and `currentQuestionIndex`
- [x] Implement `POST /api/interviews/{id}/score` endpoint: idempotent (returns existing feedback if present), validates ≥1 candidate answer, calls `score_interview`, writes `interview_feedback` row, marks session `completed`
- [x] Implement `GET /api/interviews`, `GET /api/interviews/{id}`, `GET /api/interviews/{id}/feedback` endpoints

---

## Phase 6 — Job Match and Roadmap (FR-13, FR-14)

- [x] Write `app/prompts/job_match.txt`: recruiter/ATS comparison prompt, `{matchPercentage, matchingSkills[], missingSkills[]}` output schema, no markdown
- [x] Implement `api/job_match.py`: `analyze_job_match(truth_facts, target_role, job_description)` — LLM call (default token cap), JSON parse, returns `{match_data, timing_seconds}`
- [x] Implement `POST /api/job-match` endpoint: loads `truthFacts` from `analyses`, calls `analyze_job_match`, writes `job_matches` row, returns match data
- [x] Write `app/prompts/roadmap.txt`: Senior Engineering Manager mentor persona, month-by-month JSON `{steps: [{month, title, focus, whyItMatters}]}`, no markdown
- [x] Implement `api/roadmap.py`: `generate_roadmap(target_role, missing_skills)` — LLM call, JSON parse, returns `{roadmap_data, timing_seconds}`
- [x] Implement `POST /api/roadmap` endpoint with background task, `GET /api/roadmap/{id}/status` polling, `GET /api/roadmap/{id}` retrieval; writes `roadmaps` row

---

## Phase 7 — SQLite Migrations and Session History (FR-15)

- [x] Add `jobDescription` column migration guard in `init_db()`: `PRAGMA table_info(resumes)` check before `ALTER TABLE resumes ADD COLUMN jobDescription TEXT`
- [x] Add `analysisStatus` column migration guard: `PRAGMA table_info(analyses)` check before `ALTER TABLE analyses ADD COLUMN analysisStatus TEXT DEFAULT 'completed'` (legacy rows default to `completed`)
- [x] Add `resumeId` column migration guard for `interviews`: `PRAGMA table_info(interviews)` check before `ALTER TABLE interviews ADD COLUMN resumeId TEXT`
- [x] Verify all `get_db()` calls use `try/finally conn.close()` to prevent SQLite write-lock leaks across the pipeline
- [x] Implement `GET /api/resumes` (all resumes, `ORDER BY uploadedAt DESC`) for history listing

---

## Phase 8 — Dual LLM Provider Abstraction (NFR-2)

- [x] Implement `core/llm_client.py`: `LLM_PROVIDER` env var read at import time, `OLLAMA_MODEL = "qwen2.5:1.5b"`, `GEMINI_MODEL` from env (default `"gemini-3.5-flash"`), `validate_provider()` startup check
- [x] Implement `_generate_ollama`: urllib POST to `localhost:11434/api/generate`, `keep_alive: "60m"`, `num_predict` option, timing log
- [x] Implement `_generate_gemini`: urllib REST POST (not google-genai SDK — avoids httpx SSL failures on Windows), `api_max_tokens = num_predict × 6` (thinking model compensation), `systemInstruction` mapping, error handling for HTTP 403/429/503/404
- [x] Wire `validate_provider()` into `app.on_event("startup")` — misconfigured provider raises `RuntimeError` before any request is served
- [x] Implement startup warmup thread: `get_rag_model()` cold load + optional Ollama warmup ping in background thread to amortize first-request latency

---

## Phase 9 — Frontend Foundation

- [x] Scaffold React 19 + TypeScript + Vite project (`frontend/`)
- [x] Configure CSS Modules for component-scoped styles (no Tailwind dependency)
- [x] Install dependencies: `react`, `react-dom`, `react-router-dom@7`, `lucide-react`
- [x] Set up `src/routes/AppRoutes.tsx`: `BrowserRouter` with `AppLayout` wrapper for all authenticated routes
- [x] Build `AppLayout` with `Sidebar` and `Topbar` layout components
- [x] Build shared UI component library: `Card`, `Button`, `Badge`, `ProgressBar`, `ScoreCard`, `RadialScore` (SVG radial chart)
- [x] Build `src/services/resumeService.ts`: `getResumes`, `getResume`, `getAnalysis`, `uploadResume`, `updateImprovementStatus`, `tailorResume`
- [x] Build `src/services/interviewService.ts`: `getSessions`, `getSession`, `createSession`, `submitMessage`, `getFeedback`, `scoreSession`
- [x] Build `src/services/jobMatchService.ts`, `recommendationService.ts`, `profileService.ts`
- [x] Define TypeScript types in `src/types/`: `Resume`, `ResumeAnalysis`, `ImprovementItem`, `InterviewSession`, `InterviewFeedback`, `TailorResult`, `JobMatch`, `Roadmap`

---

## Phase 10 — Frontend Feature Pages

- [x] Build `pages/Landing/Landing.tsx`: static landing page with product pitch and CTA
- [x] Build `pages/Dashboard/Dashboard.tsx`: four KPI stat cards (Resume Score, Interview Readiness, Skills Tracked from truthFacts, Action Items from recommendations), Resume Health breakdown bars, AI Insight card, Recent Activity feed combining resumes + interview sessions
- [x] Build `pages/ResumeUpload/ResumeUpload.tsx`: drag-and-drop + file browser upload zone, `careerLevel` dropdown, `targetRole` input, optional `jobDescription` textarea, polling loop with progress stage labels and elapsed timer, navigation to AnalysisResults on `fast_completed`
- [x] Build `pages/AnalysisResults/AnalysisResults.tsx`: RadialScore chart, verdict banner with `verdictReason`, five-dimension breakdown bars, missing-keyword chips with JD vs. role-name source label, `useAnalysisPolling` hook for live skeleton-to-data transition as detailed path completes
- [x] Build `pages/ResumeFeedback/ResumeFeedback.tsx`: four-tab editor (Experience/Skills/Education/Formatting), improvement cards with applied/dismissed toggles (persisted via PATCH endpoint), resume tailoring panel with grounding result display
- [x] Build `pages/InterviewRoom/InterviewModeSelect.tsx`: mode selection UI (HR / Technical / Resume-Based) with description per mode
- [x] Build `pages/InterviewRoom/InterviewRoom.tsx`: real-time chat UI, question progress indicator (current/total), user input with submit, AI response rendering
- [x] Build `pages/InterviewRoom/InterviewFeedback.tsx`: four-score display (overall/accuracy/communication/confidence) + concrete issue list
- [x] Build `pages/JobMatch/JobMatch.tsx`: job description paste input, match percentage display, matching/missing skills chips
- [x] Build `pages/Roadmap/Roadmap.tsx`: month-by-month step cards with polling for background generation
- [x] Build `pages/Recommendations/Recommendations.tsx`: derived action items from analysis and interview data
- [x] Build `pages/AnalysisHistory/AnalysisHistory.tsx`: table of all past resume uploads with scores and dates
- [x] Build `pages/Profile/Profile.tsx`: auto-populated profile view from Truth Guard facts (localStorage, idempotent write)
- [x] Build `pages/NotFound/NotFound.tsx`: 404 fallback route inside `AppLayout`

---

## Phase 11 — Integration, Polish, and Verification

- [x] Implement `src/hooks/useAnalysisPolling.ts`: polls `GET /api/analyses/{id}` every 3 s while `analysisStatus === 'fast_completed'`, stops on `completed` or `error`
- [x] Implement `profileService.autoPopulateFromResume`: reads `analysis.truthFacts`, writes non-null fields to localStorage without overwriting existing values
- [x] Implement `recommendationService.buildRecommendations`: derives action items from analysis missing keywords and interview feedback issues
- [x] Wire Dashboard "Skills Tracked" to real truth-facts count (skills + tools, case-insensitive de-duplication)
- [x] Wire Dashboard "Interview Readiness" to real average score from `interview_feedback` rows
- [x] Wire Dashboard "Action Items" to real pending-recommendations count
- [x] Fix detailed-path token cap (1024 → 1536) after truncated-JSON parse failures on larger resumes
- [x] Add `try/finally conn.close()` guards to all SQLite connection sites to prevent write-lock leaks under concurrent requests
- [x] Add error-row fallback in `run_async_analysis` for pre-fast-phase failures (PDF parse error, Truth Guard failure) — ensures every upload reaches a terminal `analysisStatus`
- [x] Verify end-to-end pipeline with real resumes (PDF + DOCX) in Ollama mode
- [x] Verify Gemini integration (API connectivity, response parsing, error handling for 403/429/503/404); blocked on free-tier quota for full e2e but connectivity and single-call path confirmed
- [x] Confirm `force_hallucinate` test: inject `"GraphQL"` + `"MongoDB"` → verify `grounding.hallucinations_caught` returns both terms
- [x] Performance verification: fast path ~60–90 s, full pipeline ~140–175 s, interview chat turn ≤5 s (all measured on 8 GB RAM, CPU-only)

---

## Phase 12 — Deployment

- [x] Document local Ollama setup: `ollama pull qwen2.5:1.5b`, backend start via `uvicorn app.main:app --reload`, frontend `npm run dev`
- [x] Document Gemini cloud mode: set `LLM_PROVIDER=gemini` + `GEMINI_API_KEY` in `backend/.env`; backend validates config at startup
- [ ] Deploy backend to a publicly accessible server (e.g., Railway, Render, or a cloud VM) with `LLM_PROVIDER=gemini` and billing-enabled Gemini API key
- [ ] Deploy frontend build (`npm run build`) to a static hosting service (e.g., Vercel, Netlify) pointed at the deployed backend URL
- [ ] Set `CORS` origins in `main.py` to the production frontend domain
- [ ] Document production setup in `README.md`
