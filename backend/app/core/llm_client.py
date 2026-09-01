"""LLM completion backend — swappable between Ollama (local) and Gemini (cloud).

The provider is selected via the LLM_PROVIDER environment variable:
    "ollama" (default) — local Ollama server, fully offline, no API key needed.
    "gemini"           — Google Generative AI (Gemini API), requires GEMINI_API_KEY.

Every caller imports and calls generate_completion(prompt, system, num_predict, timeout)
with the same signature regardless of provider. The response is always plain text
that callers parse as JSON downstream — no caller needs to know which provider is
active.
"""
import json
import os
import time
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "ollama").strip().lower()

# Ollama settings
OLLAMA_MODEL = "qwen2.5:1.5b"
OLLAMA_URL = "http://localhost:11434/api/generate"

# Gemini settings
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# gemini-3.5-flash is verified working (Aug 2026). It's a thinking model that
# spends tokens on internal reasoning; the 3x budget in _generate_gemini
# compensates for this. gemini-3.6-flash is rate-limited on free tier.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")

# ---------------------------------------------------------------------------
# Startup validation — called from main.py on_event("startup") so a
# misconfigured Gemini deployment fails fast instead of erroring on first
# upload.
# ---------------------------------------------------------------------------

def validate_provider() -> None:
    """Raises RuntimeError if the selected provider is misconfigured."""
    if LLM_PROVIDER not in ("ollama", "gemini"):
        raise RuntimeError(
            f"LLM_PROVIDER must be 'ollama' or 'gemini', got '{LLM_PROVIDER}'. "
            "Set LLM_PROVIDER=ollama for local dev or LLM_PROVIDER=gemini for cloud deployment."
        )
    if LLM_PROVIDER == "gemini" and not GEMINI_API_KEY:
        raise RuntimeError(
            "LLM_PROVIDER=gemini requires GEMINI_API_KEY environment variable. "
            "Get a key at https://aistudio.google.com/apikey and set GEMINI_API_KEY=<your-key>."
        )


# ---------------------------------------------------------------------------
# Public interface — signature unchanged so all existing callers work as-is.
# ---------------------------------------------------------------------------

def generate_completion(prompt: str, system: str = "", num_predict: int = 2048, timeout: int = 300) -> str:
    """Calls the configured LLM provider and returns the text response.

    num_predict caps the generated token count. Real analysis outputs are
    small (~100-800 tokens), but on CPU-only inference the model sometimes
    rambles toward the cap. Callers that know their output shape pass a
    tight cap to bound worst-case latency.

    timeout is the socket/request timeout in seconds.

    The return value is always plain text — callers parse it as JSON
    downstream, so neither provider needs to return structured data.
    """
    if LLM_PROVIDER == "gemini":
        return _generate_gemini(prompt, system, num_predict, timeout)
    return _generate_ollama(prompt, system, num_predict, timeout)


# ---------------------------------------------------------------------------
# Ollama backend (existing behavior, unchanged)
# ---------------------------------------------------------------------------

def _generate_ollama(prompt: str, system: str, num_predict: int, timeout: int) -> str:
    """Calls the local Ollama LLM and returns the text response."""
    t0 = time.perf_counter()
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "system": system,
        "stream": False,
        "keep_alive": "60m",
        "options": {
            "num_predict": num_predict
        }
    }

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(OLLAMA_URL, data=data, headers={'Content-Type': 'application/json'})

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.loads(response.read().decode('utf-8'))
            t1 = time.perf_counter()
            print(f"[TIMING] llm_client.py generate_completion (ollama): {t1 - t0:.2f}s")
            return result.get('response', '')
    except urllib.error.URLError as e:
        raise Exception(f"Failed to connect to Ollama at {OLLAMA_URL}. Is Ollama running? Error: {e}")


# ---------------------------------------------------------------------------
# Gemini backend (cloud deployment alternative)
# ---------------------------------------------------------------------------

def _generate_gemini(prompt: str, system: str, num_predict: int, timeout: int) -> str:
    """Calls the Google Gemini API via REST and returns the text response.

    Uses urllib directly to avoid httpx SSL handshake issues on Windows.
    Maps the Ollama-style parameters to Gemini equivalents:
    - system → systemInstruction
    - num_predict → maxOutputTokens (multiplied by 6 for thinking models)
    - timeout → urlopen timeout

    Note: Gemini "thinking" models (e.g. gemini-3.5-flash) use part of the
    max_output_tokens budget for internal reasoning (~1500 tokens). To
    ensure callers get at least num_predict tokens of visible output, we
    multiply the budget by 6 for the API call.
    """
    t0 = time.perf_counter()

    # Multiply token budget to compensate for thinking models that spend
    # tokens on internal reasoning. The model stops at STOP naturally when
    # done, so extra headroom doesn't cause rambling. 6x multiplier ensures
    # gemini-3.5-flash (which can spend ~1500 tokens on thinking) still has
    # enough budget for complete JSON output.
    api_max_tokens = num_predict * 6

    # Build the REST API URL
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

    # Build the request payload
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "maxOutputTokens": api_max_tokens,
            "temperature": 0.3,  # low temperature for structured JSON output
        }
    }
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        api_url,
        data=data,
        headers={'Content-Type': 'application/json'}
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.loads(response.read().decode('utf-8'))
            t1 = time.perf_counter()

            # Log usage for timing/performance analysis
            um = result.get('usageMetadata', {})
            if um:
                thinking = um.get('thoughtsTokenCount', 0) or 0
                print(f"[TIMING] llm_client.py generate_completion (gemini/{GEMINI_MODEL}): {t1 - t0:.2f}s "
                      f"(prompt={um.get('promptTokenCount', 0)}, thinking={thinking}, completion={um.get('candidatesTokenCount', 0)})")
            else:
                print(f"[TIMING] llm_client.py generate_completion (gemini/{GEMINI_MODEL}): {t1 - t0:.2f}s")

            # Extract text from the response
            candidates = result.get('candidates', [])
            if candidates:
                content = candidates[0].get('content', {})
                parts = content.get('parts', [])
                if parts:
                    text = parts[0].get('text', '')
                    if not text:
                        fr = candidates[0].get('finishReason', 'UNKNOWN')
                        print(f"[WARN] Gemini returned empty text. Finish reason: {fr}")
                    return text
                else:
                    print("[WARN] Gemini returned no parts in content.")
                    return ""
            else:
                print("[WARN] Gemini returned no candidates.")
                return ""

    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')[:500] if e.fp else ""
        if e.code == 403 or "API key" in error_body or "PERMISSION_DENIED" in error_body:
            raise Exception(f"Gemini API key is invalid or lacks permissions: {error_body}")
        elif e.code == 429 or "RESOURCE_EXHAUSTED" in error_body:
            raise Exception(f"Gemini API rate limit or quota exceeded: {error_body}")
        elif e.code == 503 or "UNAVAILABLE" in error_body:
            raise Exception(f"Gemini API is experiencing high demand. Please try again shortly: {error_body}")
        elif e.code == 404 or "NOT_FOUND" in error_body:
            raise Exception(f"Gemini model '{GEMINI_MODEL}' not found. Try setting GEMINI_MODEL to a different model: {error_body}")
        else:
            raise Exception(f"Gemini API call failed with HTTP {e.code}: {error_body}")
    except urllib.error.URLError as e:
        raise Exception(f"Failed to connect to Gemini API: {e}")
    except Exception as e:
        raise Exception(f"Gemini API call failed: {e}")
