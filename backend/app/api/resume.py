import json
import time
import asyncio
from functools import partial

from app.core.llm_client import generate_completion

def _unified_system(job_description: str) -> str:
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
        "The JSON must have exactly this shape and keys:\n\n"
        "{\n"
        "  \"score_data\": {\n"
        "    \"score\": <int 0-100>,\n"
        "    \"status\": <\"Poor\"|\"Average\"|\"Good\"|\"Outstanding\">,\n"
        "    \"verdict_reason\": \"<one short sentence: the shortlist probability and the main concrete reason>\",\n"
        "    \"breakdown\": {\"content\": <int>, \"impact\": <int>, \"skills\": <int>, \"experience\": <int>, \"formatting\": <int>}\n"
        "  },\n"
        f"  \"missing_keywords\": [\"<missing skill 1>\", \"<missing skill 2>\", ...] ({kw_clause}. List 3-8 specific missing keywords, or empty if none),\n"
        "  \"improvements_data\": {\n"
        "    \"summary\": \"<overall summary, max 35 words>\",\n"
        "    \"strengths\": [\"<strength 1>\", \"<strength 2>\", \"<strength 3>\"],\n"
        "    \"improvements\": [\n"
        "      {\n"
        "        \"id\": \"imp-1\",\n"
        "        \"section\": \"<Experience|Skills|Education|Formatting>\",\n"
        "        \"current\": \"<current short text>\",\n"
        "        \"feedback\": \"<short reason why weak>\",\n"
        "        \"suggestion\": \"<short actionable improved version>\",\n"
        "        \"status\": \"pending\"\n"
        "      }\n"
        "    ]\n"
        "  }\n"
        "}\n\n"
        "IMPORTANT RULES:\n"
        "- Generate a maximum of 3 improvement objects to keep output compact.\n"
        "- Each improvement's section MUST be exactly one of: Experience, Skills, Education, or Formatting.\n"
        "- Keep all text short and punchy.\n"
        "- Return only the raw JSON object."
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
        print(f"[DEBUG] _parse_json failed. len={len(raw_text)} first50={raw_text[:50]!r} last100={raw_text[-100:]!r}")
        return {"error": "Parse failed", "raw": raw_text}

async def analyze_resume_once(resume_text: str, truth_facts: dict, target_role: str, job_description: str = "") -> dict:
    print("Running UNIFIED LLM analysis...")
    loop = asyncio.get_event_loop()
    
    prompt = f"Target Role: {target_role}\n\nFacts:\n{json.dumps(truth_facts)}\n\nResume Text:\n{resume_text}"
    if job_description:
        prompt = f"Target Role: {target_role}\n\nJob Description:\n{job_description}\n\nFacts:\n{json.dumps(truth_facts)}\n\nResume Text:\n{resume_text}"
    
    t_start = time.perf_counter()
    # 750 tokens is enough for the combined compact output without truncating.
    raw = await loop.run_in_executor(None, partial(generate_completion, prompt, _unified_system(job_description), num_predict=750))
    t_end = time.perf_counter()
    print(f"[TIMING] LLM Call (unified analysis): {t_end - t_start:.2f}s")
    
    result = _parse_json(raw)
    if result.get("error"):
        print(f"[WARN] Unified analysis LLM output was unparseable. First 300 chars: {raw[:300]!r}")
    return result
