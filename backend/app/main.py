from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timezone
import uuid
import json
import time

# Load .env file BEFORE importing modules that read env vars at import time
# (llm_client.py reads LLM_PROVIDER and GEMINI_API_KEY at module level).
try:
    from dotenv import load_dotenv
    load_dotenv()  # looks for .env in the current working directory (backend/)
except ImportError:
    pass  # python-dotenv not installed — env vars must be set externally

from app.core.database import get_db, init_db
from app.core.llm_client import LLM_PROVIDER, validate_provider
from app.api.job_match import analyze_job_match
from app.api.roadmap import generate_roadmap
from app.api.interview import start_interview_session, chat_turn, generate_opening_question, score_interview
from app.api.tailor import generate_tailored_resume

app = FastAPI(title="Nexora API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for deployment (Vercel frontend → Render backend).
    allow_credentials=False,  # Must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for async progress polling
_progress_store = {}

@app.on_event("startup")
def startup_event():
    # Ensure schema exists (includes the analysisStatus migration for the fast/detailed split)
    init_db()

    # Validate the LLM provider configuration BEFORE anything else — a
    # misconfigured Gemini deployment (missing API key, bad provider name)
    # must fail at startup, not on first upload.
    validate_provider()
    print(f"Starting up Nexora API... Provider: {LLM_PROVIDER}")

    import threading
    def warmup():
        from app.core.llm_client import generate_completion
        try:
            if LLM_PROVIDER == "ollama":
                # In Ollama mode, pre-load the SentenceTransformer embedding
                # model and ping the local LLM so the first real request is
                # fast. This pulls in torch (~100 MB) but that's expected on
                # a machine running a local LLM.
                from app.core.rag_pipeline import get_rag_engine
                print("[WARMUP] Touching SentenceTransformer...")
                t0 = time.perf_counter()
                get_rag_engine()._get_model()
                t1 = time.perf_counter()
                print(f"[TIMING] Model load took {t1 - t0:.2f}s")

                print("[WARMUP] Touching Ollama...")
                generate_completion("Hello, this is a warmup.", system="You are helpful.")
            else:
                # In Gemini mode, skip ALL heavy imports. torch/transformers/
                # chromadb stay unloaded until someone actually starts an
                # interview (the only feature that needs RAG). This keeps the
                # server's RSS under ~80 MB at boot — critical for Render's
                # 512 MB free tier.
                print(f"[WARMUP] Gemini provider active ({LLM_PROVIDER}) — skipping heavy model warmup.")
            print("[WARMUP] Complete.")
        except Exception as e:
            print(f"Warmup failed: {e}")

    threading.Thread(target=warmup).start()

@app.get("/health")
def health_check():
    return {"status": "ok"}

# --- RESUME ANALYSIS ---

async def run_async_analysis(resume_id: str, file_path: str, target_role: str, job_description: str = ""):
    """Runs the split fast/detailed analysis pipeline.

    Truth Guard extraction runs ONCE, early, so its facts ground BOTH the
    fast prompt (score/verdict, FR-8) and the detailed prompt. The analyses
    row is written twice: after the fast path (analysisStatus =
    'fast_completed', which releases the frontend), then updated after the
    detailed path (analysisStatus = 'completed').

    When a job description was pasted at upload, the fast path compares
    missing keywords against the JD instead of the bare role name (FR-3).
    """
    _progress_store[resume_id] = {"status": "processing", "score_data": None, "improvements_data": None, "truth_facts": None, "missing_keywords": None, "progress_stage": 0}
    analysis_id = f"analysis-{resume_id}"
    
    try:
        from app.api.resume import analyze_resume_fast, analyze_resume_detailed
        from app.core.pdf_parser import extract_resume_text
        from app.core.truth_guard import extract_truth_guard_facts
        import asyncio
        
        t0 = time.perf_counter()
        
        # 1. Extract text (PDF or DOCX — the frontend accepts both, FR-1)
        print("Extracting resume text...")
        loop = asyncio.get_event_loop()
        resume_text = await loop.run_in_executor(None, extract_resume_text, file_path)
        
        # 2. Extract Truth Facts
        print("Extracting Truth Guard facts...")
        truth_facts = await loop.run_in_executor(None, extract_truth_guard_facts, resume_text)
        _progress_store[resume_id]["truth_facts"] = truth_facts
        _progress_store[resume_id]["progress_stage"] = 1
        
        # 3. Fast Analysis (JD-aware when a job description was provided)
        # The small local model occasionally generates malformed JSON. One
        # retry is usually enough; a second failure is treated as a genuine
        # error so the row lands with an honest 'error' status.
        fast_result = await analyze_resume_fast(resume_text, truth_facts, target_role, job_description)
        score_data = fast_result.get("score_data", {})
        missing_keywords = fast_result.get("missing_keywords", [])
        
        if not isinstance(score_data, dict) or score_data.get("score") is None:
            print("[RETRY] Fast analysis parse failed, retrying once...")
            fast_result = await analyze_resume_fast(resume_text, truth_facts, target_role, job_description)
            score_data = fast_result.get("score_data", {})
            missing_keywords = fast_result.get("missing_keywords", [])
        
        if not isinstance(score_data, dict) or score_data.get("score") is None:
            raise RuntimeError(f"Fast analysis output was unreadable after retry: {str(fast_result.get('error', ''))[:200]}")
        
        # Small local models sometimes forget to populate missing_keywords
        # even when the verdict_reason mentions them. Deterministic fallback:
        # scan the JD for tech terms not in the Truth Guard facts (FR-3).
        if not missing_keywords and job_description:
            from app.core.grounding import TECH_TERMS, DISPLAY_NAMES
            allowed = {str(s).strip().lower() for cat in ("skills", "tools") for s in (truth_facts.get(cat, []) or [])}
            jd_lower = job_description.lower()
            for term in TECH_TERMS:
                if term in jd_lower and not any(term in a or a in term for a in allowed if len(a) >= 3):
                    # Proper casing: check display-name map first, then
                    # short-acronym upper, then .title() fallback.
                    display = DISPLAY_NAMES.get(term)
                    if display:
                        missing_keywords.append(display)
                    elif len(term) <= 4 and term.isalpha():
                        missing_keywords.append(term.upper())
                    elif ' ' in term:
                        missing_keywords.append(term.title())
                    else:
                        missing_keywords.append(term.title())
                    if len(missing_keywords) >= 10:
                        break
        
        # Normalize the verdict label so it is consistent with the score
        # (small models sometimes pick a label that doesn't match the number).
        raw_score = score_data.get("score", 0)
        if raw_score >= 85:
            score_data["status"] = "Outstanding"
        elif raw_score >= 70:
            score_data["status"] = "Good"
        elif raw_score >= 50:
            score_data["status"] = "Average"
        else:
            score_data["status"] = "Poor"
        
        _progress_store[resume_id]["score_data"] = score_data
        _progress_store[resume_id]["missing_keywords"] = missing_keywords
        _progress_store[resume_id]["progress_stage"] = 2
        
        conn = get_db()
        # The analyses table has no dedicated missing_keywords column, so the
        # fast-path keywords ride along inside the breakdown JSON payload.
        # try/finally guarantees the connection is released even if the write
        # fails - the except block below opens its own connection, and a
        # leaked one could still hold SQLite's write lock.
        try:
            breakdown = score_data.get("breakdown", {})
            breakdown["missing_keywords"] = missing_keywords
            # Record what the keywords were matched against, so the UI can
            # label them honestly (FR-3), plus the FR-5 verdict reason.
            breakdown["keyword_source"] = "job_description" if job_description else "target_role"
            breakdown["verdict_reason"] = score_data.get("verdict_reason", "")
            
            conn.execute('INSERT INTO analyses (id, resumeId, score, status, breakdown, summary, strengths, improvements, truthFacts, analysisStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        (analysis_id, resume_id, 
                         score_data.get("score"), 
                         score_data.get("status"), 
                         json.dumps(breakdown), 
                         "", 
                         "[]", 
                         "[]",
                         json.dumps(truth_facts),
                         "fast_completed"))
            conn.commit()
        finally:
            conn.close()
        
        _progress_store[resume_id]["status"] = "fast_completed"
        _progress_store[resume_id]["analysis_id"] = analysis_id
        
        t1 = time.perf_counter()
        print(f"[TIMING] run_async_analysis FAST end-to-end: {t1 - t0:.2f}s")
        
        # 4. Detailed Analysis
        _progress_store[resume_id]["progress_stage"] = 3
        detailed_result = await analyze_resume_detailed(resume_text, truth_facts, target_role)
        
        imp_data = detailed_result.get("improvements_data", {})
        
        # A parse failure (_parse_json fallback) or a truncated generation
        # yields no usable detailed data. Persisting it as 'completed' would
        # silently show empty strengths/improvements — flag the row as an
        # error so the frontend surfaces its honest retry state instead.
        detailed_ok = isinstance(imp_data, dict) and bool(
            imp_data.get("summary") or imp_data.get("strengths") or imp_data.get("improvements")
        )
        
        _progress_store[resume_id]["improvements_data"] = imp_data
        _progress_store[resume_id]["progress_stage"] = 4
        
        conn = get_db()
        try:
            conn.execute('UPDATE analyses SET summary = ?, strengths = ?, improvements = ?, analysisStatus = ? WHERE id = ?',
                        (imp_data.get("summary", ""), 
                         json.dumps(imp_data.get("strengths", [])), 
                         json.dumps(imp_data.get("improvements", [])),
                         "completed" if detailed_ok else "error",
                         analysis_id))
            conn.commit()
        finally:
            conn.close()
        
        _progress_store[resume_id]["status"] = "completed" if detailed_ok else "error"
        if not detailed_ok:
            _progress_store[resume_id]["message"] = "Detailed feedback could not be generated (LLM output was truncated or unreadable)."
        
        t2 = time.perf_counter()
        print(f"[TIMING] run_async_analysis DETAILED end-to-end: {t2 - t1:.2f}s")
        print(f"[TIMING] run_async_analysis TOTAL end-to-end: {t2 - t0:.2f}s")
        
    except Exception as e:
        _progress_store[resume_id] = {"status": "error", "message": str(e)}
        # Flag any in-flight row so polling clients stop waiting for detailed data
        try:
            conn = get_db()
            try:
                conn.execute("UPDATE analyses SET analysisStatus = 'error' WHERE resumeId = ? AND analysisStatus = 'fast_completed'",
                             (resume_id,))
                # A failure before the fast-phase INSERT (PDF parse, Truth Guard,
                # or fast LLM call) leaves no row for the UPDATE above to flag,
                # which silently orphaned the resume. Persist an error row instead
                # so every upload reaches a terminal analysisStatus.
                if conn.execute("SELECT 1 FROM analyses WHERE resumeId = ?", (resume_id,)).fetchone() is None:
                    conn.execute('INSERT INTO analyses (id, resumeId, score, status, breakdown, summary, strengths, improvements, truthFacts, analysisStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                 (analysis_id, resume_id, None, None, json.dumps({"error": str(e)}), "", "[]", "[]", "[]", "error"))
                conn.commit()
            finally:
                conn.close()
        except Exception:
            pass


@app.post("/api/resumes/upload")
async def upload_resume(background_tasks: BackgroundTasks, file: UploadFile = File(...), targetRole: str = Form(...), careerLevel: str = Form(...), jobDescription: str = Form("")):
    resume_id = f"resume-{uuid.uuid4().hex[:8]}"
    file_path = f"app/temp/{file.filename}"
    
    import os
    os.makedirs("app/temp", exist_ok=True)
    with open(file_path, "wb") as f:
        f.write(await file.read())
        
    conn = get_db()
    try:
        conn.execute('INSERT INTO resumes (id, filename, targetRole, careerLevel, uploadedAt, jobDescription) VALUES (?, ?, ?, ?, ?, ?)', 
                     (resume_id, file.filename, targetRole, careerLevel, str(time.time()), jobDescription or ""))
        conn.commit()
    finally:
        conn.close()
    
    background_tasks.add_task(run_async_analysis, resume_id, file_path, targetRole, jobDescription or "")
    return {"resumeId": resume_id}

@app.get("/api/resumes/{resume_id}/status")
def get_resume_status(resume_id: str):
    if resume_id not in _progress_store:
        return {"status": "not_found"}
    return _progress_store[resume_id]

@app.get("/api/resumes")
def list_resumes():
    conn = get_db()
    rows = conn.execute('SELECT * FROM resumes ORDER BY uploadedAt DESC').fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/api/resumes/{resume_id}")
def get_resume(resume_id: str):
    conn = get_db()
    row = conn.execute('SELECT * FROM resumes WHERE id = ?', (resume_id,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

# The editor tabs filter improvements by exactly four section values
# (Experience/Skills/Education/Formatting). The local model drifts to free-form
# names like "PROJECTS" or "Technical Skills" — those items would be invisible
# in the UI. Map every improvement onto the closest tab when serializing, so
# legacy rows and any model drift both land somewhere visible.
_SECTION_RULES = (
    ("Experience", ("experience", "project", "work", "employment")),
    ("Skills", ("skill", "tool", "summary", "keyword")),
    ("Education", ("education", "academic", "course", "degree", "certification")),
    ("Formatting", ("format", "length", "heading", "layout", "ats", "readab", "style")),
)

def _normalize_section(raw) -> str:
    value = str(raw or "").lower()
    for canonical, markers in _SECTION_RULES:
        if any(m in value for m in markers):
            return canonical
    return "Experience"  # closest default for generic resume bullet feedback

def _analysis_response(row) -> dict:
    """Shared serializer for the analyses table (GET + PATCH)."""
    r = dict(row)
    # truthFacts (FR-6 extraction) powers Profile auto-population and the
    # Dashboard skills stat; parse defensively since error rows store "[]".
    try:
        truth_facts = json.loads(r.get("truthFacts") or "null")
    except (json.JSONDecodeError, TypeError):
        truth_facts = None
    try:
        improvements = json.loads(r["improvements"] or "[]")
    except (json.JSONDecodeError, TypeError):
        improvements = []
    for imp in improvements:
        if isinstance(imp, dict):
            imp["section"] = _normalize_section(imp.get("section"))
    return {
        "id": r["id"],
        "resumeId": r["resumeId"],
        "score": r["score"],
        "status": r["status"],
        "breakdown": json.loads(r["breakdown"]),
        "summary": r["summary"],
        "strengths": json.loads(r["strengths"]),
        "improvements": improvements,
        "analysisStatus": r.get("analysisStatus") or "completed",
        "truthFacts": truth_facts if isinstance(truth_facts, dict) else None
    }

@app.get("/api/analyses/{resume_id}")
def get_analysis(resume_id: str):
    conn = get_db()
    try:
        row = conn.execute('SELECT * FROM analyses WHERE resumeId = ?', (resume_id,)).fetchone()
    finally:
        conn.close()
    if row:
        return _analysis_response(row)
    return None

class ImprovementStatusReq(BaseModel):
    improvementId: str
    status: str  # 'applied' | 'dismissed' | 'pending'

@app.patch("/api/analyses/{resume_id}/improvements")
def update_improvement_status(resume_id: str, req: ImprovementStatusReq):
    """Persists the applied/dismissed state of one improvement item so the
    ResumeFeedback editor survives page reloads (was a frontend-only stub)."""
    if req.status not in ("applied", "dismissed", "pending"):
        raise HTTPException(status_code=400, detail="status must be 'applied', 'dismissed' or 'pending'")

    conn = get_db()
    try:
        row = conn.execute('SELECT * FROM analyses WHERE resumeId = ?', (resume_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Analysis not found for this resume.")

        improvements = json.loads(row["improvements"] or "[]")
        target = next((imp for imp in improvements if isinstance(imp, dict) and imp.get("id") == req.improvementId), None)
        if target is None:
            raise HTTPException(status_code=404, detail=f"Improvement '{req.improvementId}' not found.")

        target["status"] = req.status
        conn.execute('UPDATE analyses SET improvements = ? WHERE resumeId = ?', (json.dumps(improvements), resume_id))
        conn.commit()
        updated = conn.execute('SELECT * FROM analyses WHERE resumeId = ?', (resume_id,)).fetchone()
        return _analysis_response(updated)
    finally:
        conn.close()

# --- TAILOR (FR-7 + FR-8) ---

class TailorReq(BaseModel):
    resumeId: str

@app.post("/api/tailor")
def create_tailored_bullets(req: TailorReq):
    """Rewrites resume bullets toward the target job using ONLY the Truth
    Guard facts, then runs the deterministic grounding check on the output
    before returning it (FR-7 + FR-8)."""
    conn = get_db()
    try:
        resume_row = conn.execute('SELECT targetRole, jobDescription FROM resumes WHERE id = ?', (req.resumeId,)).fetchone()
        ana_row = conn.execute('SELECT truthFacts, analysisStatus FROM analyses WHERE resumeId = ?', (req.resumeId,)).fetchone()
    finally:
        conn.close()

    if not resume_row or not ana_row or (ana_row["analysisStatus"] or "") == "error":
        raise HTTPException(status_code=404, detail="No analyzed resume found for this ID. Analyze a resume first.")

    try:
        facts = json.loads(ana_row["truthFacts"])
    except (json.JSONDecodeError, TypeError):
        facts = None
    if not isinstance(facts, dict) or not (facts.get("skills") or facts.get("tools")):
        raise HTTPException(status_code=400, detail="Truth Guard facts are unavailable for this resume — re-analyze it first.")

    try:
        result = generate_tailored_resume(resume_row["targetRole"], facts, job_description=resume_row["jobDescription"] or "")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tailoring engine failed: {str(e)[:200]}")
    bullets = result.get("tailored_data", {})
    tailored = bullets.get("tailored_bullets") if isinstance(bullets, dict) else None
    if not isinstance(tailored, list) or not tailored:
        raise HTTPException(status_code=502, detail="The tailoring engine returned an unreadable result. Please try again.")

    return {
        "resumeId": req.resumeId,
        "targetRole": resume_row["targetRole"],
        "tailoredBullets": tailored,
        "grounding": result.get("grounding_result", {"is_grounded": True, "hallucinations_caught": []})
    }

# --- JOB MATCH ---

class JobMatchReq(BaseModel):
    resumeId: str
    targetRole: str
    jobDescription: str

@app.post("/api/job-match")
def create_job_match(req: JobMatchReq):
    conn = get_db()
    row = conn.execute('SELECT truthFacts, analysisStatus FROM analyses WHERE resumeId = ?', (req.resumeId,)).fetchone()
    
    if not row or (row["analysisStatus"] or "") == "error":
        conn.close()
        raise HTTPException(status_code=404, detail="Truth facts not found for this resume. Analyze first.")
        
    truth_facts = json.loads(row["truthFacts"])
    
    match_result = analyze_job_match(truth_facts, req.targetRole, req.jobDescription)
    data = match_result["match_data"]
    
    match_id = f"match-{uuid.uuid4().hex[:8]}"
    
    conn.execute('INSERT INTO job_matches (id, resumeId, targetRole, matchPercentage, matchingSkills, missingSkills) VALUES (?, ?, ?, ?, ?, ?)',
                 (match_id, req.resumeId, req.targetRole, data.get("matchPercentage"), json.dumps(data.get("matchingSkills", [])), json.dumps(data.get("missingSkills", []))))
    conn.commit()
    conn.close()
    
    data["id"] = match_id
    data["resumeId"] = req.resumeId
    return data

# --- ROADMAP ---

class RoadmapReq(BaseModel):
    targetRole: str
    missingSkills: List[str]

async def run_async_roadmap(roadmap_id: str, target_role: str, missing_skills: List[str]):
    _progress_store[roadmap_id] = {"status": "processing"}
    try:
        # We need to wrap synchronous generate_roadmap in async for background tasks properly
        # But FastAPI background_tasks can just be def, so let's keep it def
        pass
    except Exception as e:
        _progress_store[roadmap_id] = {"status": "error", "message": str(e)}

def _run_roadmap_sync(roadmap_id: str, target_role: str, missing_skills: List[str]):
    try:
        roadmap_result = generate_roadmap(target_role, missing_skills)
        data = roadmap_result["roadmap_data"]
        
        conn = get_db()
        conn.execute('INSERT INTO roadmaps (id, targetRole, missingSkills, steps) VALUES (?, ?, ?, ?)',
                     (roadmap_id, target_role, json.dumps(missing_skills), json.dumps(data.get("steps", []))))
        conn.commit()
        conn.close()
        
        _progress_store[roadmap_id]["status"] = "completed"
        _progress_store[roadmap_id]["roadmap_id"] = roadmap_id
    except Exception as e:
        _progress_store[roadmap_id] = {"status": "error", "message": str(e)}

@app.post("/api/roadmap")
def create_roadmap(req: RoadmapReq, background_tasks: BackgroundTasks):
    roadmap_id = f"roadmap-{uuid.uuid4().hex[:8]}"
    _progress_store[roadmap_id] = {"status": "processing"}
    background_tasks.add_task(_run_roadmap_sync, roadmap_id, req.targetRole, req.missingSkills)
    return {"roadmapId": roadmap_id}

@app.get("/api/roadmap/{roadmap_id}/status")
def get_roadmap_status(roadmap_id: str):
    if roadmap_id not in _progress_store:
        return {"status": "not_found"}
    return _progress_store[roadmap_id]
    
@app.get("/api/roadmap/{roadmap_id}")
def get_roadmap(roadmap_id: str):
    conn = get_db()
    row = conn.execute('SELECT * FROM roadmaps WHERE id = ?', (roadmap_id,)).fetchone()
    conn.close()
    if row:
        r = dict(row)
        return {
            "id": r["id"],
            "targetRole": r["targetRole"],
            "missingSkills": json.loads(r["missingSkills"]),
            "steps": json.loads(r["steps"])
        }
    return None

# --- INTERVIEW ---

class InterviewStartReq(BaseModel):
    resumeId: str
    type: str

def _session_response(row) -> dict:
    return {
        "id": row["id"],
        "resumeId": row["resumeId"],
        "type": row["type"],
        "status": row["status"],
        "startedAt": row["startedAt"],
        "currentQuestionIndex": row["currentQuestionIndex"],
        "questionsCount": row["questionsCount"],
        "chatHistory": json.loads(row["chatHistory"]),
    }

def _feedback_response(row) -> dict:
    return {
        "id": row["id"],
        "sessionId": row["sessionId"],
        "type": row["type"],
        "score": row["score"],
        "accuracy": row["accuracy"],
        "communication": row["communication"],
        "confidence": row["confidence"],
        "feedbackSummary": row["feedbackSummary"],
        "issues": json.loads(row["issues"]),
    }

@app.post("/api/interviews")
def start_interview(req: InterviewStartReq):
    if req.type not in ("HR", "Technical", "Resume-Based"):
        raise HTTPException(status_code=400, detail="type must be one of: HR, Technical, Resume-Based")

    conn = get_db()
    try:
        row = conn.execute('SELECT truthFacts, analysisStatus FROM analyses WHERE resumeId = ?', (req.resumeId,)).fetchone()
        if not row or (row["analysisStatus"] or "") == "error":
            raise HTTPException(status_code=404, detail="Analyze resume first")
        resume = conn.execute('SELECT targetRole FROM resumes WHERE id = ?', (req.resumeId,)).fetchone()
        target_role = resume["targetRole"] if resume else ""
        truth_facts = json.loads(row["truthFacts"])
    finally:
        conn.close()

    session_id = f"interview-{uuid.uuid4().hex[:8]}"

    # Index the Truth Guard facts for per-turn RAG retrieval, then generate a
    # mode-specific opening question grounded in those facts (FR-9/10/11).
    start_interview_session(session_id, truth_facts)
    opening_question = generate_opening_question(session_id, req.type, truth_facts, target_role)

    started_at = datetime.now(timezone.utc).isoformat()
    chat_history = [{"id": str(uuid.uuid4()), "sender": "ai", "text": opening_question, "timestamp": started_at}]

    conn = get_db()
    try:
        conn.execute('INSERT INTO interviews (id, resumeId, type, status, startedAt, currentQuestionIndex, questionsCount, chatHistory) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                     (session_id, req.resumeId, req.type, 'in-progress', started_at, 1, 5, json.dumps(chat_history)))
        conn.commit()
    finally:
        conn.close()

    return {
        "id": session_id,
        "resumeId": req.resumeId,
        "type": req.type,
        "status": "in-progress",
        "startedAt": started_at,
        "currentQuestionIndex": 1,
        "questionsCount": 5,
        "chatHistory": chat_history,
    }

@app.get("/api/interviews")
def list_interviews():
    conn = get_db()
    try:
        rows = conn.execute('SELECT * FROM interviews ORDER BY startedAt DESC').fetchall()
        return [_session_response(r) for r in rows]
    finally:
        conn.close()

@app.get("/api/interviews/{session_id}")
def get_interview(session_id: str):
    conn = get_db()
    try:
        row = conn.execute('SELECT * FROM interviews WHERE id = ?', (session_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        return _session_response(row)
    finally:
        conn.close()

class ChatTurnReq(BaseModel):
    message: str

@app.post("/api/interviews/{session_id}/chat")
def interview_chat(session_id: str, req: ChatTurnReq):
    conn = get_db()
    try:
        row = conn.execute('SELECT * FROM interviews WHERE id = ?', (session_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        if row["status"] == "completed":
            raise HTTPException(status_code=400, detail="This interview session is already completed")

        chat_history = json.loads(row["chatHistory"])

        resume = conn.execute('SELECT targetRole FROM resumes WHERE id = ?', (row["resumeId"],)).fetchone() if row["resumeId"] else None
        target_role = resume["targetRole"] if resume else ""
        arow = conn.execute('SELECT truthFacts FROM analyses WHERE resumeId = ?', (row["resumeId"],)).fetchone() if row["resumeId"] else None
        truth_facts = json.loads(arow["truthFacts"]) if arow else {}

        # FR-12 session end: the interview runs until the candidate has
        # answered questionsCount questions, then the interviewer wraps up.
        answered = sum(1 for m in chat_history if m.get("sender") == "user")
        wrap_up = (answered + 1) >= row["questionsCount"]

        res = chat_turn(session_id, req.message, chat_history, row["type"], truth_facts, target_role, wrap_up=wrap_up)
        ai_response = res["response"]

        now = datetime.now(timezone.utc).isoformat()
        chat_history.append({"id": str(uuid.uuid4()), "sender": "user", "text": req.message, "timestamp": now})
        chat_history.append({"id": str(uuid.uuid4()), "sender": "ai", "text": ai_response, "timestamp": now})

        new_status = "completed" if wrap_up else "in-progress"
        new_index = row["currentQuestionIndex"] if wrap_up else min(row["currentQuestionIndex"] + 1, row["questionsCount"])

        conn.execute('UPDATE interviews SET chatHistory = ?, currentQuestionIndex = ?, status = ? WHERE id = ?',
                     (json.dumps(chat_history), new_index, new_status, session_id))
        conn.commit()
    finally:
        conn.close()

    return {
        "id": row["id"],
        "resumeId": row["resumeId"],
        "type": row["type"],
        "status": new_status,
        "startedAt": row["startedAt"],
        "currentQuestionIndex": new_index,
        "questionsCount": row["questionsCount"],
        "chatHistory": chat_history,
        "response": ai_response,
    }

@app.post("/api/interviews/{session_id}/score")
def trigger_interview_scoring(session_id: str):
    """FR-12: run the scoring pass over a finished (or early-ended) session,
    persist it to interview_feedback, and mark the session completed."""
    conn = get_db()
    try:
        row = conn.execute('SELECT * FROM interviews WHERE id = ?', (session_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")

        # Idempotent: an already-scored session returns its persisted feedback.
        existing = conn.execute('SELECT * FROM interview_feedback WHERE sessionId = ?', (session_id,)).fetchone()
        if existing:
            return _feedback_response(existing)

        chat_history = json.loads(row["chatHistory"])
        answered = sum(1 for m in chat_history if m.get("sender") == "user")
        if answered == 0:
            raise HTTPException(status_code=400, detail="No candidate answers to score yet")

        resume = conn.execute('SELECT targetRole FROM resumes WHERE id = ?', (row["resumeId"],)).fetchone() if row["resumeId"] else None
        target_role = resume["targetRole"] if resume else ""
        arow = conn.execute('SELECT truthFacts FROM analyses WHERE resumeId = ?', (row["resumeId"],)).fetchone() if row["resumeId"] else None
        truth_facts = json.loads(arow["truthFacts"]) if arow else {}
    finally:
        conn.close()

    feedback = score_interview(session_id, row["type"], chat_history, truth_facts, target_role)

    conn = get_db()
    try:
        conn.execute('INSERT INTO interview_feedback (id, sessionId, type, score, accuracy, communication, confidence, feedbackSummary, issues) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                     (feedback["id"], session_id, feedback["type"], feedback["score"], feedback["accuracy"], feedback["communication"], feedback["confidence"], feedback["feedbackSummary"], json.dumps(feedback["issues"])))
        conn.execute("UPDATE interviews SET status = 'completed' WHERE id = ?", (session_id,))
        conn.commit()
    finally:
        conn.close()

    return feedback

@app.get("/api/interviews/{session_id}/feedback")
def get_interview_feedback(session_id: str):
    conn = get_db()
    try:
        row = conn.execute('SELECT * FROM interview_feedback WHERE sessionId = ?', (session_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Feedback not found for this session")
        return _feedback_response(row)
    finally:
        conn.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
