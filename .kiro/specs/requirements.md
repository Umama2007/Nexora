# Nexora — Requirements Specification

**Project:** Nexora (formerly CareerMirror AI)  
**Type:** AI-powered resume analyzer, career coach, and mock interview platform  
**Owner:** Umama (solo build)  
**Build window:** 10–14 days, August 2026  
**Version:** 2.0 — aligned with the implemented system

---

## 1. Problem Statement

Fresh graduates and early-career job seekers face three connected problems:

1. **Resume blindness** — candidates cannot tell why their resume is being rejected, whether it is ATS-compatible, or which skills are missing for a specific role.
2. **Generic, non-actionable feedback** — most tools default to encouragement rather than the specific, evidence-based critique recruiters actually apply.
3. **Interview uncertainty** — candidates do not know what questions to expect, how answers are judged, or how to improve between attempts.

---

## 2. Solution Overview

Nexora acts as a recruiter and career mentor combined. It follows a single repeatable loop — **Analyze → Critique → Improve → Practice → Track Growth** — and, unlike typical AI writing tools, it never invents skills or inflates feedback. Every piece of output is grounded in the user's actual, stated resume content through the Truth Guard system.

---

## 3. Functional Requirements

### FR-1 — Resume Upload and Parsing

**As a** job seeker,  
**I want to** upload my resume as a PDF or DOCX file,  
**so that** the system can extract its content and run analysis against it.

**Acceptance Criteria:**

- AC-1.1: The upload endpoint (`POST /api/resumes/upload`) accepts files with `.pdf` or `.docx` extensions and rejects all other types with an error response before any processing begins.
- AC-1.2: Files larger than 10 MB are rejected by the frontend before the upload request is sent (validated in `ResumeUpload.tsx`).
- AC-1.3: PDF text is extracted using PyMuPDF (`extract_text_from_pdf`), iterating over every page and concatenating the text.
- AC-1.4: DOCX text is extracted using python-docx (`extract_text_from_docx`), collecting all paragraph text plus all table cell text.
- AC-1.5: The dispatch between PDF and DOCX is handled by `extract_resume_text` based on the file extension (`.docx` → DOCX path, everything else → PDF path).
- AC-1.6: A `resumes` row is written to SQLite with `id`, `filename`, `targetRole`, `careerLevel`, `uploadedAt`, and `jobDescription` before the background analysis task starts.
- AC-1.7: The upload endpoint returns `{"resumeId": "<id>"}` immediately; parsing and analysis run in a `BackgroundTasks` coroutine so the HTTP response is not blocked.

---

### FR-2 — Job Description Input

**As a** job seeker,  
**I want to** optionally paste a target job description alongside my resume,  
**so that** the analysis compares my resume against that specific listing rather than generic role expectations.

**Acceptance Criteria:**

- AC-2.1: The upload form includes an optional `jobDescription` textarea that submits its value as a `Form` field alongside the file.
- AC-2.2: When a job description is provided, it is stored in the `resumes.jobDescription` column in SQLite and passed through to both the fast-path analysis and the tailoring endpoint.
- AC-2.3: When no job description is provided, the system uses the `targetRole` string as the baseline for keyword comparison, and `breakdown.keyword_source` is set to `"target_role"`.
- AC-2.4: When a job description is provided, `breakdown.keyword_source` is set to `"job_description"`, and the UI renders the appropriate label ("Required by the job description you pasted…" vs. "Commonly expected for {role}…").

---

### FR-3 — ATS Compatibility Score and Missing Keywords

**As a** job seeker,  
**I want to** receive a numerical ATS score and a list of missing keywords,  
**so that** I know exactly how my resume compares to the target and what to add.

**Acceptance Criteria:**

- AC-3.1: The fast analysis LLM call returns a JSON object with `score_data.score` (integer 0–100) and `missing_keywords` (list of strings) in a single generation capped at 512 tokens.
- AC-3.2: The score is normalized by the backend after generation: ≥85 → `"Outstanding"`, ≥70 → `"Good"`, ≥50 → `"Average"`, <50 → `"Poor"`. The LLM-assigned label is overwritten by this deterministic rule regardless of what the model generated.
- AC-3.3: `score_data.breakdown` contains five integer sub-scores: `content`, `impact`, `skills`, `experience`, and `formatting`.
- AC-3.4: If the LLM returns an empty `missing_keywords` list but a job description was provided, a deterministic fallback scans the JD text for terms in the `TECH_TERMS` lexicon (`grounding.py`) that are absent from the Truth Guard facts, populating up to 10 keywords with correct display casing from `DISPLAY_NAMES`.
- AC-3.5: On a JSON parse failure, the backend retries the fast-path LLM call exactly once. If the second attempt also fails to produce a valid JSON structure, the analysis row is written with `analysisStatus = 'error'`.
- AC-3.6: The `analyses` row is written to SQLite with `analysisStatus = 'fast_completed'` after the fast path succeeds, allowing the frontend to navigate to the results page before detailed analysis finishes.

