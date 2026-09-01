import json
import time
import asyncio
from functools import partial

from app.core.llm_client import generate_completion

# FAST path: score + verdict (+ stated reason, FR-5) + missing keywords.
# Missing keywords match the target role by default; when a job description
# was pasted at upload they are extracted from the JD instead (FR-3).
# Grounded in the Truth Guard facts extracted BEFORE this call (FR-8),
# so the verdict never invents details that are not in the resume.
def _fast_system(job_description: str) -> str:
    jd_clause = " and the provided job description" if job_description else ""
    kw_clause = (
        "key skills/keywords REQUIRED by the provided job description but absent from the resume and extracted facts"
        if job_description
        else "skills/keywords commonly expected for the target role but absent from the resume"
    )
    return (
        "You are an expert resume analyst and ATS specialist. "
        f"Analyze the provided resume and its extracted Truth Guard facts against the target role{jd_clause}. "
        "Ground every judgement strictly in the resume text and the extracted facts - never invent details. "
        "Output a SINGLE valid JSON object with NO extra text, NO markdown, NO explanation. "
        "The JSON must have exactly these keys:\n\n"
        "score_data: {\"score\": <int 0-100>, \"status\": <\"Poor\"|\"Average\"|\"Good\"|\"Outstanding\">, "
        "\"verdict_reason\": \"<one short sentence: the shortlist probability and the main concrete reason\">, "
        "\"breakdown\": {\"content\": <int>, \"impact\": <int>, \"skills\": <int>, \"experience\": <int>, \"formatting\": <int>}}\n\n"
        f"missing_keywords: [\"<missing skill 1>\", \"<missing skill 2>\", ...] "
        f"({kw_clause}). IMPORTANT: You MUST list at least 3-8 specific missing keywords when the resume clearly lacks skills from the target. Never return an empty list unless every expected keyword is present.\n\n"
        "Return only the raw JSON object."
    )

# DETAILED path: summary, strengths, and at most 3 improvements.
# Receives the same Truth Guard facts so suggestions stay verifiable.
DETAILED_SYSTEM = (
    "You are an expert resume analyst. Generate detailed feedback based on the resume, "
    "its extracted Truth Guard facts, and the target role. "
    "Ground every suggestion in the resume text and the extracted facts - never invent details. "
    "Output a SINGLE valid JSON object with NO extra text, NO markdown, NO explanation. "
    "The JSON must have exactly these keys:\n\n"
    "improvements_data: {\"summary\": \"<overall summary>\", \"strengths\": [\"<strength>\", ...], "
    "\"improvements\": [{\"id\": \"imp-1\", \"section\": \"<section>\", \"current\": \"<current text>\", "
    "\"feedback\": \"<why weak>\", \"suggestion\": \"<improved version>\", \"status\": \"pending\"}, ...]}\n\n"
    "IMPORTANT: Each improvement's section MUST be exactly one of these four values:\n"
    "\"Experience\" (work history, projects, bullet phrasing, quantified impact), "
    "\"Skills\" (skills list, keywords, summary line), "
    "\"Education\" (education, certifications, courses), or "
    "\"Formatting\" (excess text, weak or unclear headings, length problems, dense blocks, "
    "ATS readability). If the resume has formatting problems, include them under \"Formatting\".\n"
    "IMPORTANT: Keep improvements short and punchy. Maximum of 3 improvement suggestions.\n"
    "Return only the raw JSON object."
)

def _parse_json(raw_text: str) -> dict:
    try:
        clean = raw_text.strip()
        if clean.startswith("```json"):
            clean = clean[7:]
        elif clean.startswith("```"):
            clean = clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        return json.loads(clean.strip())
    except Exception:
        # Log the response length and tail to help diagnose parse failures.
        # Gemini sometimes truncates or adds unexpected suffixes.
        print(f"[DEBUG] _parse_json failed. len={len(raw_text)} first50={raw_text[:50]!r} last100={raw_text[-100:]!r}")
        return {"error": "Parse failed", "raw": raw_text}

async def analyze_resume_fast(resume_text: str, truth_facts: dict, target_role: str, job_description: str = "") -> dict:
    print("Running FAST LLM analysis...")
    loop = asyncio.get_event_loop()
    prompt = f"Target Role: {target_role}\n\nFacts:\n{json.dumps(truth_facts)}\n\nResume Text:\n{resume_text}"
    if job_description:
        prompt = f"Target Role: {target_role}\n\nJob Description:\n{job_description}\n\nFacts:\n{json.dumps(truth_facts)}\n\nResume Text:\n{resume_text}"
    
    t_start = time.perf_counter()
    # Observed output: ~95-200 tokens of score JSON (the model sometimes
    # generates verbose verdict_reason text). 512 tokens gives comfortable
    # headroom (~47s worst case at 11 tok/s, well under the 300s timeout
    # even with prefill).
    raw = await loop.run_in_executor(None, partial(generate_completion, prompt, _fast_system(job_description), num_predict=512))
    t_end = time.perf_counter()
    print(f"[TIMING] LLM Call (fast analysis): {t_end - t_start:.2f}s")
    
    result = _parse_json(raw)
    # Log unparseable LLM output so failures can be diagnosed
    if result.get("error"):
        print(f"[WARN] Fast analysis LLM output was unparseable. First 300 chars: {raw[:300]!r}")
    return result

async def analyze_resume_detailed(resume_text: str, truth_facts: dict, target_role: str) -> dict:
    print("Running DETAILED LLM analysis...")
    loop = asyncio.get_event_loop()
    prompt = f"Target Role: {target_role}\n\nFacts:\n{json.dumps(truth_facts)}\n\nResume Text:\n{resume_text}"
    
    t_start = time.perf_counter()
    # Observed output: ~800 tokens (summary + 3 improvements). Detailed
    # runs after the frontend is already on the results page, so a generous
    # cap keeps output complete while bounding worst-case latency. 1024
    # proved too tight for larger resumes (truncated JSON → parse failure
    # → empty detailed feedback), so the cap is 1536.
    raw = await loop.run_in_executor(None, partial(generate_completion, prompt, DETAILED_SYSTEM, num_predict=1536))
    t_end = time.perf_counter()
    print(f"[TIMING] LLM Call (detailed analysis): {t_end - t_start:.2f}s")
    
    result = _parse_json(raw)
    if result.get("error"):
        print(f"[WARN] Detailed analysis LLM output was unparseable. First 300 chars: {raw[:300]!r}")
    return result
