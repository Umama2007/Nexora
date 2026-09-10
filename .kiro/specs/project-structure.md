# Nexora — Project Structure

## Repository Root

```
Nexora/
├── .gitignore                  # Excludes .env files, *.db, __pycache__, node_modules,
│                               #   dist/, backend/app/temp/* (keeps .gitkeep)
├── README.md                   # Project root README
├── requirements.md             # Original product requirements document
├── CareerMirror_AI_Requirements_v2.docx  # Source requirements document
│
├── backend/                    # Python FastAPI backend
├── frontend/                   # React TypeScript frontend
└── .kiro/
    └── specs/                  # Project documentation (spec-driven development)
        ├── overview.md
        ├── architecture.md
        ├── features.md
        ├── api-reference.md
        ├── setup-and-development.md
        ├── testing.md
        ├── deployment.md
        ├── project-structure.md  ← this file
        ├── changelog.md
        ├── requirements.md       # Functional requirements with acceptance criteria
        ├── design.md             # Technical design decisions
        └── tasks.md              # Implementation task checklist
```

---

## Backend (`backend/`)

```
backend/
├── .env                        # Live secrets — NEVER committed (in .gitignore)
├── .env.example                # Template with placeholder values — safe to commit
├── requirements.txt            # Core Python dependencies (Gemini-mode safe, no PyTorch)
│
└── app/
    ├── main.py                 # FastAPI app entry point
    │                           #   - CORS middleware (allow_origins=["*"])
    │                           #   - All route handlers (resumes, analyses, tailor,
    │                           #     job-match, roadmap, interviews)
    │                           #   - startup event: init_db(), validate_provider(), warmup
    │                           #   - _progress_store: in-memory polling state dict
    │                           #   - run_async_analysis(): background analysis pipeline
    │                           #   - _normalize_section(): deterministic section mapping
    │                           #   - AllProvidersExhaustedError → HTTP 503 handler
    │
    ├── core/
    │   ├── database.py         # SQLite connection factory and schema management
    │   │                       #   - get_db(): returns sqlite3.Connection (row_factory=Row)
    │   │                       #   - init_db(): CREATE TABLE IF NOT EXISTS for all 6 tables
    │   │                       #   - Additive migration guards via PRAGMA table_info
    │   │                       #   - DB_PATH = "nexora.db" (relative to backend/)
    │   │
    │   ├── llm_client.py       # Provider-agnostic LLM backend
    │   │                       #   - OllamaProvider: POST localhost:11434/api/generate
    │   │                       #   - GeminiProvider: POST generativelanguage.googleapis.com
    │   │                       #     (urllib only, not the google-genai SDK)
    │   │                       #   - FallbackProvider: ordered failover across keys
    │   │                       #   - _ResponseCache: in-memory LRU, 128 entries, 10 min TTL
    │   │                       #   - AllProvidersExhaustedError raised when all fail
    │   │                       #   - generate_completion(prompt, system, num_predict, timeout)
    │   │
    │   ├── truth_guard.py      # Step 1 of Truth Guard — fully local, no LLM
    │   │                       #   - extract_truth_guard_facts(resume_text) → dict
    │   │                       #   - Section scanner, name/education/skills/projects extractors
    │   │                       #   - TECH_TERMS + TOOL_TERMS + AMBIGUOUS_TERMS + DISPLAY_NAMES
    │   │                       #   - Bidirectional containment for compound entries
    │   │
    │   ├── grounding.py        # Step 3 of Truth Guard — post-generation verification
    │   │                       #   - TECH_TERMS: 100+ technology terms (curated lexicon)
    │   │                       #   - DISPLAY_NAMES: proper casing map
    │   │                       #   - verify_grounding(generated_text, truth_facts) → dict
    │   │                       #     {is_grounded: bool, hallucinations_caught: []}
    │   │
    │   ├── rag_pipeline.py     # Interview context retrieval — provider-aware
    │   │                       #   - OllamaRAGEngine: SentenceTransformer + ChromaDB
    │   │                       #   - GeminiRAGEngine: Gemini Embedding API + cosine similarity
    │   │                       #   - Public interface identical for both engines:
    │   │                       #     initialize_interview_rag(session_id, truth_facts)
    │   │                       #     get_interview_context(session_id, query, k=2) → str
    │   │
    │   └── pdf_parser.py       # File text extraction
    │                           #   - extract_text_from_pdf(): PyMuPDF, page-by-page
    │                           #   - extract_text_from_docx(): python-docx, paragraphs + tables
    │                           #   - extract_resume_text(): dispatcher by file extension
    │
    ├── api/
    │   ├── resume.py           # Resume analysis logic
    │   │                       #   - _unified_system(): builds the analysis prompt
    │   │                       #   - analyze_resume_once(): single LLM call, 750 tokens
    │   │                       #   - _parse_json(): strips markdown wrappers, parses JSON
    │   │
    │   ├── interview.py        # Interview session logic
    │   │                       #   - start_interview_session(): initialize RAG
    │   │                       #   - generate_opening_question(): mode-branched, 160 tokens
    │   │                       #   - chat_turn(): RAG retrieval + LLM response, 160 tokens
    │   │                       #   - score_interview(): full transcript scoring, 512 tokens
    │   │                       #   - _validate_feedback(): clamps scores, validates issues
    │   │
    │   ├── tailor.py           # Bullet rewriting
    │   │                       #   - generate_tailored_resume(): 512-token LLM call
    │   │                       #   - Calls verify_grounding() on every output
    │   │                       #   - force_hallucinate param for grounding tests
    │   │
    │   ├── job_match.py        # Job description matching
    │   │                       #   - analyze_job_match(): returns matchPercentage,
    │   │                       #     matchingSkills, missingSkills
    │   │
    │   └── roadmap.py          # Career roadmap generation
    │                           #   - generate_roadmap(): returns steps[] array
    │
    ├── models/
    │   └── schemas.py          # Pydantic models for API request/response types
    │                           #   (ImprovementItem, ResumeAnalysis, InterviewSession,
    │                           #    InterviewFeedback, JobMatch, Roadmap, etc.)
    │
    ├── prompts/                # Plain-text LLM system prompts (tunable without code changes)
    │   ├── interview_hr.txt         # HR behavioral interviewer persona
    │   ├── interview_technical.txt  # Technical interviewer, hard constraint on skill scope
    │   ├── interview_resume.txt     # Resume-based project audit interviewer
    │   ├── interview_scoring.txt    # Post-session evaluator, structured JSON output
    │   ├── job_match.txt            # ATS/recruiter comparison prompt
    │   ├── roadmap.txt              # Senior Engineering Manager mentor persona
    │   ├── tailor_resume.txt        # Resume bullet rewriter prompt
    │   └── truth_guard_extract.txt  # Historical artifact — NOT called at runtime
    │                               # (extract_truth_guard_facts is pure Python now)
    │
    └── temp/                   # Uploaded resume files (runtime landing directory)
        └── .gitkeep            # Keeps directory tracked; file contents are gitignored
```

