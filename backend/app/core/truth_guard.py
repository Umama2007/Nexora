from typing import Dict, Any
from .llm_client import generate_completion
import json

def extract_truth_guard_facts(resume_text: str) -> Dict[str, Any]:
    """Runs Truth Guard Step 1: Extracts skills, tools, and projects."""
    with open("app/prompts/truth_guard_extract.txt", "r", encoding="utf-8") as f:
        system_prompt = f.read()
        
    prompt = f"Resume text:\n\n{resume_text}"
    # Observed output: ~215 tokens of facts JSON. Cap generation so a
    # rambling CPU run cannot outlive the HTTP timeout (~47s worst case
    # at ~11 tok/s).
    response = generate_completion(prompt, system=system_prompt, num_predict=512)
    
    # Try to parse the JSON (handle markdown blocks if any).
    # The stripping is careful not to remove valid JSON characters — Gemini
    # sometimes returns clean JSON without markdown wrappers, and blindly
    # slicing [7:-3] would corrupt it.
    try:
        clean_json = response.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        elif clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        return json.loads(clean_json.strip())
    except json.JSONDecodeError:
        print(f"Failed to parse Truth Guard JSON (len={len(response)}). First 100 chars: {response[:100]!r}")
        return {"raw_extraction": response}