---

### FR-4 — Formatting Feedback

**As a** job seeker,  
**I want to** receive specific formatting feedback,  
**so that** I can fix ATS-readability issues in my resume layout.

**Acceptance Criteria:**

- AC-4.1: The detailed-path LLM prompt (system prompt `DETAILED_SYSTEM` in `resume.py`) explicitly instructs the model that `"Formatting"` is one of four valid `section` values and defines it as: "excess text, weak or unclear headings, length problems, dense blocks, ATS readability."
- AC-4.2: Any improvement item whose `section` field contains a formatting-related substring (e.g., `"format"`, `"length"`, `"heading"`, `"layout"`, `"ats"`, `"readab"`, `"style"`) is remapped to the canonical `"Formatting"` section by the `_normalize_section` function in `main.py`.
- AC-4.3: Formatting improvements are visible in the `ResumeFeedback` page under the `"Formatting"` tab.
- AC-4.4: The detailed analysis generates at most 3 improvement items total across all sections (enforced by the LLM prompt instruction "Maximum of 3 improvement suggestions").

---

### FR-5 — Recruiter-Style Verdict

**As a** job seeker,  
**I want to** see a one-sentence recruiter verdict on my shortlist probability,  
**so that** I understand the concrete reason my resume would or would not advance.

**Acceptance Criteria:**

- AC-5.1: The fast-path LLM prompt requires a `verdict_reason` field defined as "one short sentence: the shortlist probability and the main concrete reason."
- AC-5.2: `verdict_reason` is stored inside `analyses.breakdown` as `breakdown.verdict_reason` (not as a separate column).
- AC-5.3: The `AnalysisResults` page renders the verdict under a `"Verdict:"` label in the score banner when `verdictReason` is non-empty.
- AC-5.4: The verdict label (status) shown in the UI badge is always determined by the deterministic score normalization rule (AC-3.2), never by the raw LLM-generated status string.

---

### FR-6 — Skill and Fact Extraction (Truth Guard Step 1)

**As a** job seeker,  
**I want** the system to extract a structured list of my real skills, tools, and projects from my resume,  
**so that** all subsequent AI features stay grounded in what I actually have rather than what sounds plausible.

**Acceptance Criteria:**

- AC-6.1: `extract_truth_guard_facts` sends the full resume text to the LLM with the `truth_guard_extract.txt` system prompt, which instructs: "Do not invent anything. If it is not in the text, do not include it."
- AC-6.2: The extraction is capped at 512 tokens. The response is parsed as JSON into the structure `{name, education, skills: [], tools: [], projects: []}`.
- AC-6.3: On JSON parse failure (including markdown-wrapped responses), the function strips ` ```json ` and ` ``` ` wrappers and retries `json.loads`; if parsing still fails, it returns `{"raw_extraction": <response>}` rather than raising an exception.
- AC-6.4: The extracted facts are stored in `analyses.truthFacts` as a JSON string.
- AC-6.5: The Truth Guard extraction runs before both the fast and detailed LLM analysis calls, so both paths are grounded in the same set of facts.
- AC-6.6: The `AnalysisResults` page uses the `truthFacts` field to auto-populate the user's profile via `profileService.autoPopulateFromResume` (idempotent, never overwrites existing profile values).
- AC-6.7: The Dashboard "Skills Tracked" stat displays the count of unique skills + tools extracted (case-insensitively de-duplicated).

---

### FR-7 — Resume Tailoring

**As a** job seeker,  
**I want** the system to rewrite my resume bullets to better match a target job,  
**so that** my application is more competitive without inventing experience I don't have.

**Acceptance Criteria:**

