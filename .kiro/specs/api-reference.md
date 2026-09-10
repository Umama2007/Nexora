# Nexora — API Reference

**Base URL (production):** `https://nexora-ogeo.onrender.com/api`  
**Base URL (local development):** `http://127.0.0.1:8000/api`  
**CORS:** `allow_origins=["*"]`, `allow_credentials=False`

All endpoints return JSON. Error responses follow FastAPI's default `{"detail": "..."}` shape, except where noted.

---

## Health

### `GET /health`

Returns server status.

**Response `200`:**
```json
{ "status": "ok" }
```

---

## Resume Endpoints

### `POST /api/resumes/upload`

Upload a resume file and start background analysis.

**Request:** `multipart/form-data`

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | File | ✓ | PDF or DOCX, max 10 MB (validated on frontend) |
| `targetRole` | string | ✓ | e.g. `"Full Stack Engineer"` |
| `careerLevel` | string | ✓ | `student` \| `recent grad` \| `job seeker` \| `career switch` |
| `jobDescription` | string | | Optional job description text; defaults to `""` |

**Response `200`:**
```json
{ "resumeId": "resume-a1b2c3d4" }
```

The analysis runs in a `BackgroundTask`. Poll `/api/resumes/:id/status` for progress.

---

### `GET /api/resumes/:resume_id/status`

Poll analysis progress.

**Response `200` (while processing):**
```json
{
  "status": "processing",
  "score_data": null,
  "improvements_data": null,
  "truth_facts": null,
  "missing_keywords": null,
  "progress_stage": 2
}
```

`progress_stage` values: `0` = parsing, `1` = Truth Guard extraction, `2` = LLM analysis, `3` = saving, `4` = done.

**Response `200` (completed):**
```json
{
  "status": "completed",
  "score_data": { "score": 72, "status": "Good" },
  "missing_keywords": ["Docker", "Kubernetes"],
  "improvements_data": {},
  "truth_facts": { "name": "...", "education": "...", "skills": [], "tools": [], "projects": [] },
  "progress_stage": 4,
  "analysis_id": "analysis-resume-a1b2c3d4"
}
```

**Response `200` (error):**
```json
{
  "status": "error",
  "message": "Analysis LLM output was unreadable: ...",
  "error_code": "AI_PROVIDERS_EXHAUSTED"  // present only for quota errors
}
```

**Response `200` (not found — no upload for this ID):**
```json
{ "status": "not_found" }
```

---

### `GET /api/resumes`

List all uploaded resumes, newest first.

**Response `200`:** Array of resume objects.
```json
[
  {
    "id": "resume-a1b2c3d4",
    "filename": "my_resume.pdf",
    "targetRole": "Full Stack Engineer",
    "careerLevel": "recent grad",
    "uploadedAt": "1725321600.0",
    "jobDescription": ""
  }
]
```

---

### `GET /api/resumes/:resume_id`

Get a single resume by ID.

**Response `200`:** Single resume object (same shape as above).  
**Response `200` (not found):** `null`

---

## Analysis Endpoints

### `GET /api/analyses/:resume_id`

Get the full analysis for a resume.

**Response `200`:**
```json
{
  "id": "analysis-resume-a1b2c3d4",
  "resumeId": "resume-a1b2c3d4",
  "score": 72,
  "status": "Good",
  "breakdown": {
    "content": 75,
    "impact": 60,
    "skills": 80,
    "experience": 70,
    "formatting": 65,
    "missing_keywords": ["Docker", "Kubernetes"],
    "keyword_source": "job_description",
    "verdict_reason": "Strong frontend profile but lacks container experience required by most listings."
  },
  "summary": "...",
  "strengths": ["Strong React experience", "..."],
  "improvements": [
    {
      "id": "imp-1",
      "section": "Experience",
      "current": "Built a web app",
      "feedback": "Lacks quantification and impact metrics.",
      "suggestion": "Delivered a React SPA serving 2,000 daily users, reducing page load time by 40%.",
      "status": "pending"
    }
  ],
  "analysisStatus": "completed",
  "truthFacts": {
    "name": "Jane Doe",
    "education": "BSc Computer Science | University of XYZ | 2024",
    "skills": ["React", "TypeScript", "Python"],
    "tools": ["Git", "Docker", "GitHub Actions"],
    "projects": ["E-commerce Platform: Built a full-stack..."]
  }
}
```

