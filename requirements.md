CareerMirror AI
An Honest AI Career Coach
Software Requirements Specification & Project Plan
Personal Project — Portfolio / Career Build
Owner: Umama — Full-Stack & AI Engineering (solo)
Build Window: 10–14 Days • Team Size: 1 (solo)
Version 2.0 — August 2026
1. Introduction
1.1 Problem Statement
Fresh graduates and early-career job seekers repeatedly run into three connected problems when preparing to enter the job market:
Resume Blindness — candidates cannot tell why their resume is being rejected, whether it matches a target job, whether it is ATS-friendly, or what skills are missing.
Generic, Non-Actionable Feedback — most existing tools default to encouragement (“your resume is great!”) instead of the specific, evidence-based critique that real recruiters apply: weak descriptions, missing keywords, no measurable impact, poorly explained projects.
Interview Uncertainty — candidates do not know what questions to expect, how recruiters actually judge answers, or how to improve between attempts.
1.2 Proposed Solution
CareerMirror AI acts as a recruiter and career mentor combined. It follows a single repeatable loop — Analyze → Critique → Improve → Practice → Track Growth — and, unlike typical AI writing tools, it does not invent skills or hand out inflated encouragement. Every piece of feedback and every rewritten resume line is grounded in the user's actual, stated skills and projects.
1.3 Objectives
Provide ATS-style resume analysis with specific, actionable feedback rather than generic praise.
Generate tailored resume content that stays strictly grounded in the user's real experience (Truth Guard).
Simulate realistic HR, technical, and resume-based interviews.
Score interview performance across technical accuracy, communication, and confidence.
Generate a personalized, time-boxed roadmap toward a target role.
Compute a job-fit match score against a specific job description.
Run entirely offline on a local LLM (Ollama mode) or via Google Gemini API (cloud mode) — the LLM backend is swappable via an environment variable, so local dev/demo uses Ollama with no external API keys or cloud dependency, while deployment can use Gemini for faster inference.
2. Project Scope
2.1 Core Features — Full Committed Scope
All features below are committed deliverables for this build. Nothing from the original feature set has been cut — only the timeline changed to reflect a solo, 10–14 day build instead of a 3-day, 2-person build.
AI Resume Analyzer (ATS score, missing keywords, formatting feedback, recruiter verdict)
AI Resume Tailoring with Truth Guard grounding
AI Mock Interview — HR, Technical, and Resume-based modes (text-based chat)
Honest Feedback Engine (post-interview scoring and issue list)
Career Roadmap Generator
Job Match System
2.2 Stretch Goals — If Time Remains
Voice-based interview mode using Whisper (tiny) speech-to-text
Cloud sync (Firebase) as an alternative to local SQLite
2.3 Known Limitations (stated upfront)
Resume parsing is tuned for single-column resume layouts; heavily designed, multi-column resumes may extract with reduced accuracy.
Feedback quality is bounded by the local model's reasoning ability. The Truth Guard system reduces hallucinated claims but does not guarantee perfect accuracy.
The system runs locally on the presenting laptop for the demo; it is not deployed to a public server.
No user accounts, login, or authentication — this is a single-user, local-only tool by design (see NFR-Privacy). A UI login/signup/settings system would add real build time for zero functional requirement it actually serves, so it is explicitly excluded rather than accidentally scoped in later.
3. Functional Requirements
Each requirement is grounded to one of the six core features and is testable end to end. This section is unchanged from the original scope — every requirement below remains a committed deliverable.
ID
Requirement
Description
FR-1
Resume Upload & Parsing
User uploads a PDF resume; the system extracts and structures the raw text.
FR-2
Job Description Input
User pastes or uploads a target job description.
FR-3
ATS Compatibility Score
System returns a percentage ATS score and lists missing keywords vs. the job description.
FR-4
Formatting Feedback
System flags formatting issues — excess text, weak headings, length problems.
FR-5
Recruiter-Style Verdict
System returns a shortlist-probability verdict with a stated reason.
FR-6
Skill / Fact Extraction
System extracts a structured list of the user's real skills and projects, used as the Truth Guard source of truth.
FR-7
Resume Tailoring
System rewrites resume bullet points to better match a target job, using only facts present in FR-6's extracted list.
FR-8
Grounding Check
Before returning tailored content, the system checks each generated claim against the extracted skill list and flags or strips anything ungrounded.
FR-9
Mock Interview — HR Mode
Conversational interview evaluating communication, structure, and confidence.
FR-10
Mock Interview — Technical Mode
Domain/technical questions relevant to the target role.
FR-11
Mock Interview — Resume-Based Mode
Questions generated directly from specific projects listed on the user's resume.
FR-12
Interview Scoring
System scores technical accuracy, communication, and confidence, with a concrete issue list.
FR-13
Career Roadmap Generation
Given current skills and a target role, system generates a month-by-month skill-building plan.
FR-14
Job Match Scoring
Given a resume and job description, system computes a percentage match with matching vs. missing skills.
FR-15
Session History
System stores past analyses and interview attempts per user for progress tracking (SQLite).
4. Non-Functional Requirements
Category
Requirement
Performance
Resume analysis runs as a two-stage flow — the fast path (ATS score, verdict, missing keywords) completes in ~60s when re-analyzing a recently processed resume and ~75-90s for a new resume (cold prompt prefill dominates); the full pipeline (detailed feedback) completes in ~140-175s; each interview chat turn returns within ~4.7-5.5s warm (meets original <5s target) — measured on 8GB RAM, CPU-only hardware with qwen2.5:1.5b at ~10-11 tok/s generation. The original <8s analysis target was based on mocked-LLM timing and is not achievable on this hardware, so NFR-4 was revised to these measured values. RAG context is kept small specifically to hold this bound.
Reliability
Core features function fully offline with no network dependency when running in Ollama mode (the default). In Gemini mode, an internet connection is required for LLM API calls.
Privacy
In Ollama mode, all resume and personal data stays on-device; nothing is sent to a third-party API. In Gemini mode, resume text and prompts are sent to Google's Generative AI API for processing — review Google's data policies before deploying with sensitive data.
Usability
Interface is usable without instructions; scores and feedback are shown in plain language.
Portability
Runs on a standard laptop (8GB RAM, no GPU) using only open-source, local tools.
Maintainability
Clear separation between parsing, retrieval, LLM, and presentation layers so features extend independently.
Groundedness
Generated content must never assert skills, experience, or claims absent from the user's own resume (Truth Guard requirement).
5. System Architecture
The pipeline runs entirely on-device. A resume and job description are parsed into clean text, split down two paths — a Truth Guard skill/fact extraction path and a RAG embedding path — and both feed into the local LLM, which produces grounded output for each of the six feature modules, persisted to SQLite and surfaced through the React dashboard.
6. Technology Stack
Layer
Technology
Purpose
Frontend
React + Tailwind CSS
Dashboard, resume upload, interview chat UI
Backend
FastAPI (Python)
REST API layer connecting frontend to the AI pipeline
LLM Runtime
Ollama — Qwen2.5 1.5B / Google Gemini API (gemini-3.5-flash)
LLM inference — swappable via LLM_PROVIDER env var (ollama for offline, gemini for cloud deployment)
RAG Orchestration
LangChain
Chains retrieval and prompting for each feature
Embeddings
Sentence-Transformers (all-MiniLM-L6-v2)
Converts resume/JD text into vectors for retrieval
Vector Store
ChromaDB
Stores and retrieves resume/JD/interview-question chunks
PDF Parsing
PyMuPDF
Extracts text from uploaded resume PDFs
Database
SQLite
Stores user sessions, scores, and history
Voice (stretch)
Whisper (tiny)
Speech-to-text for the optional voice interview mode
7. AI / LLM Pipeline Design
7.1 LLM Setup
The LLM backend is swappable via the LLM_PROVIDER environment variable:
Ollama mode (default, LLM_PROVIDER=ollama): Install Ollama (ollama.com), pull the model: ollama pull qwen2.5:1.5b. Ollama runs a local server (default port 11434); the FastAPI backend calls it over HTTP — no API key, no internet required at inference time.
Gemini mode (LLM_PROVIDER=gemini): Set GEMINI_API_KEY to a valid Google AI Studio key (get one at https://aistudio.google.com/apikey). Install the SDK: pip install google-generativeai. The backend calls Gemini's REST API — requires internet access but no local model hardware.
7.2 RAG Pipeline
Resume and job description text is chunked after parsing.
Chunks are embedded with all-MiniLM-L6-v2 and stored in a per-session ChromaDB collection.
At query time, the most relevant chunks are retrieved and injected into the prompt sent to Qwen2.5 1.5B (phi-3 mini measured 43.21s on this hardware, over 5x the original NFR-1 target).
7.3 Truth Guard System
This is the feature that makes the “honest” pitch credible, so it is treated as a real engineering component rather than a prompt instruction:
Step 1 — Extraction: a dedicated extraction pass over the resume produces a structured list of the user's actual skills, tools, and project claims.
Step 2 — Grounded generation: every tailoring, feedback, or interview-question prompt includes this extracted list and is instructed to reference only items in it.
Step 3 — Post-generation check: generated skill/tool mentions are compared against the extracted list (string or embedding-similarity match); unmatched items are flagged or stripped before the response reaches the user.
8. Project Structure
backend/
app/
  main.py
  api/
    resume.py
    interview.py
    roadmap.py
    job_match.py
  core/
    llm_client.py       # Ollama wrapper
    rag_pipeline.py      # embeddings + ChromaDB
    truth_guard.py        # extraction + grounding check
    pdf_parser.py          # PyMuPDF wrapper
  models/
    schemas.py
    db.py                     # SQLite models
  prompts/
    resume_analysis.txt
    resume_tailoring.txt
    interview_hr.txt
    interview_technical.txt
    feedback_engine.txt
    roadmap.txt
requirements.txt
chroma_db/                    # local vector store data

frontend/
src/
  pages/
    Landing.jsx
    Dashboard.jsx
    ResumeUpload.jsx           # includes brief context questions inline — no separate onboarding flow
    AnalysisResults.jsx
    ResumeFeedback.jsx
    InterviewRoom.jsx          # HR, Technical, Resume-based modes (FR-9/10/11)
    InterviewFeedback.jsx      # scoring + issue list (FR-12)
    JobMatch.jsx               # FR-14 — absorbs what would have been a separate "Career Match" page
    Roadmap.jsx                # FR-13 — shows skill gaps in context of the plan, not a separate page
    Recommendations.jsx
    AnalysisHistory.jsx        # simple table, no separate progression chart system
    Profile.jsx                # lightweight read-only summary, no editable CRUD/settings
  components/
    ScoreCard.jsx
    ChatBubble.jsx
    UploadDropzone.jsx
  api/
    client.js
App.jsx
package.json
tailwind.config.js
9. Ownership
This build is solo. The original plan assumed a 2-person, 3-day sprint (backend/AI vs. frontend split); the timeline in Section 10 below re-plans the exact same feature set for one person working across 10–14 days, with backend/AI work and frontend work sequenced so each layer is stable before the next depends on it, rather than two people working the layers simultaneously.
Owner
Scope
Umama (solo)
Full stack: FastAPI backend, Ollama/LLM integration, RAG pipeline, Truth Guard system, prompt design, SQLite schema, all API endpoints, React + Tailwind frontend, resume upload flow, interview chat interface, visual design, end-to-end integration and testing.
10. Solo Implementation Plan (10–14 Days)
Re-sequenced from the original 3-day, 2-person plan to a solo build. Every feature from Section 2.1 remains in scope — nothing has been cut. The plan is organized so the riskiest, most foundational piece (local LLM + RAG on real hardware) is validated on Day 1, before any UI work depends on it, and each subsequent phase only builds on a layer that already works. Days 13–14 exist as float — use them if any earlier phase overruns, or attempt the voice stretch goal if on schedule.
Day(s)
Phase
What Gets Built
1
Foundation & Risk Validation
• Install Ollama, pull qwen2.5:1.5b (phi3:mini measured 43.21s on this hardware, over 5x the original NFR-1 target), confirm it actually runs at usable speed on your real 8GB CPU-only hardware — this is the single biggest project risk, so it gets tested first, not last.
• Set up FastAPI project skeleton and PyMuPDF resume parser.
• Set up ChromaDB + sentence-transformers embeddings pipeline.
• Define the full API contract (all endpoint shapes for every feature) up front, since there's no second person to negotiate it with mid-build.
2–3
Resume Analyzer + Truth Guard Core
• Build FR-1/FR-2: resume upload/parsing + job description input.
• Build FR-6: skill/fact extraction pass (Truth Guard Step 1).
• Build FR-3/FR-4/FR-5: ATS score, formatting feedback, recruiter verdict.
• Write and test the resume_analysis.txt prompt directly against Qwen2.5 1.5B (phi-3 mini measured 43.21s on this hardware, over 5x the original NFR-1 target); tune wording based on real output quality, not assumption.
4–5
Resume Tailoring + Grounding Check
• Build FR-7: resume tailoring generation.
• Build FR-8: Truth Guard Steps 2–3 — grounded generation + post-generation similarity check against the extracted skill list.
• This is the highest-risk feature in the whole product (it's the actual “honest” differentiator) — budget real time to test it against several sample resumes and tune the similarity threshold until false-positive/false-negative flags feel right.
6
Frontend Foundation
• React + Tailwind scaffold, design system (colors/typography).
• Build Dashboard shell and Resume Upload page.
• Wire Resume Analyzer + Tailoring pages to the now-working backend from Days 2–5, since that layer is stable enough to build against.
7–9
Mock Interview System
• Build FR-9/FR-10/FR-11: HR, Technical, and Resume-based interview modes (backend prompts + conversation logic).
• Build FR-12: interview scoring and issue-list generation.
• Build the Interview Room chat UI and Score Card component; wire to backend.
10
Roadmap + Job Match
• Build FR-13: career roadmap generator.
• Build FR-14: job match scoring.
• Build the Roadmap and Job Match frontend views; wire to backend.
11
Session History & Persistence
• Build FR-15: SQLite session history across all features.
• Add history views so past analyses/interview attempts are actually retrievable, not just stored.
12
Integration, Performance, Polish
• Full end-to-end testing across every feature with real resumes and job descriptions.
• Performance tuning: response caps, pre-loaded model at server start, confirm the NFR-4 latency targets (~60-90s fast path / ~140-175s full pipeline / ~5s chat turn) actually hold.
• UI/UX polish: loading states, error states, empty states across all five frontend pages.
13–14
Float — Stretch Goal or Buffer
• If on schedule: attempt the voice interview stretch goal (Whisper tiny).
• If behind schedule: this is intentional slack — use it to finish whichever phase above overran, rather than compressing quality elsewhere.
• Either way: prepare the demo script and any presentation materials.
11. Installation & Setup Requirements
11.1 Tools to Install
Node.js (v18+) and npm — for the frontend
Python 3.10+ — for the backend
Ollama (ollama.com) — local LLM runtime
Model pull: ollama pull qwen2.5:1.5b (phi3:mini measured 43.21s on this hardware, over 5x the original NFR-1 target)
11.2 Python Packages
fastapi, uvicorn, pymupdf, sentence-transformers, chromadb, langchain, python-multipart
(sqlite3 is part of the Python standard library — no separate install needed.)
11.3 Node Packages
react, react-dom, react-router-dom, tailwindcss, axios
11.4 Stretch — Voice Mode
openai-whisper (or whisper.cpp for lower resource use)
12. Risks & Mitigations
Risk
Impact
Mitigation
Full feature scope may not fit 10–14 solo days
Demo shows incomplete features
Days 13–14 are explicit float/buffer, not stretch-only; voice mode is cut first if behind schedule.
Small local LLM may hallucinate on feedback/grounding
Inaccurate feedback undermines the “honesty” pitch
Truth Guard 3-step design (Section 7.3); Qwen2.5 1.5B (phi-3 mini measured 43.21s on this hardware, over 5x the original NFR-1 target) chosen over the smaller 1B model for stronger reasoning; Days 4–5 explicitly budget real tuning time for this specific risk.
CPU-only inference on 8GB RAM may be slow live
Laggy, awkward demo experience
Validated first, on Day 1, before any other work depends on it. Cap response length, keep RAG context small, pre-load the model at server start, close unnecessary apps during the demo.
Voice interview adds integration risk
Extra failure point during judging/demo
Treated strictly as a stretch goal on the float days, not a core deliverable.
Resume PDF parsing varies by layout
Parsing errors on complex resumes
Scope to single-column resumes; state the limitation openly in the demo.
Cloud dependency (Firebase) could fail without internet
Feature breaks during judging
SQLite chosen as the committed local database.
Solo build has no second person to catch mistakes in real time
Bugs found later, more costly to fix
Sequenced plan validates each layer (Day 1 LLM risk, Days 2–5 backend core) before building UI on top of it, so a mistake surfaces before more work depends on it.
13. Conclusion
CareerMirror AI addresses a problem every early-career candidate has felt: not knowing why they are being rejected and not having anyone willing to say so plainly. By grounding every piece of feedback in the user's actual resume through the Truth Guard system, and by running entirely offline on a local LLM, the project delivers a career coach that is both private and honest by design — not just in its pitch, but in its architecture. The 10–14 day solo plan above carries the exact same full feature scope as the original 3-day, 2-person plan — nothing has been cut — resequenced so the riskiest technical assumption (local LLM performance) is proven first, and each subsequent phase builds only on a layer already known to work.