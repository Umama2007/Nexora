# Nexora — Features

All features documented here are fully implemented and verified against the source code.

---

## 1. Resume Upload and Parsing

### User perspective
The user visits `/resume-analysis`, selects or drags a PDF or DOCX file onto the upload zone, sets their career level and target role, optionally pastes a job description, then clicks **Analyze Resume**.

### How it works
- File validation runs client-side before the upload: accepted types are `.pdf` and `.docx` (checked by MIME type and extension), max size is 10 MB.
- The form data is submitted via `multipart/form-data` to `POST /api/resumes/upload`.
- The backend saves the file to `backend/app/temp/` (directory created if absent) and inserts a row into the `resumes` table.
- Text extraction runs via `extract_resume_text()`:
  - **PDF:** PyMuPDF opens every page and concatenates its text.
  - **DOCX:** python-docx reads all paragraph text and all table cell text.

### Progress display
After upload, the page enters a polling loop against `GET /api/resumes/:id/status` every 2 seconds. Four progress stage labels are shown:
1. Parsing your resume…
2. Extracting Truth Guard facts…
3. Analyzing your resume against the target role…
4. Finalizing your report…

An elapsed-seconds counter is also shown so users know the system is working and not hung.

### Edge cases and error handling
- Invalid file type → `"Invalid file type. Please upload a PDF or DOCX file."` shown before upload.
- File over 10 MB → `"File size exceeds the 10 MB limit."` shown before upload.
- Backend analysis failure → `_progress_store` set to `status: "error"`; polling detects it and shows the error message. `AI_PROVIDERS_EXHAUSTED` produces a specific "at capacity" message.
- Timer and polling intervals are stored in a `timersRef` and cleared on component unmount, preventing leaks if the user navigates away mid-analysis.

---

## 2. Resume Analysis — Truth Guard Extraction (Step 1)

### User perspective
Invisible to the user. Runs automatically as the first stage of every analysis pipeline. Powers the Profile page, the Dashboard "Skills Tracked" stat, and all downstream grounding.

### How it works
`extract_truth_guard_facts()` in `truth_guard.py` runs entirely locally — no LLM, no network call. It is a deterministic multi-stage parser:

1. **Section scanner** (`_scan_sections`): iterates every line, matches section headings against regex patterns for Skills, Projects, Education, Experience, and "other" headings. Returns `(raw, normalized, section, is_header)` tuples.
2. **Name extractor** (`_extract_name`): looks for an explicit `"Name: ..."` label in the first 20 lines, then falls back to the first plausible personal-name line before any real section heading. Filters out role titles, degree words, company suffixes, and contact hints.
3. **Education extractor** (`_extract_education`): takes the first 1–2 meaningful lines under any education-style heading; strips date-only lines and GPA/URL content.
4. **Skills + tools extractor** (`_extract_skills_tools`): case-insensitive regex match of the entire `TECH_TERMS` lexicon (100+ terms) across the full resume text, or within the skills section only for ambiguous short words (`go`, `r`, `c`, `swift`, `ruby`, `qt`). Items in `TOOL_TERMS` (git, docker, ci tools, etc.) land in `tools`; everything else lands in `skills`. Display casing comes from `DISPLAY_NAMES` map.
5. **Projects extractor** (`_extract_projects`): prefers colon-title lines (e.g. `"E-commerce Platform: Built a full-stack app..."`), then bulleted project names, then bulleted experience lines with action verbs. Caps at 8 entries.

Output shape: `{name, education, skills[], tools[], projects[]}`. Unknown fields stay empty — never guessed.

---

## 3. Resume Analysis — Unified LLM Analysis

### User perspective
The analysis results page shows an ATS score, five-dimension breakdown, missing keywords, a recruiter-style verdict, summary, strengths, and improvement suggestions.

### How it works
`analyze_resume_once()` sends a single prompt to the LLM (750-token cap) with the resume text, the Truth Guard facts, the target role, and the optional job description.

The prompt instructs the model to return a single JSON object with three sections:
```json
{
  "score_data": {
    "score": 0-100,
    "status": "Poor|Average|Good|Outstanding",
    "verdict_reason": "one short sentence",
    "breakdown": { "content": 0-100, "impact": 0-100, "skills": 0-100,
                   "experience": 0-100, "formatting": 0-100 }
  },
  "missing_keywords": ["..."],
  "improvements_data": {
    "summary": "max 35 words",
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "improvements": [
      { "id": "imp-1", "section": "Experience|Skills|Education|Formatting",
        "current": "...", "feedback": "...", "suggestion": "...", "status": "pending" }
    ]
  }
}
```

