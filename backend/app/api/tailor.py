import time
import json
from app.core.llm_client import generate_completion
from app.core.grounding import verify_grounding

def generate_tailored_resume(target_role: str, extracted_facts: dict, job_description: str = "", force_hallucinate: bool = False) -> dict:
    start_time = time.time()
    
    with open("app/prompts/tailor_resume.txt", "r", encoding="utf-8") as f:
        system_prompt = f.read()
        
    prompt = f"Target Role: {target_role}\n\nExtracted Facts:\n{json.dumps(extracted_facts)}\n"
    
    # When the user pasted a job description at upload, tailor against it
    # (FR-7: "better match a target job").
    if job_description:
        prompt += f"\nJob Description:\n{job_description}\n"
    
    if force_hallucinate:
        prompt += "\nINSTRUCTION: Deliberately inject 'GraphQL' and 'MongoDB' into the tailored bullets to test our hallucination checker.\n"
        
    print("Generating tailored bullets...")
    # Observed output: ~300 tokens of bullet JSON. Cap generation so a
    # rambling CPU run stays within sane latency (~47s worst at ~11 tok/s).
    analysis_raw = generate_completion(prompt, system=system_prompt, num_predict=512)
    
    try:
        clean = analysis_raw.strip()
        if clean.startswith("```json"): clean = clean[7:-3]
        elif clean.startswith("```"): clean = clean[3:-3]
        bullets_data = json.loads(clean)
    except:
        bullets_data = {"error": "Failed to parse JSON", "raw": analysis_raw}
        
    gen_time = time.time() - start_time
    
    print("Running Step 3 Grounding Check...")
    check_start = time.time()
    
    grounding_result = verify_grounding(json.dumps(bullets_data), extracted_facts)
    
    check_time = time.time() - check_start
    
    return {
        "tailored_data": bullets_data,
        "grounding_result": grounding_result,
        "timing_seconds": gen_time + check_time
    }
