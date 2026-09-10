# Nexora — Project Overview

## What Is Nexora?

Nexora is an AI-powered career development platform that acts as a resume analyst, mock interview coach, and job-match advisor in one tool. It gives job seekers the kind of specific, honest, evidence-based feedback that a recruiter or hiring manager would give — not generic encouragement.

The platform's defining characteristic is its **Truth Guard system**: every piece of AI-generated feedback and every interview question is anchored to what the user actually wrote on their resume. The system structurally prevents AI hallucination at the output layer, not merely at the prompt level.

---

## The Problem Being Solved

Early-career candidates and job seekers face three compounding problems:

1. **Resume blindness** — They cannot tell why an application was rejected, whether their resume clears ATS screening, or which specific keywords are absent for a given role.

2. **Non-actionable feedback** — Most AI writing tools produce encouragement, not critique. Real recruiter feedback is specific: weak bullet impact, missing quantification, absent role keywords, formatting that confuses parsers.

3. **Interview uncertainty** — Candidates don't know what questions to expect, how answers will be judged, or which dimension of their performance (technical accuracy, communication, confidence) needs the most work.

Nexora addresses all three by running every feature through verified resume data, producing feedback that is specific, grounded, and honest.

---

## Target Users

- **Recent graduates and students** entering the job market for the first time
- **Job seekers** actively applying and wanting to improve their hit rate
- **Career switchers** identifying skill gaps between their background and a new target role
- **Interview preparation candidates** who want structured, scored practice sessions

---

## Key Features

| Feature | Summary |
|---|---|
| **Resume Analysis** | Unified AI analysis: ATS score (0–100), five-dimension breakdown, missing keywords vs. a real job description, recruiter-style verdict. Responses are cached by input hash so re-uploads of the same resume are instant. |
| **Resume Feedback Editor** | Five-tab editor (Overview, Experience, Skills, Education, Formatting) with apply/dismiss controls per improvement. State persists to the backend. |
| **Resume Tailoring** | Rewrites experience bullets toward the target role using only the user's verified skills. Post-generation grounding check runs before the result is shown. |
| **Job Match** | Compares extracted skills against a pasted job description. Returns match percentage, matched skills, and missing skills. |
| **Career Roadmap** | Month-by-month learning plan generated from missing skills. Integrates with Job Match output. Background processing with polling. |
| **Mock Interview — HR** | Behavioral questions, evaluated on communication and confidence. |
| **Mock Interview — Technical** | Technical questions scoped strictly to the candidate's verified skill set. |
| **Mock Interview — Resume-Based** | Project-by-project audit; the AI picks specific resume entries and makes the candidate defend them. |
| **Interview Scoring** | Post-session scoring across technical accuracy, communication, and confidence. Issues reference actual words from the transcript. |
| **Profile** | Auto-populated from resume analysis facts. Stored locally. Supports manual sync from the latest analyzed resume. |
| **Recommendations** | Derived from real analysis data and interview feedback. No hardcoded content. |
| **Analysis History** | Full list of past resume uploads and interview sessions. |

---

## Complete User Journey

A typical user follows this path through the application:

```
1. Landing Page
   → Sign up / Get started (no account required)

2. Resume Upload (/resume-analysis)
   → Upload PDF or DOCX (max 10 MB)
   → Set career level and target role
   → Optionally paste a job description
   → Submit → polling begins (progress stages shown with elapsed timer)

3. Analysis Results (/analysis/:id)
   → ATS score (0–100), verdict reason, five-dimension breakdown bars
   → Missing keywords (vs. job description or role name)
   → AI executive summary, key strengths, improvement areas
   → Profile auto-populated from Truth Guard extraction

4. Resume Feedback Editor (/analysis/:id/feedback)
   → Five tabs: Overview, Experience, Skills, Education, Formatting
   → Per-improvement apply/dismiss (persisted to backend)
   → On-demand bullet tailoring with grounding check result

5. Job Match (/job-match)
   → Paste a new job description
   → See match percentage, matching skills, missing skills
   → "Generate Roadmap" navigates to Roadmap with missing skills pre-loaded

6. Career Roadmap (/roadmap)
   → Month-by-month learning plan for missing skills
   → Background generation with 2-second polling

7. Mock Interview (/interview)
   → Choose mode: HR, Technical, or Resume-Based
   → Select a previously analyzed resume as the session base
   → 5-question session with real-time chat UI
   → Session ends automatically after 5 answers, or user clicks "End & Get Feedback"

8. Interview Feedback (/interview/:sessionId/feedback)
   → Overall score plus accuracy / communication / confidence sub-scores
   → 2–4 specific issues with concrete suggestions

9. Dashboard (/dashboard)
   → Resume score KPI, interview readiness average, skills tracked count
   → Resume health breakdown bars, AI insight card, recent activity feed

10. Recommendations (/recommendations)
    → Prioritized action items derived from analysis and interview data

11. Profile (/profile)
    → View and edit extracted name, education, skills, projects
```

---

## Current Project Status

The project is **fully implemented and deployed**. All features listed above are operational. The live deployment uses:

- **Backend:** Render (FastAPI, `LLM_PROVIDER=gemini`)
- **Frontend:** Vercel (static build)
- **Live URL:** [https://nexora-ogeo.onrender.com](https://nexora-ogeo.onrender.com) (backend API)

Local development runs in Ollama mode (fully offline, no API key needed) or Gemini mode (cloud, requires a key).

---

## Verified Limitations

- **Ollama inference speed:** `qwen2.5:1.5b` on CPU-only hardware runs at roughly 10–11 tokens/second. A full analysis (unified call at 750 tokens) takes approximately 60–90 seconds on a cold run; subsequent identical uploads are served from the in-memory cache instantly.
- **Resume parsing accuracy:** Text extraction (PyMuPDF for PDFs, python-docx for DOCX) is optimized for single-column text layouts. Heavily designed or multi-column resumes may parse with reduced fidelity.
- **No user authentication:** Nexora is a single-user local tool by design. All data in the SQLite database is globally accessible to anyone with access to the running instance.
- **Render free-tier ephemeral disk:** The `nexora.db` file is recreated empty on each Render redeploy or instance restart.
- **Gemini free-tier quota:** The free tier enforces rate limits. Multiple uploads in a short window may hit a 429; the backend automatically retries with the next configured key if additional keys are set.
- **Profile is local only:** The user profile is stored in `localStorage`. It does not sync across devices or browsers.