- AC-7.1: `POST /api/tailor` requires a valid `resumeId` with a non-error `analysisStatus` and non-empty `truthFacts` containing at least one skill or tool; it returns HTTP 400 with a descriptive message if either condition fails.
- AC-7.2: The tailoring LLM prompt (`tailor_resume.txt`) explicitly instructs: "You must ONLY use skills, tools, and projects that exist in the provided Extracted Facts. Do NOT invent or hallucinate any new skills or experience."
- AC-7.3: When a `jobDescription` was stored for the resume, it is included in the tailoring prompt so the rewritten bullets are optimized for that specific listing.
- AC-7.4: The LLM call is capped at 512 tokens.
- AC-7.5: The response includes a `tailoredBullets` array of `{original, tailored}` objects and a `grounding` object containing the FR-8 post-generation check result.
- AC-7.6: The tailoring endpoint raises HTTP 502 if the LLM output cannot be parsed into a non-empty `tailored_bullets` list.

---

### FR-8 — Grounding Check (Truth Guard Steps 2 and 3)

**As a** job seeker,  
**I want** the system to verify that no generated content claims skills I didn't list,  
**so that** I can trust that every tailored bullet and piece of feedback is honest.

**Acceptance Criteria:**

- AC-8.1: `verify_grounding` in `grounding.py` scans the generated text for all terms in the curated `TECH_TERMS` set (100+ technology terms) using regex word-boundary matching.
- AC-8.2: A term is considered grounded if it appears in the user's `skills` or `tools` facts with bidirectional substring containment (e.g., fact `"AWS (S3, EC2)"` grounds the generated term `"aws"` or `"ec2"`), but only for terms with 3+ characters.
- AC-8.3: `verify_grounding` returns `{"is_grounded": bool, "hallucinations_caught": [<term>, ...]}` with no LLM involvement — the check is entirely deterministic regex.
- AC-8.4: The grounding check result is returned to the frontend as `grounding.is_grounded` and `grounding.hallucinations_caught` on every `/api/tailor` response.
- AC-8.5: The `tailor.py` module includes a `force_hallucinate=True` parameter that injects `"GraphQL"` and `"MongoDB"` into the prompt specifically to verify the grounding checker catches them — confirmed in testing.
- AC-8.6: Every interview prompt template that asks technical questions includes the hard constraint "HARD CONSTRAINT: only ask about skills, tools, or technologies that appear in the candidate's verified facts below" (in `interview_technical.txt`), and "Never invent projects, metrics, or technologies that are not in the facts below" (in `interview_resume.txt`).

---

### FR-9 — Mock Interview: HR Mode

**As a** job seeker,  
**I want to** practice a behavioral interview with an AI HR manager,  
**so that** I can improve my communication, structure, and confidence before real interviews.

**Acceptance Criteria:**

- AC-9.1: Starting an interview session with `type = "HR"` loads `interview_hr.txt` as the system prompt, which instructs the model to ask behavioral and situational questions ("Tell me about a time…", strengths/weaknesses, conflict, pressure, career goals) and to judge communication structure and confidence, not technical depth.
- AC-9.2: The HR prompt includes the candidate's Truth Guard facts under `[FACTS]` as context only, with the explicit note "do not turn this into a technical quiz."
- AC-9.3: The HR prompt instructs the model to ask ONE question per message and keep each message under 50 words.
- AC-9.4: Each chat turn injects the top-2 RAG results retrieved from the per-session ChromaDB collection (keyed by session ID) under `[RAG_CONTEXT]`.
- AC-9.5: The session is initialized with `questionsCount = 5`. After the user answers question 5, the `wrap_up` flag is set to `True` and the AI closes the interview instead of asking another question.

---

### FR-10 — Mock Interview: Technical Mode

**As a** job seeker,  
**I want to** practice a technical interview scoped to my actual skills,  
**so that** I am tested only on things I claimed to know, not on a fabricated stack.

**Acceptance Criteria:**

- AC-10.1: Starting an interview session with `type = "Technical"` loads `interview_technical.txt`, which instructs the model to ask domain/technical questions for the target role.
- AC-10.2: The technical prompt contains the hard constraint: "HARD CONSTRAINT: only ask about skills, tools, or technologies that appear in the candidate's verified facts below. Never invent a tech stack the candidate has not claimed."
- AC-10.3: The prompt instructs the model to push one level deeper on shallow answers (trade-offs, alternatives, failure modes).
- AC-10.4: One question per message, under 50 words, with a 5-question session limit (same as FR-9 AC-9.5).

---

### FR-11 — Mock Interview: Resume-Based Mode

**As a** job seeker,  
**I want to** be questioned specifically about the projects on my resume,  
**so that** I can prepare to defend my actual work in real interviews.

**Acceptance Criteria:**