**Post-generation normalization (deterministic, applied after LLM output):**
- **Score label:** `>=85 → Outstanding`, `>=70 → Good`, `>=50 → Average`, else `→ Poor`. The model's own label is overwritten.
- **Section normalization** (`_normalize_section`): improvement `section` values are mapped to one of the four canonical tab values using substring rules, so model drift never hides an improvement behind an unrecognized tab name.
- **Missing keyword fallback:** if the LLM returned an empty list but a job description was provided, the backend scans the JD against `TECH_TERMS` and populates up to 10 keywords the user is missing, with correct display casing.

**Input hash caching:**
- A SHA-256 hash of `resume_text + "|" + target_role + "|" + job_description + "|v2"` is computed before any LLM call.
- If a completed analysis row with the same hash already exists, it is copied to the new `resumeId` and returned instantly.
- The `|v2` version salt means cache entries are automatically invalidated when the extraction logic changes significantly.

**Error handling:**
- If `_parse_json` fails (markdown-wrapped output, truncated JSON), `unified_result` carries `{"error": "..."}`.
- The backend does not retry — it writes an error row (`analysisStatus=error`) so the frontend poll loop always terminates.
- A specific `AllProvidersExhaustedError` sets `error_code: "AI_PROVIDERS_EXHAUSTED"` in the progress store, which the frontend displays as a user-friendly "at capacity" message.

---

## 4. Analysis Results Page

### User perspective
After polling completes, the user lands on `/analysis/:id` showing their full report.

### Components displayed
- **Radial score chart** with the numeric score and status badge
- **Verdict reason** — the one-sentence recruiter verdict
- **Five-dimension breakdown bars** (content, impact, skills, experience, formatting)
- **Missing keywords** as chips, with a hint indicating whether they came from the pasted JD or the role name
- **AI executive summary** (35-word max)
- **Key strengths** (3 items)
- **Areas to improve** (up to 3 items shown inline with quick-link to the relevant feedback tab)

### Profile auto-population
`profileService.autoPopulateFromResume(resume, analysis)` runs once per `resumeId` (guarded by `AUTOFILL_LAST_RESUME_KEY` in `localStorage`). It fills only blank profile fields — skills, tools, name, education, target role, career level — without overwriting any manually edited values.

---

## 5. Resume Feedback Editor

### User perspective
`/analysis/:id/feedback` provides a five-tab editor for acting on AI-identified improvements.

### Tabs
| Tab | Content |
|---|---|
| **Overview** | AI summary, strengths, action status counts, bullet tailoring panel |
| **Experience** | Improvements in the Experience section |
| **Skills** | Improvements in the Skills section |
| **Education** | Improvements in the Education section |
| **Formatting** | Improvements in the Formatting section |

Each tab shows its pending count as a badge. The initial tab can be set via `location.state.initialTab` (used by quick-link buttons on the AnalysisResults page).

### Per-improvement actions
- **Apply suggestion:** calls `PATCH /api/analyses/:id/improvements` with `status: "applied"`. The improvement card then shows the suggested text as the current text.
- **Dismiss:** calls the same endpoint with `status: "dismissed"`.
- **Undo / Restore:** returns to `pending`.

Applied/dismissed state is persisted in SQLite. It survives page reloads.

### Resume Tailoring (Overview tab)
Clicking **Generate tailored bullets** calls `POST /api/tailor`. The backend:
1. Loads the resume's `targetRole`, `jobDescription`, and `truthFacts` from SQLite.
2. Calls the LLM (500-token cap) with the `tailor_resume.txt` prompt, which explicitly instructs the model to use only facts from the extracted skills and tools.
3. Parses the `tailored_bullets: [{original, tailored}]` JSON.
4. Runs `verify_grounding()` on the generated text.
5. Returns the bullets plus `grounding: {is_grounded, hallucinations_caught}`.

The feedback page renders a green "Grounded ✓" or orange "Flagged terms" banner based on the grounding result, followed by the original/tailored pairs.

**Errors:** HTTP 400 if Truth Guard facts are absent or empty. HTTP 502 if the LLM output cannot be parsed. User-facing error with a "Try again" button is shown in both cases.

---

## 6. Post-Generation Grounding Check (Truth Guard Step 3)

