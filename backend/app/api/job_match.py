import time
import json
from app.core.llm_client import generate_completion

def analyze_job_match(truth_facts: dict, target_role: str, job_description: str) -> dict:
    start_time = time.time()
    
    with open("app/prompts/job_match.txt", "r", encoding="utf-8") as f:
        system_prompt = f.read()
        
    prompt = f"Target Role: {target_role}\n\nCandidate Facts:\n{json.dumps(truth_facts)}\n\nJob Description:\n{job_description}"
    
    print("Generating Job Match Analysis...")
    analysis_raw = generate_completion(prompt, system=system_prompt)
    
    try:
        clean = analysis_raw.strip()
        if clean.startswith("```json"): clean = clean[7:-3]
        elif clean.startswith("```"): clean = clean[3:-3]
        match_data = json.loads(clean)
    except:
        match_data = {"error": "Failed to parse JSON", "raw": analysis_raw}
        
    match_data["targetRole"] = target_role
        
    return {
        "match_data": match_data,
        "timing_seconds": time.time() - start_time
    }