`analysisStatus` values: `"completed"` | `"error"`  
`keyword_source` values: `"job_description"` | `"target_role"`

**Response `200` (not found):** `null`

---

### `PATCH /api/analyses/:resume_id/improvements`

Persist apply/dismiss state for a single improvement item.

**Request body (JSON):**
```json
{
  "improvementId": "imp-1",
  "status": "applied"
}
```

`status` must be one of: `"applied"`, `"dismissed"`, `"pending"`

**Response `200`:** Updated full analysis object (same shape as `GET /api/analyses/:id`).

**Error responses:**
| Status | Condition |
|---|---|
| `400` | `status` value not in allowed set |
| `404` | No analysis found for this `resume_id` |
| `404` | `improvementId` not found in the improvements array |

---

## Tailoring Endpoint

### `POST /api/tailor`

Rewrite resume bullets toward the target role using only verified facts. Runs the post-generation grounding check before returning.

**Request body (JSON):**
```json
{ "resumeId": "resume-a1b2c3d4" }
```

**Response `200`:**
```json
{
  "resumeId": "resume-a1b2c3d4",
  "targetRole": "Full Stack Engineer",
  "tailoredBullets": [
    {
      "original": "Built a web app using React",
      "tailored": "Architected and delivered a React 18 SPA with TypeScript, reducing time-to-interactive by 35%."
    }
  ],
  "grounding": {
    "is_grounded": true,
    "hallucinations_caught": []
  }
}
```

If `is_grounded` is `false`, `hallucinations_caught` contains the technology terms found in the output that were absent from the user's extracted facts.

**Error responses:**
| Status | Condition |
|---|---|
| `404` | No analyzed resume found for this ID, or analysis status is `"error"` |
| `400` | `truthFacts` are absent or contain no skills/tools |
| `502` | LLM output could not be parsed into a non-empty bullets list |

---

## Job Match Endpoint

### `POST /api/job-match`

Compare extracted resume facts against a job description.

**Request body (JSON):**
```json
{
  "resumeId": "resume-a1b2c3d4",
  "targetRole": "Backend Engineer",
  "jobDescription": "We are looking for a Python developer with FastAPI, PostgreSQL, Docker..."
}
```

**Response `200`:**
```json
{
  "id": "match-e5f6g7h8",
  "resumeId": "resume-a1b2c3d4",
  "targetRole": "Backend Engineer",
  "matchPercentage": 68,
  "matchingSkills": ["Python", "FastAPI", "Git"],
  "missingSkills": ["Docker", "PostgreSQL", "Kubernetes"]
}
```

**Error responses:**
| Status | Condition |
|---|---|
| `404` | No analyzed resume found, or analysis status is `"error"` |

---

## Roadmap Endpoints

### `POST /api/roadmap`

Start background generation of a month-by-month career roadmap.

**Request body (JSON):**
```json
{
  "targetRole": "Backend Engineer",
  "missingSkills": ["Docker", "PostgreSQL", "Kubernetes"]
}
```

**Response `200`:**
```json
{ "roadmapId": "roadmap-i9j0k1l2" }
```

---

### `GET /api/roadmap/:roadmap_id/status`

Poll roadmap generation progress.

**Response `200` (processing):**
```json
{ "status": "processing" }
```

**Response `200` (completed):**
```json
{ "status": "completed", "roadmap_id": "roadmap-i9j0k1l2" }
```

**Response `200` (error):**
```json
{ "status": "error", "message": "..." }
```

**Response `200` (not found):**
```json
{ "status": "not_found" }
```

---

### `GET /api/roadmap/:roadmap_id`

Retrieve a completed roadmap.

**Response `200`:**
```json
{
  "id": "roadmap-i9j0k1l2",
  "targetRole": "Backend Engineer",
  "missingSkills": ["Docker", "PostgreSQL"],
  "steps": [
    {
      "month": "Month 1",
      "title": "Mastering Docker Basics",
      "focus": "Containerization and Dockerfiles",
      "whyItMatters": "Docker is essential for consistent deployments in modern cloud environments."
    },
    { "month": "Month 2", "title": "...", "focus": "...", "whyItMatters": "..." }
  ]
}
```