---

## Frontend (`frontend/`)

```
frontend/
├── package.json            # Dependencies and scripts
│                           #   react ^19, react-router-dom ^7, lucide-react ^1.34
│                           #   vite ^8, typescript ~6, oxlint, @vitejs/plugin-react
├── vite.config.ts          # Vite config — single plugin: @vitejs/plugin-react
├── tsconfig.json           # Root TypeScript config
├── tsconfig.app.json       # App-specific TypeScript config
├── tsconfig.node.json      # Node-specific TypeScript config
├── .oxlintrc.json          # Oxlint configuration
├── .gitignore              # Excludes node_modules, dist, .vscode, .DS_Store
├── index.html              # SPA root HTML, mounts <div id="root">
│
├── public/
│   ├── favicon.svg         # Browser tab icon
│   └── icons.svg           # SVG icon sprite (if used)
│
└── src/
    ├── main.tsx            # React entry: ReactDOM.createRoot → <App />
    ├── App.tsx             # Root component: renders <AppRoutes />
    ├── App.css             # Global base styles
    ├── index.css           # CSS reset / base variables
    │
    ├── config.ts           # API_BASE constant
    │                       #   VITE_API_BASE env var || Render production URL
    │
    ├── types/
    │   └── index.ts        # All TypeScript interfaces
    │                       #   Resume, ResumeAnalysis, ImprovementItem, ScoreBreakdown,
    │                       #   TruthFacts, AnalysisStatus, ChatMessage, InterviewSession,
    │                       #   InterviewFeedback, InterviewIssue, JobMatch, Roadmap,
    │                       #   RoadmapStep, Recommendation, TailoredBullet, TailorResult,
    │                       #   UserProfile
    │
    ├── routes/
    │   └── AppRoutes.tsx   # BrowserRouter with all 14 routes
    │                       #   / (Landing, outside AppLayout)
    │                       #   All others wrapped in <AppLayout>
    │
    ├── layouts/
    │   └── AppLayout/
    │       ├── AppLayout.tsx        # Sidebar + Topbar shell with <Outlet>
    │       └── AppLayout.module.css
    │
    ├── components/
    │   ├── layout/
    │   │   ├── Sidebar.tsx          # Fixed sidebar (desktop) / slide drawer (mobile)
    │   │   ├── Sidebar.module.css
    │   │   ├── Topbar.tsx           # Top bar with page title and hamburger menu
    │   │   └── Topbar.module.css
    │   │
    │   ├── charts/
    │   │   ├── RadialScore.tsx      # SVG radial gauge for resume score display
    │   │   └── RadialScore.module.css
    │   │
    │   └── ui/                      # Shared UI component library
    │       ├── Badge.tsx / .module.css          # Status/category pill
    │       ├── Button.tsx / .module.css         # Variants: primary, secondary, ghost
    │       ├── Card.tsx / .module.css           # Container with optional title and extra slot
    │       ├── EmptyState.tsx / .module.css     # Empty data placeholder
    │       ├── ErrorState.tsx / .module.css     # Error display
    │       ├── LoadingState.tsx / .module.css   # Loading spinner wrapper
    │       ├── NetworkDiagram.tsx / .module.css # (Component present in codebase)
    │       ├── ProgressBar.tsx / .module.css    # Labelled progress bar with subLabel
    │       └── ScoreCard.tsx / .module.css      # KPI card with score + status text
    │
    ├── services/                   # API client modules — all async, fetch-based
    │   ├── resumeService.ts        # getResumes, getResume, getAnalysis, uploadResume,
    │   │                           #   updateImprovementStatus, tailorResume
    │   ├── interviewService.ts     # getSessions, getSession, createSession,
    │   │                           #   submitMessage, getFeedback, scoreSession
    │   ├── jobMatchService.ts      # matchJob
    │   ├── profileService.ts       # getProfile, saveProfile, autoPopulateFromResume,
    │   │                           #   syncFromLatestResume (localStorage-backed)
    │   └── recommendationService.ts # buildRecommendations (derives from live data)
    │
    ├── styles/
    │   ├── global.css              # App-wide typography and layout tokens
    │   └── variables.css           # CSS custom properties (colors, spacing, etc.)
    │
    └── pages/                      # One folder per route
        ├── Landing/
        │   ├── Landing.tsx
        │   └── Landing.module.css
        ├── Dashboard/
        │   ├── Dashboard.tsx
        │   └── Dashboard.module.css
        ├── ResumeUpload/
        │   ├── ResumeUpload.tsx    # Upload form, drag-and-drop, progress polling
        │   └── ResumeUpload.module.css
        ├── AnalysisResults/
        │   ├── AnalysisResults.tsx # Score banner, breakdown, keywords, strengths
        │   └── AnalysisResults.module.css
        ├── ResumeFeedback/
        │   ├── ResumeFeedback.tsx  # 5-tab editor, apply/dismiss, tailoring panel
        │   └── ResumeFeedback.module.css
        ├── InterviewRoom/
        │   ├── InterviewModeSelect.tsx  # Mode + resume picker
        │   ├── InterviewModeSelect.module.css
        │   ├── InterviewRoom.tsx        # Real-time chat UI, optimistic updates
        │   ├── InterviewRoom.module.css
        │   ├── InterviewFeedback.tsx    # Score breakdown + issue list
        │   └── InterviewFeedback.module.css
        ├── JobMatch/
        │   ├── JobMatch.tsx
        │   └── JobMatch.module.css
        ├── Roadmap/
        │   ├── Roadmap.tsx         # Timeline view, 2s polling, router state integration
        │   └── Roadmap.module.css
        ├── Recommendations/
        │   ├── Recommendations.tsx
        │   └── Recommendations.module.css
        ├── AnalysisHistory/
        │   ├── AnalysisHistory.tsx
        │   └── AnalysisHistory.module.css
        ├── Profile/
        │   ├── Profile.tsx
        │   └── Profile.module.css
        └── NotFound/
            ├── NotFound.tsx
            └── NotFound.module.css (also NotFound.tsx.module.css — duplicate artifact)
```

---

## Key File Relationships

```
main.py
  imports → database.py          (get_db, init_db)
  imports → llm_client.py        (LLM_PROVIDER, validate_provider, generate_completion)
  imports → api/resume.py        (analyze_resume_once)
  imports → api/interview.py     (start_interview_session, chat_turn, ...)
  imports → api/tailor.py        (generate_tailored_resume)
  imports → api/job_match.py     (analyze_job_match)
  imports → api/roadmap.py       (generate_roadmap)
  inline → core/truth_guard.py   (extract_truth_guard_facts — imported inside background task)
  inline → core/pdf_parser.py    (extract_resume_text — imported inside background task)
  inline → core/grounding.py     (TECH_TERMS, DISPLAY_NAMES — for keyword fallback)

api/interview.py
  imports → llm_client.py        (generate_completion)
  imports → rag_pipeline.py      (get_interview_context, initialize_interview_rag)

api/tailor.py
  imports → llm_client.py        (generate_completion)
  imports → grounding.py         (verify_grounding)

rag_pipeline.py
  imports → llm_client.py        (LLM_PROVIDER — to select engine)
  Ollama engine: sentence_transformers, chromadb  (deferred, only in Ollama mode)
  Gemini engine: http.client, json, os            (stdlib only)
```