- AC-11.1: Starting an interview session with `type = "Resume-Based"` loads `interview_resume.txt`, which instructs the model to "pick one project or experience entry from the facts below, name it explicitly, and make the candidate defend it: their exact role, architecture decisions, trade-offs, and measured outcomes."
- AC-11.2: The prompt instructs the model to "Stay on the SAME project for follow-ups until the answer is satisfying, then move to the next entry."
- AC-11.3: The prompt instructs: "If an answer contradicts or exceeds what the resume claims, point it out and ask them to clarify" — actively challenging ungrounded claims.
- AC-11.4: The prompt instructs: "Never invent projects, metrics, or technologies that are not in the facts below."
- AC-11.5: Five-question session limit with `wrap_up` close (same as FR-9 AC-9.5).

---

### FR-12 — Interview Scoring

**As a** job seeker,  
**I want to** receive a scored post-interview report with concrete issue descriptions,  
**so that** I know exactly what I said that was weak and how to fix it.

**Acceptance Criteria:**

- AC-12.1: `POST /api/interviews/{session_id}/score` runs the scoring pass over the full chat transcript stored in `interviews.chatHistory` and returns an `interview_feedback` record.
- AC-12.2: The scoring prompt (`interview_scoring.txt`) instructs: "Judge ONLY what the candidate actually said in the transcript. Never invent things they did not say." Issues must "reference what the candidate actually said (quote or paraphrase their words)."
- AC-12.3: The scoring LLM returns four integer scores (0–100): `score` (overall), `accuracy` (technical correctness), `communication` (clarity and structure), `confidence` (firmness of assertions). All four are clamped to `[0, 100]` by `_clamp_score` before storage.
- AC-12.4: The scoring response includes 2–4 `issues`, each with `type` (one of `"Technical Accuracy"`, `"Communication"`, `"Confidence"`), `description` (specific, referencing actual candidate words), and `suggestion` (concrete fix).
- AC-12.5: The scoring endpoint is idempotent: if `interview_feedback` already exists for the session, it returns the existing row without re-running the LLM.
- AC-12.6: The session `status` is set to `"completed"` when the scoring row is written.
- AC-12.7: The scoring call is capped at 512 tokens.

---

### FR-13 — Career Roadmap Generation

**As a** job seeker,  
**I want to** receive a month-by-month skill-building roadmap toward my target role,  
**so that** I have a concrete, time-boxed plan rather than vague advice.

**Acceptance Criteria:**

- AC-13.1: `POST /api/roadmap` accepts `targetRole` (string) and `missingSkills` (list of strings) and launches a background task.
- AC-13.2: The roadmap LLM prompt (`roadmap.txt`) instructs the model to act as a "Senior Engineering Manager mentoring a junior developer" and return a structured month-by-month JSON with `steps` where each step has `month`, `title`, `focus`, and `whyItMatters`.
- AC-13.3: The roadmap row is written to SQLite (`roadmaps` table) with the full steps JSON after background generation completes.
- AC-13.4: `GET /api/roadmap/{roadmap_id}/status` returns `{"status": "processing"}` while the background task runs and `{"status": "completed", "roadmap_id": "..."}` when done.
- AC-13.5: `GET /api/roadmap/{roadmap_id}` returns the full roadmap with `targetRole`, `missingSkills`, and `steps` array.

---

### FR-14 — Job Match Scoring

**As a** job seeker,  
**I want to** see a percentage match between my resume and a specific job description,  
**so that** I know concretely which skills I have that the role wants and which I still need.

**Acceptance Criteria:**

- AC-14.1: `POST /api/job-match` accepts `resumeId`, `targetRole`, and `jobDescription`. It loads the `truthFacts` from the corresponding `analyses` row; HTTP 404 is returned if no analyzed resume exists.
- AC-14.2: The job-match LLM prompt (`job_match.txt`) instructs the model to compare the candidate's extracted facts (skills and tools) against the job description and return `matchPercentage`, `matchingSkills`, and `missingSkills` as a JSON object.
- AC-14.3: The match result is stored in the `job_matches` SQLite table with `matchPercentage`, `matchingSkills` (JSON array), and `missingSkills` (JSON array).
- AC-14.4: The `missingSkills` list returned from the job match is the input feed for FR-13 roadmap generation on the Roadmap page.

---

### FR-15 — Session History

**As a** job seeker,  
**I want to** view my past resume analyses and interview sessions,  
**so that** I can track my progress over time.

**Acceptance Criteria:**