**Response `200` (not found):** `null`

---

## Interview Endpoints

### `POST /api/interviews`

Start a new mock interview session.

**Request body (JSON):**
```json
{
  "resumeId": "resume-a1b2c3d4",
  "type": "Technical"
}
```

`type` must be one of: `"HR"`, `"Technical"`, `"Resume-Based"`

**Response `200`:**
```json
{
  "id": "interview-m3n4o5p6",
  "resumeId": "resume-a1b2c3d4",
  "type": "Technical",
  "status": "in-progress",
  "startedAt": "2026-08-30T14:22:00.000Z",
  "currentQuestionIndex": 1,
  "questionsCount": 5,
  "chatHistory": [
    {
      "id": "uuid-1",
      "sender": "ai",
      "text": "Welcome! Let's start — walk me through your experience with React.",
      "timestamp": "2026-08-30T14:22:00.000Z"
    }
  ]
}
```

**Error responses:**
| Status | Condition |
|---|---|
| `400` | `type` is not one of the three valid values |
| `404` | No analyzed resume found for this `resumeId`, or analysis status is `"error"` |

---

### `GET /api/interviews`

List all interview sessions, newest first.

**Response `200`:** Array of session objects (same shape as above).

---

### `GET /api/interviews/:session_id`

Get a single interview session.

**Response `200`:** Session object.  
**Error `404`:** Session not found.

---

### `POST /api/interviews/:session_id/chat`

Submit a candidate message and receive the next AI question.

**Request body (JSON):**
```json
{ "message": "I used React Hooks extensively, particularly useState and useEffect for managing component state." }
```

**Response `200`:**
```json
{
  "id": "interview-m3n4o5p6",
  "resumeId": "resume-a1b2c3d4",
  "type": "Technical",
  "status": "in-progress",
  "startedAt": "2026-08-30T14:22:00.000Z",
  "currentQuestionIndex": 2,
  "questionsCount": 5,
  "chatHistory": [ ... ],
  "response": "Good overview. How do you handle side effects that depend on multiple state values without creating infinite render loops?"
}
```

When `status` becomes `"completed"` (after the 5th answer), the frontend navigates to the feedback page.

**Error responses:**
| Status | Condition |
|---|---|
| `404` | Session not found |
| `400` | Session already completed |

---

### `POST /api/interviews/:session_id/score`

Trigger the scoring pass on a finished or early-ended session. **Idempotent** — returns the existing feedback row if already scored.

**Request body:** None required.

**Response `200`:**
```json
{
  "id": "fb-interview-m3n4o5p6",
  "sessionId": "interview-m3n4o5p6",
  "type": "Technical",
  "score": 74,
  "accuracy": 80,
  "communication": 68,
  "confidence": 72,
  "feedbackSummary": "Strong technical knowledge demonstrated, but answers were often verbose and buried the key point. Confidence wavered when asked about trade-offs.",
  "issues": [
    {
      "id": "iss-interview-m3n4o5p6-0",
      "type": "Communication",
      "description": "When asked about useEffect dependencies, the answer ran three paragraphs before reaching the core point.",
      "suggestion": "Lead with the direct answer in one sentence, then add supporting detail."
    }
  ]
}
```

**Error responses:**
| Status | Condition |
|---|---|
| `404` | Session not found |
| `400` | No candidate answers in the session yet |

---

### `GET /api/interviews/:session_id/feedback`

Retrieve persisted feedback for a scored session.

**Response `200`:** Feedback object (same shape as above).  
**Error `404`:** Feedback not found (session not yet scored).

---

## Error Handling Notes

### `AllProvidersExhaustedError` → HTTP 503

When all configured LLM providers (Ollama or all Gemini keys) fail or hit quota:

```json
{
  "detail": "Our AI service is temporarily at capacity — please try again in a few minutes.",
  "error_code": "AI_PROVIDERS_EXHAUSTED",
  "retry_after_seconds": 60
}
```

The response includes `Retry-After: 60` header.

### Standard FastAPI validation errors → HTTP 422

Pydantic model validation failures return the default FastAPI `{"detail": [...]}` array with field-level error information.
