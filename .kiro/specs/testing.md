# Nexora — Testing

## Automated Tests

There is no automated test suite in the current repository. No `pytest`, `jest`, `vitest`, or other test runner configuration files are present. The development process used manual integration testing and one-off diagnostic scripts (all of which have been removed from the repository as part of cleanup).

---

## Manual Testing Checklist

Use this checklist to verify the full application is working correctly after setup or deployment.

### Backend Health

- [ ] `GET /health` returns `{"status": "ok"}`
- [ ] Server log shows `Starting up Nexora API... Provider: ollama` (or `gemini`)
- [ ] Server log shows `[WARMUP] Complete.` within ~30 seconds of startup

### Resume Upload and Analysis

- [ ] Upload a PDF resume — verify `POST /api/resumes/upload` returns `{"resumeId": "resume-xxxxxxxx"}`
- [ ] Frontend progress bar advances through all four stage labels
- [ ] `GET /api/resumes/:id/status` transitions from `processing` → `completed`
- [ ] `GET /api/analyses/:id` returns non-null `score`, `status`, `breakdown`, `strengths`, `improvements`, `truthFacts`
- [ ] `status` is one of `Poor`, `Average`, `Good`, `Outstanding` (not a raw LLM string)
- [ ] `breakdown.missing_keywords` is a non-empty array when the resume is missing obvious role keywords
- [ ] `truthFacts.skills` and `truthFacts.tools` are populated for a resume that lists technologies
- [ ] Upload a DOCX resume — verify it parses and analyzes correctly
- [ ] Upload an invalid file type (e.g. `.txt`) — verify frontend rejects it before upload
- [ ] Upload the exact same resume twice — verify the second analysis completes instantly (cache hit logged as `[CACHE]`)

### Analysis Results Page

- [ ] Radial score chart renders with correct numeric value
- [ ] Status badge shows the correct tier label
- [ ] `verdict_reason` is displayed under "Verdict:"
- [ ] Five breakdown progress bars render with non-zero values
- [ ] Missing keywords section shows chips (or "No critical keywords missing")
- [ ] Keyword source hint says "job description" when one was pasted, "target role" otherwise
- [ ] Key strengths list shows 1–3 items
- [ ] Areas to improve shows up to 3 items with section badges
- [ ] Clicking "Fix item" quick-link navigates to the feedback editor on the correct tab

### Resume Feedback Editor

- [ ] All five tabs render (Overview, Experience, Skills, Education, Formatting)
- [ ] Each section tab shows its pending count correctly
- [ ] Clicking "Apply suggestion" on an improvement calls `PATCH` and updates the card state
- [ ] Clicking "Dismiss" calls `PATCH` and updates the card state
- [ ] Reloading the page preserves applied/dismissed state (persisted in SQLite)
- [ ] "Undo" / "Restore" buttons return items to pending correctly
- [ ] Clicking **Generate tailored bullets** shows the loading state, then the bullet pairs
- [ ] Grounding badge shows green "Grounded ✓" for a normal resume
- [ ] `is_grounded: false` path: manually test by verifying the banner shows flagged terms (requires a resume whose extracted facts genuinely lack a technology the model wants to reference)

### Job Match

- [ ] Paste a job description and submit — verify `POST /api/job-match` returns `matchPercentage` (a number)
- [ ] Matching skills and missing skills lists are populated
- [ ] "Generate Roadmap" button navigates to `/roadmap` with `location.state.missingSkills` pre-loaded

### Career Roadmap

- [ ] Arriving from Job Match shows "Customized from Job Match" badge
- [ ] Roadmap generation polling works (loading card → steps card)
- [ ] Each step shows `month`, `title`, `focus`, and `whyItMatters`
- [ ] "Practice interviews on [focus]" link navigates to `/interview`
- [ ] Empty state renders correctly when no missing skills are available

### Mock Interview — Session Start

- [ ] Select **HR** mode → opening question is behavioral ("Tell me about a time..." style)
- [ ] Select **Technical** mode → opening question is technical and references a skill from the resume
- [ ] Select **Resume-Based** mode → opening question names a specific project from the resume
- [ ] Starting an interview with no analyzed resume shows a 404 error

### Mock Interview — Chat

- [ ] Typing and pressing Enter sends the message
- [ ] Optimistic user message appears immediately while AI is typing
- [ ] AI typing indicator (three dots) shows during generation
- [ ] Question counter increments correctly (e.g. "Question 2 of 5")
- [ ] After the 5th answer, the AI wraps up instead of asking another question, and the frontend navigates to feedback
- [ ] Clicking "End & Get Feedback" before question 5 navigates to feedback (early end)
- [ ] "End & Get Feedback" is disabled until at least one answer is given