- AC-15.1: `GET /api/resumes` returns all rows from the `resumes` table ordered by `uploadedAt DESC`.
- AC-15.2: `GET /api/analyses/{resume_id}` returns the full analysis for a resume including `analysisStatus`, `truthFacts`, and all breakdown/improvements data.
- AC-15.3: `GET /api/interviews` returns all sessions ordered by `startedAt DESC`.
- AC-15.4: The `AnalysisHistory` page renders all past resume analyses as a navigable list.
- AC-15.5: The Dashboard "Recent Activity" card combines the five most recent resume uploads and interview sessions in reverse-chronological order.
- AC-15.6: All SQLite tables (`resumes`, `analyses`, `interviews`, `interview_feedback`, `job_matches`, `roadmaps`) are created idempotently via `init_db()` with `CREATE TABLE IF NOT EXISTS`. Additive migrations (e.g., adding `jobDescription`, `analysisStatus`, `resumeId` columns) are guarded with `PRAGMA table_info` checks so the app does not crash on existing databases.

---

## 4. Non-Functional Requirements

### NFR-1 — Performance (Measured on 8 GB RAM, CPU-only, qwen2.5:1.5b at ~10–11 tok/s)

- **Fast path** (ATS score, verdict, missing keywords): ~60 s for a warm resume; ~75–90 s for a new resume (cold prefill). This is the `analysisStatus = 'fast_completed'` milestone that releases the frontend.
- **Full pipeline** (fast + detailed feedback): ~140–175 s total end-to-end.
- **Interview chat turn**: ≤5 s warm (CHAT_NUM_PREDICT = 160 tokens; last 4 history messages kept for context).
- **SentenceTransformer warm-up**: model is loaded in a background thread at server startup so the first upload does not pay the cold-load penalty.
- Token caps are the primary latency control: fast analysis = 512, detailed = 1536, interview chat = 160, interview scoring = 512, tailoring = 512, Truth Guard extraction = 512.

### NFR-2 — Offline-First / Cloud-Optional

- In `LLM_PROVIDER=ollama` mode (the default), all inference runs against a local Ollama server at `http://localhost:11434`. No internet connection is required at inference time.
- In `LLM_PROVIDER=gemini` mode, inference is delegated to the Google Generative AI REST API (`generativelanguage.googleapis.com`) using `GEMINI_API_KEY`. A network connection is required.
- Provider is validated at startup (`validate_provider()`); a misconfigured provider or missing API key raises `RuntimeError` before any request is served.
- The Gemini backend uses `urllib` directly (not the `google-genai` SDK) to avoid httpx SSL handshake failures on Windows.

### NFR-3 — Portability

- Runs on a standard laptop: 8 GB RAM, no GPU, any OS supported by Python 3.10+ and Node.js 18+.
- No cloud services required in Ollama mode (SQLite, ChromaDB in-memory, local Ollama).

### NFR-4 — Privacy

- In Ollama mode: all resume text and personal data stays on-device. Nothing is transmitted to any external service.
- In Gemini mode: resume text and prompts are sent to Google's Generative AI API. Users should review Google's data policies before processing sensitive data in this mode.
- No user authentication, accounts, or login system — single-user local tool by design.

### NFR-5 — Groundedness (Truth Guard Guarantee)

- No LLM-generated output that reaches the user may assert a skill, technology, or project claim that was not present in the user's uploaded resume.
- Enforced by three mechanisms: (1) the extraction prompt explicitly forbids invention; (2) all generation prompts include the extracted facts and instruct the model to reference only them; (3) the deterministic `verify_grounding` post-generation scan flags any `TECH_TERMS` term in the output that is absent from the extracted facts.

### NFR-6 — Reliability

- The analysis pipeline writes an error row to SQLite if any stage fails, so the frontend polling loop always reaches a terminal state (`completed`, `fast_completed`, or `error`) and never hangs indefinitely.
- If a detailed-path LLM generation produces unparseable output (truncated JSON, empty response), `analysisStatus` is set to `"error"` and the frontend displays a specific "detailed feedback unavailable" message rather than silently showing empty data.
- The improvement-status PATCH endpoint (`PATCH /api/analyses/{resume_id}/improvements`) persists applied/dismissed states to SQLite so the ResumeFeedback editor state survives page reloads.

### NFR-7 — Maintainability

- Clear layer separation: parsing (`pdf_parser.py`), extraction (`truth_guard.py`), retrieval (`rag_pipeline.py`), generation (`llm_client.py`), domain logic (`api/*.py`), persistence (`database.py`), presentation (`frontend/src/pages/`).
- All LLM system prompts are stored as plain-text files in `app/prompts/` — tunable without touching Python code.
- Section normalization and score normalization are deterministic post-processing rules in `main.py`, not prompt instructions, so model drift does not silently corrupt stored data.
