import time
import json
from typing import List, Dict

from app.core.llm_client import generate_completion
from app.core.rag_pipeline import get_interview_context, initialize_interview_rag

# FR-9 / FR-10 / FR-11: each interview mode gets its own prompt template so the
# questioning style genuinely differs (behavioral vs. technical vs. resume audit).
_MODE_PROMPTS = {
    "HR": "interview_hr.txt",
    "Technical": "interview_technical.txt",
    "Resume-Based": "interview_resume.txt",
}

# Chat replies are short (<50 words per the templates); scoring returns a
# compact JSON object. Caps bound worst-case CPU latency (~11 tok/s).
CHAT_NUM_PREDICT = 160
SCORING_NUM_PREDICT = 512


def _load_prompt(filename: str) -> str:
    with open(f"app/prompts/{filename}", "r", encoding="utf-8") as f:
        return f.read()


def _facts_summary(truth_facts: dict) -> str:
    """Compact rendering of the Truth Guard extraction (FR-8 grounding anchor)."""
    lines = []
    skills = truth_facts.get("skills", []) or []
    tools = truth_facts.get("tools", []) or []
    projects = truth_facts.get("projects", []) or []
    if skills:
        lines.append("Skills: " + ", ".join(str(s) for s in skills[:25]))
    if tools:
        lines.append("Tools: " + ", ".join(str(t) for t in tools[:15]))
    if projects:
        lines.append("Projects/Experience:")
        lines.extend(f"- {p}" for p in projects[:10])
    return "\n".join(lines) if lines else "No resume facts extracted."


def _system_prompt(session_id: str, interview_type: str, truth_facts: dict, target_role: str, rag_context: str) -> str:
    template = _load_prompt(_MODE_PROMPTS.get(interview_type, _MODE_PROMPTS["Technical"]))
    return (
        template
        .replace("[TARGET_ROLE]", target_role or "the target role")
        .replace("[FACTS]", _facts_summary(truth_facts))
        .replace("[RAG_CONTEXT]", rag_context or "None")
    )


def start_interview_session(session_id: str, truth_facts: dict) -> dict:
    # Preload the facts into ChromaDB for this session
    initialize_interview_rag(session_id, truth_facts)
    return {"status": "success", "session_id": session_id}


def generate_opening_question(session_id: str, interview_type: str, truth_facts: dict, target_role: str) -> str:
    """First interviewer message: mode-specific and grounded in the resume facts."""
    rag_context = get_interview_context(session_id, target_role, k=2)
    system_prompt = _system_prompt(session_id, interview_type, truth_facts, target_role, rag_context)
    prompt = (
        "This is the very first message of the interview. Greet the candidate in one short "
        "sentence and ask your FIRST question now, following your interviewing style above.\n\n"
        "Interviewer:"
    )
    t_start = time.time()
    response = generate_completion(prompt, system=system_prompt, num_predict=CHAT_NUM_PREDICT)
    print(f"[TIMING] Interview opening question ({interview_type}): {time.time() - t_start:.2f}s")
    return response.replace("Interviewer:", "").strip()


def chat_turn(session_id: str, user_message: str, chat_history: List[Dict[str, str]],
              interview_type: str = "Technical", truth_facts: dict = None,
              target_role: str = "", wrap_up: bool = False) -> dict:
    start_time = time.time()

    truth_facts = truth_facts or {}

    # 1. Retrieve RAG context once and reuse it for both the system prompt and
    # the debug metadata returned to the frontend. Previously this was called
    # twice per turn (inside _system_prompt and again for rag_context_used).
    rag_context = get_interview_context(session_id, user_message, k=2)

    # 2. Mode-branched system prompt with Truth Guard grounding (FR-8)
    system_prompt = _system_prompt(session_id, interview_type, truth_facts, target_role, rag_context)

    # 2. Format History
    history_str = ""
    for msg in chat_history[-4:]:  # Keep last 4 messages for context window speed
        history_str += f"{'Candidate' if msg['sender'] == 'user' else 'Interviewer'}: {msg['text']}\n"
    history_str += f"Candidate: {user_message}\n"

    if wrap_up:
        instruction = (
            "The candidate just answered your final question. Thank them in one short sentence, "
            "mention one specific thing they did well, and close the interview. Do NOT ask another question."
        )
    else:
        instruction = (
            "Respond to the candidate's latest answer in one short sentence (acknowledging specifics "
            "they mentioned), then ask your next question following your interviewing style above."
        )

    prompt = f"Chat so far:\n{history_str}\n{instruction}\n\nInterviewer:"

    # 3. Generate Response
    ai_response = generate_completion(prompt, system=system_prompt, num_predict=CHAT_NUM_PREDICT)

    # Clean up any accidental prefix
    ai_response = ai_response.replace("Interviewer:", "").strip()

    end_time = time.time()
    print(f"[TIMING] Interview chat turn ({interview_type}): {end_time - start_time:.2f}s")

    return {
        "response": ai_response,
        "timing_seconds": end_time - start_time,
        "rag_context_used": rag_context
    }


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
        return {"error": "Parse failed", "raw": raw_text}


def _clamp_score(value, default: int = 50) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return default


def _validate_feedback(parsed: dict, session_id: str, interview_type: str) -> dict:
    """Normalizes the LLM scoring JSON against the interview_feedback schema so
    a malformed field can never write a null/broken row."""
    accuracy = _clamp_score(parsed.get("accuracy"))
    communication = _clamp_score(parsed.get("communication"))
    confidence = _clamp_score(parsed.get("confidence"))
    score = _clamp_score(parsed.get("score"), default=(accuracy + communication + confidence) // 3)

    issues = []
    for i, iss in enumerate(parsed.get("issues") or []):
        if isinstance(iss, dict) and iss.get("description"):
            issues.append({
                "id": f"iss-{session_id}-{i}",
                "type": str(iss.get("type", "Communication")),
                "description": str(iss.get("description", "")),
                "suggestion": str(iss.get("suggestion", "")),
            })

    return {
        "id": f"fb-{session_id}",
        "sessionId": session_id,
        "type": interview_type,
        "score": score,
        "accuracy": accuracy,
        "communication": communication,
        "confidence": confidence,
        "feedbackSummary": str(parsed.get("feedbackSummary", "")),
        "issues": issues,
    }


def score_interview(session_id: str, interview_type: str, chat_history: List[Dict[str, str]],
                    truth_facts: dict, target_role: str) -> dict:
    """FR-12 scoring pass: technical accuracy, communication, confidence, and a
    concrete issue list, judged against the transcript and Truth Guard facts."""
    truth_facts = truth_facts or {}

    system_prompt = (
        _load_prompt("interview_scoring.txt")
        .replace("[INTERVIEW_TYPE]", interview_type)
        .replace("[TARGET_ROLE]", target_role or "the target role")
        .replace("[FACTS]", _facts_summary(truth_facts))
    )

    transcript = ""
    for msg in chat_history:
        speaker = "Candidate" if msg["sender"] == "user" else "Interviewer"
        transcript += f"{speaker}: {msg['text']}\n"

    prompt = f"Transcript:\n{transcript}\nEvaluator:"

    t_start = time.time()
    raw = generate_completion(prompt, system=system_prompt, num_predict=SCORING_NUM_PREDICT)
    print(f"[TIMING] Interview scoring pass ({interview_type}): {time.time() - t_start:.2f}s")

    parsed = _parse_json(raw)
    return _validate_feedback(parsed, session_id, interview_type)
