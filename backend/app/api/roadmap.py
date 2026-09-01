import time
import json
from app.core.llm_client import generate_completion

def generate_roadmap(target_role: str, missing_skills: list) -> dict:
    start_time = time.time()
    
    with open("app/prompts/roadmap.txt", "r", encoding="utf-8") as f:
        system_prompt = f.read()
        
    prompt = f"Target Role: {target_role}\n\nMissing Skills: {', '.join(missing_skills)}"
    
    print("Generating Career Roadmap...")
    analysis_raw = generate_completion(prompt, system=system_prompt)
    
    try:
        clean = analysis_raw.strip()
        if clean.startswith("```json"): clean = clean[7:-3]
        elif clean.startswith("```"): clean = clean[3:-3]
        roadmap_data = json.loads(clean)
    except:
        roadmap_data = {"error": "Failed to parse JSON", "raw": analysis_raw}
        
    roadmap_data["targetRole"] = target_role
    roadmap_data["missingSkills"] = missing_skills
        
    return {
        "roadmap_data": roadmap_data,
        "timing_seconds": time.time() - start_time
    }