### How it works
`verify_grounding(generated_text, truth_facts)` in `grounding.py`:

1. Builds an `allowed` set from the user's `skills` and `tools` facts (lowercased).
2. Iterates every term in `TECH_TERMS` (100+ technology names across languages, frameworks, databases, cloud tools, DevOps, testing methodologies).
3. Uses regex word-boundary patterns to check if each term appears in the generated text.
4. For terms found in the output, checks `is_allowed()`: direct match, or bidirectional substring containment (handles compound entries like `"AWS (S3, EC2)"` grounding the generated term `"ec2"`). Only terms with 3+ characters use substring matching.
5. Ungrounded terms go into `hallucinations_caught`.

Returns `{"is_grounded": bool, "hallucinations_caught": []}`.

This check is **purely deterministic** — no LLM, no probability, no randomness.

---

## 7. Job Match

### User perspective
The user visits `/job-match`, pastes a job description, and sees a match percentage with matching and missing skills listed.

### How it works
`POST /api/job-match` loads `truthFacts` from the most recent analyzed resume, calls `analyze_job_match()` with those facts and the JD, and inserts the result into `job_matches`.

The LLM prompt (`job_match.txt`) instructs the model to compare the candidate's extracted facts against the JD and return:
```json
{
  "matchPercentage": 65,
  "matchingSkills": ["React", "TypeScript"],
  "missingSkills": ["Docker", "AWS"]
}
```

**Integration with Roadmap:** The JobMatch page has a "Generate Roadmap" button that navigates to `/roadmap` with `{ missingSkills, targetRole }` in `location.state`, pre-loading those skills as the roadmap input.

**Error handling:** HTTP 404 if no analyzed resume exists. The LLM result is validated for `matchPercentage` being a number before being returned; an unreadable result throws a user-facing error.

---

## 8. Career Roadmap

### User perspective
The user visits `/roadmap` (typically arriving from the Job Match page). A month-by-month learning plan is generated in the background. A loading card with a spinner is shown while polling.

### How it works
`POST /api/roadmap` starts a background task (`_run_roadmap_sync`). The frontend polls `GET /api/roadmap/:id/status` every 2 seconds.

The LLM prompt (`roadmap.txt`) uses a "Senior Engineering Manager" persona and returns:
```json
{
  "steps": [
    { "month": "Month 1", "title": "...", "focus": "...", "whyItMatters": "..." }
  ]
}
```

If no `missingSkills` are available (no job match run, no pending skill improvements), the page renders an empty state ("No Roadmap Gaps").

Each roadmap step has a "Practice interviews on [focus]" link that navigates to `/interview`.

---

## 9. Mock Interview — Session Start

### User perspective
The user visits `/interview`, picks a mode (HR, Technical, Resume-Based), selects an analyzed resume, and starts a session. The InterviewRoom page opens with the AI's first question already present.

### How it works
`POST /api/interviews` with `{resumeId, type}`:
1. Validates `type` is one of `HR`, `Technical`, `Resume-Based`.
2. Loads `truthFacts` from the analyzed resume.
3. Calls `start_interview_session()` → `initialize_interview_rag()` to index the facts in the RAG engine.
4. Calls `generate_opening_question()`: retrieves top-2 RAG context for the target role, builds the mode-branched system prompt, calls the LLM (160-token cap).
5. Inserts the session row with `questionsCount=5` and the opening message in `chatHistory`.

### System prompts by mode

| Mode | File | Evaluation focus |
|---|---|---|
| **HR** | `interview_hr.txt` | Communication, answer structure, confidence. Behavioral questions only — no technical depth. |
| **Technical** | `interview_technical.txt` | Domain knowledge. Hard constraint: only asks about skills/tools in the candidate's verified facts. |
| **Resume-Based** | `interview_resume.txt` | Project-by-project audit. Picks resume entries and makes the candidate defend their role, decisions, and outcomes. Challenges answers that exceed what the resume claims. |

All prompts inject `[FACTS]` (compact text rendering of truthFacts) and `[RAG_CONTEXT]` (top-2 retrieved facts for the current turn).

---

## 10. Mock Interview — Chat Turns