### Interview Scoring and Feedback

- [ ] Scoring page loads with all four scores (overall, accuracy, communication, confidence) as integers 0–100
- [ ] `feedbackSummary` is a non-empty string
- [ ] `issues` array has 2–4 items
- [ ] Each issue has `type`, `description`, and `suggestion`
- [ ] Re-visiting the feedback page returns the same scores (idempotent — not re-scored)

### Dashboard

- [ ] Resume Score KPI shows the correct score from the latest analysis
- [ ] Interview Readiness KPI shows "Not Started" when no sessions are scored
- [ ] After completing a scored interview, Interview Readiness shows the average score
- [ ] Skills Tracked shows the correct count (skills + tools from truthFacts, de-duplicated)
- [ ] Action Items count matches the number of non-completed recommendations
- [ ] Recent Activity feed shows up to 5 entries in reverse chronological order
- [ ] Each activity row is clickable and navigates to the correct detail page
- [ ] AI Insight card text references the current resume's score and missing keywords

### Recommendations

- [ ] Fresh state (no uploads, no interviews): empty list or only "Run your first mock interview"
- [ ] After an analysis with missing keywords: keyword gap recommendation appears
- [ ] After a scored interview with a weak dimension: dimension-specific recommendation appears
- [ ] Marking a recommendation status persists across page reloads (localStorage)

### Profile

- [ ] After first analysis: profile fields are auto-populated (name, education, skills, target role)
- [ ] Re-visiting the same analysis does not re-populate fields (once-per-resumeId guard)
- [ ] "Update from Latest Resume" overwrites resume-derived fields with the latest data
- [ ] Manually editing a field is not overwritten by auto-population on subsequent visits

### Analysis History

- [ ] Table shows all uploaded resumes
- [ ] Clicking a row navigates to the correct analysis page

### Error States

- [ ] Backend offline: frontend shows network error or "at capacity" message — does not hang indefinitely
- [ ] Analysis error (e.g., LLM output unreadable): status page shows error, not infinite spinner
- [ ] `POST /api/tailor` with a resume that has no skills: returns HTTP 400 with a clear message

---

## Responsive / Mobile Testing Checklist

The application uses CSS Modules with the `AppLayout` component handling the responsive shell (sidebar + topbar).

- [ ] Sidebar collapses to a slide-drawer on small screens (hamburger in Topbar)
- [ ] All card grids reflow to single column on mobile
- [ ] Upload drag-and-drop zone is replaced by a tap-to-browse experience on touch devices
- [ ] Chat input area in InterviewRoom is usable on mobile keyboard
- [ ] Radial score chart renders at its minimum size without clipping
- [ ] Tab bar in ResumeFeedback scrolls horizontally on small viewports
- [ ] All badge and chip text is readable at 375px viewport width

---

## LLM Provider Smoke Tests

### Verify Ollama mode

```bash
# From backend/ with venv active and .env set to LLM_PROVIDER=ollama:
uvicorn app.main:app --reload
# Check terminal:
# [WARMUP] Touching SentenceTransformer...
# [WARMUP] Touching Ollama...
# [WARMUP] Complete.
```

Then submit any analysis and confirm `[TIMING] llm_client.py generate_completion (ollama):` appears in the log.

### Verify Gemini mode

```bash
# From backend/ with LLM_PROVIDER=gemini and GEMINI_API_KEY set:
uvicorn app.main:app --reload
# Check terminal:
# [WARMUP] Gemini provider active (gemini) — skipping heavy model warmup.
# [WARMUP] Complete.
```

Then submit an analysis and confirm `[TIMING] llm_client.py generate_completion (gemini-key-1/gemini-3.5-flash):` appears in the log.

### Verify grounding check

The `force_hallucinate` parameter in `tailor.py` can be toggled to `True` in a local test run to inject `"GraphQL"` and `"MongoDB"` into the tailoring prompt. The expected result is `is_grounded: false` with both terms in `hallucinations_caught` for any user whose resume does not list those technologies.

---

## Known Testing Limitations

- **No unit tests exist** for any module. Core logic such as `_normalize_section`, `_clamp_score`, and `verify_grounding` is not covered by automated assertions.
- **No CI pipeline** is configured. There is no GitHub Actions workflow or similar.
- **LLM output is non-deterministic.** The `temperature: 0.3` setting in the Gemini provider reduces variance, but JSON parse failures are possible on any given run. Manual re-testing may produce different scores and improvement suggestions.
- **The `truth_guard_extract.txt` prompt file** exists in `backend/app/prompts/` but is not called by any application code. `extract_truth_guard_facts()` is fully deterministic Python — the file is a historical artifact.