### How it works
`POST /api/interviews/:id/chat` with `{message}`:
1. Loads the session, last 4 messages of `chatHistory` (context window management).
2. Retrieves top-2 RAG context for the user's message.
3. Computes `answered` = count of user messages so far; sets `wrap_up = (answered + 1) >= questionsCount`.
4. Calls the LLM (160-token cap). If `wrap_up`, the prompt instructs the model to close the interview gracefully instead of asking another question.
5. Appends user + AI messages to `chatHistory`, updates `currentQuestionIndex` and `status`.
6. Returns the updated session plus the AI response text.

**Optimistic UI:** `InterviewRoom.tsx` appends the user's message to local state immediately. If the server call fails, it re-fetches the session from the server to resync.

**Session completion:** When `wrap_up` is true, `status` is set to `"completed"` and the frontend navigates to `/interview/:sessionId/feedback`.

**Early end:** The user can click "End & Get Feedback" after answering at least one question. This navigates directly to the feedback page, which triggers scoring.

---

## 11. Interview Scoring

### How it works
`POST /api/interviews/:id/score` is idempotent — if `interview_feedback` already exists for the session, it returns the existing row without re-running the LLM.

For new scoring:
1. Loads the full `chatHistory` from the session.
2. Validates at least one user answer exists.
3. Flattens the transcript to `"Candidate: ...\nInterviewer: ...\n"` format.
4. Calls `score_interview()` with the `interview_scoring.txt` prompt (512-token cap).

The prompt instructs the model to:
- Judge **only** what the candidate said — no invented content.
- Return a specific JSON with `score`, `accuracy`, `communication`, `confidence`, `feedbackSummary`, and `issues`.
- Issues must reference actual words from the transcript and give a concrete fix.

`_validate_feedback()` normalizes the JSON before writing: all integer scores are clamped to [0, 100] via `_clamp_score()`, and any issue without a `description` field is skipped.

The session is marked `status="completed"` when the feedback row is written.

---

## 12. Dashboard

### What it shows
- **Resume Score KPI:** Latest resume's score and status badge from the analysis
- **Interview Readiness KPI:** Average score across all completed, scored sessions. If no sessions, shows "Not Started".
- **Skills Tracked:** Count of unique skills + tools from `truthFacts` (case-insensitively de-duplicated). Shows `—` if no resume analyzed.
- **Action Items:** Count of non-completed recommendations from `recommendationService.buildRecommendations()`.
- **Resume Health bars:** Five-dimension breakdown for the latest resume.
- **AI Insight card:** Dynamic text derived from the latest analysis score and missing keywords.
- **Recent Activity feed:** Up to 5 most recent resume uploads and interview sessions, sorted by date, linking to the relevant detail page.

### Data sources
All data is fetched live from the backend on mount — no hardcoded values or mock data anywhere in the component.

---

## 13. Recommendations

### How it works
`recommendationService.buildRecommendations()` runs on every visit to `/recommendations` and on Dashboard mount. It:

1. Fetches the latest resume + analysis. If usable (not error status):
   - If missing keywords exist → "Close N keyword gaps" recommendation.
   - If pending improvements exist → "Apply N pending resume edits" recommendation.
2. Fetches all completed sessions + their feedback:
   - Averages `accuracy`, `communication`, `confidence` across all scored sessions.
   - If the weakest dimension is below 80 → "Strengthen [dimension]" recommendation.
   - If no scored sessions exist (but a resume was analyzed) → "Run your first mock interview" recommendation.
3. Overlays persisted user-tracked statuses (`todo`/`started`/`completed`) from `localStorage`.

**No hardcoded content.** A fresh system with no data returns an empty list.

---

## 14. Profile

### How it works
The user profile is stored entirely in `localStorage` under `nexora_profile_v2`. There is no backend profile endpoint.

**Auto-population:** After each analysis, `profileService.autoPopulateFromResume()` runs once per `resumeId`. It fills only blank fields (name, education, targetRole, careerLevel, skills, projects) from `truthFacts`. A manually edited field is never silently replaced.

**Manual sync:** The "Update from Latest Resume" button calls `profileService.syncFromLatestResume()`, which fetches the latest resume from the backend, overwrites resume-derived fields, and re-arms the auto-population guard.

**Schema migration:** A `nexora_profile_schema` key tracks the schema version. On v1 → v2 migration, the autofill guard is reset so blank fields can be re-populated from the improved extractor. Old values are never deleted.

---

## 15. Analysis History

The `/analysis-history` page calls `GET /api/resumes` (returns all resumes ordered by `uploadedAt DESC`) and renders them as a navigable list. Each row links to `/analysis/:id`.
