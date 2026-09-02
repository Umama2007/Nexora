"""Provider-agnostic LLM backend with automatic failover, response caching, and
graceful degradation.

Public interface (unchanged):
    generate_completion(prompt, system="", num_predict=2048, timeout=300) -> str

Provider selection:
    LLM_PROVIDER=ollama  -> single local Ollama provider.
    LLM_PROVIDER=gemini  -> ordered list of Gemini providers, one per configured
                            key (GEMINI_API_KEY, GEMINI_API_KEY_1, GEMINI_API_KEY_2, ...).

Failover:
    When a provider returns a retryable error (HTTP 429 / RESOURCE_EXHAUSTED),
    the next provider in the ordered list is tried. The "currently active"
    provider index is kept in memory so later calls start from the last-known-good
    provider instead of retrying exhausted ones every time.

Caching:
    Identical (system, prompt, num_predict) tuples are cached in a small in-memory
    LRU cache with a short TTL. This is transparent to callers. Live interview chat
    turns are never cached because their prompts include unique history; the cache
    key intentionally omits history, but callers that want deterministic behavior
    are still free to use it. Interview scoring is cacheable only if the exact same
    transcript is rescored.

Security:
    API keys are read from environment variables and never leave the backend process.
"""
import hashlib
import json
import os
import time
import threading
import urllib.request
import urllib.error
from collections import OrderedDict
from typing import List, Optional, Tuple


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class LLMProviderError(Exception):
    """Raised when a provider cannot satisfy a request."""
    pass


class AllProvidersExhaustedError(LLMProviderError):
    """Raised when every configured provider fails for a request.

    Callers should surface this as a friendly "temporarily at capacity" message.
    """
    pass


class _ProviderRetryableError(LLMProviderError):
    """Internal signal that a provider hit a quota/rate-limit and the request
    should be retried with the next provider in the chain."""
    pass


# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "ollama").strip().lower()

# Ollama settings
OLLAMA_MODEL = "qwen2.5:1.5b"
OLLAMA_URL = "http://localhost:11434/api/generate"

# Gemini settings
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")


def _read_gemini_keys() -> List[str]:
    """Reads all configured Gemini keys from the environment.

    Supports GEMINI_API_KEY plus GEMINI_API_KEY_1, GEMINI_API_KEY_2, ...
    Scans up to GEMINI_API_KEY_99 so users aren't forced into a fixed count.
    Empty or whitespace-only values are ignored; scanning stops at the first
    empty slot, or after index 99.
    """
    keys: List[str] = []
    primary = os.environ.get("GEMINI_API_KEY", "").strip()
    if primary:
        keys.append(primary)

    for idx in range(1, 100):
        val = os.environ.get(f"GEMINI_API_KEY_{idx}", "").strip()
        if not val:
            # First gap ends the scan. This keeps config intuitive; users who
            # need sparse numbering can fill earlier slots with placeholder keys.
            break
        if val not in keys:
            keys.append(val)

    return keys


GEMINI_KEYS = _read_gemini_keys()


def validate_provider() -> None:
    """Raises RuntimeError if the selected provider is misconfigured."""
    if LLM_PROVIDER not in ("ollama", "gemini"):
        raise RuntimeError(
            f"LLM_PROVIDER must be 'ollama' or 'gemini', got '{LLM_PROVIDER}'. "
            "Set LLM_PROVIDER=ollama for local dev or LLM_PROVIDER=gemini for cloud deployment."
        )
    if LLM_PROVIDER == "gemini" and not GEMINI_KEYS:
        raise RuntimeError(
            "LLM_PROVIDER=gemini requires at least one GEMINI_API_KEY environment variable. "
            "Get a key at https://aistudio.google.com/apikey and set GEMINI_API_KEY=<your-key>."
        )


# ---------------------------------------------------------------------------
# Cache: small, bounded, TTL-protected
# ---------------------------------------------------------------------------

class _ResponseCache:
    """In-memory LRU cache for LLM responses.

    Memory budget: max 128 entries, each storing a SHA-256 key (~32 bytes) plus
    the prompt/system/response strings. Average resume analysis prompt is ~8 KB
    and response ~2 KB, so worst-case footprint is roughly 128 * 15 KB = ~2 MB.
    TTL of 10 minutes prevents stale data from accumulating across long sessions.
    """

    def __init__(self, max_size: int = 128, ttl_seconds: float = 600.0):
        self.max_size = max_size
        self.ttl = ttl_seconds
        self._lock = threading.Lock()
        self._store: OrderedDict[str, Tuple[float, str]] = OrderedDict()

    @staticmethod
    def _key(system: str, prompt: str, num_predict: int) -> str:
        """Stable hash key for a request."""
        normalized = f"{system.strip()}\n{prompt.strip()}\n{num_predict}".encode("utf-8")
        return hashlib.sha256(normalized).hexdigest()

    def get(self, system: str, prompt: str, num_predict: int) -> Optional[str]:
        key = self._key(system, prompt, num_predict)
        with self._lock:
            if key not in self._store:
                return None
            inserted_at, value = self._store[key]
            if time.time() - inserted_at > self.ttl:
                del self._store[key]
                return None
            # Move to end (most recently used).
            self._store.move_to_end(key)
            return value

    def put(self, system: str, prompt: str, num_predict: int, value: str) -> None:
        key = self._key(system, prompt, num_predict)
        with self._lock:
            self._store[key] = (time.time(), value)
            self._store.move_to_end(key)
            # Evict oldest entries if over capacity.
            while len(self._store) > self.max_size:
                self._store.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


# Global cache instance. Kept small intentionally for Render's 512 MB budget.
_RESPONSE_CACHE = _ResponseCache(max_size=128, ttl_seconds=600.0)


def clear_llm_cache() -> None:
    """Clears the response cache. Useful for tests and manual resets."""
    _RESPONSE_CACHE.clear()


# ---------------------------------------------------------------------------
# Provider interface
# ---------------------------------------------------------------------------

class LLMProvider:
    """Abstract-ish provider. Subclasses implement _call()."""

    name: str = "unknown"

    def generate(self, prompt: str, system: str, num_predict: int, timeout: int) -> str:
        raise NotImplementedError


class OllamaProvider(LLMProvider):
    name = "ollama"

    def generate(self, prompt: str, system: str, num_predict: int, timeout: int) -> str:
        t0 = time.perf_counter()
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "system": system,
            "stream": False,
            "keep_alive": "60m",
            "options": {"num_predict": num_predict},
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(OLLAMA_URL, data=data, headers={"Content-Type": "application/json"})

        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                result = json.loads(response.read().decode("utf-8"))
                t1 = time.perf_counter()
                print(f"[TIMING] llm_client.py generate_completion (ollama): {t1 - t0:.2f}s")
                return result.get("response", "")
        except urllib.error.URLError as e:
            raise LLMProviderError(f"Failed to connect to Ollama at {OLLAMA_URL}. Is Ollama running? Error: {e}")


class GeminiProvider(LLMProvider):
    """One Gemini API key = one provider instance."""

    def __init__(self, api_key: str, index: int):
        self.api_key = api_key
        self.index = index
        self.name = f"gemini-key-{index}"

    def generate(self, prompt: str, system: str, num_predict: int, timeout: int) -> str:
        t0 = time.perf_counter()

        # Thinking models spend tokens on internal reasoning; 6x gives callers
        # the visible token budget they asked for.
        api_max_tokens = num_predict * 6

        api_url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}"
            f":generateContent?key={self.api_key}"
        )

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "maxOutputTokens": api_max_tokens,
                "temperature": 0.3,
            },
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(api_url, data=data, headers={"Content-Type": "application/json"})

        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                result = json.loads(response.read().decode("utf-8"))
                t1 = time.perf_counter()

                um = result.get("usageMetadata", {})
                if um:
                    thinking = um.get("thoughtsTokenCount", 0) or 0
                    print(
                        f"[TIMING] llm_client.py generate_completion ({self.name}/{GEMINI_MODEL}): "
                        f"{t1 - t0:.2f}s (prompt={um.get('promptTokenCount', 0)}, "
                        f"thinking={thinking}, completion={um.get('candidatesTokenCount', 0)})"
                    )
                else:
                    print(f"[TIMING] llm_client.py generate_completion ({self.name}/{GEMINI_MODEL}): {t1 - t0:.2f}s")

                candidates = result.get("candidates", [])
                if candidates:
                    content = candidates[0].get("content", {})
                    parts = content.get("parts", [])
                    if parts:
                        text = parts[0].get("text", "")
                        if not text:
                            fr = candidates[0].get("finishReason", "UNKNOWN")
                            print(f"[WARN] Gemini returned empty text. Finish reason: {fr}")
                        return text
                    print("[WARN] Gemini returned no parts in content.")
                    return ""
                print("[WARN] Gemini returned no candidates.")
                return ""

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")[:500] if e.fp else ""
            if e.code == 403 or "API key" in error_body or "PERMISSION_DENIED" in error_body:
                raise LLMProviderError(f"Gemini API key is invalid or lacks permissions: {error_body}")
            elif e.code == 429 or "RESOURCE_EXHAUSTED" in error_body:
                # Retryable: signal upstream to try the next provider/key.
                raise _ProviderRetryableError(
                    f"Gemini API rate limit or quota exceeded ({self.name}): {error_body}"
                )
            elif e.code == 503 or "UNAVAILABLE" in error_body:
                raise _ProviderRetryableError(f"Gemini API is experiencing high demand ({self.name}): {error_body}")
            elif e.code == 404 or "NOT_FOUND" in error_body:
                raise LLMProviderError(f"Gemini model '{GEMINI_MODEL}' not found: {error_body}")
            else:
                raise LLMProviderError(f"Gemini API call failed with HTTP {e.code}: {error_body}")
        except urllib.error.URLError as e:
            raise _ProviderRetryableError(f"Failed to connect to Gemini API ({self.name}): {e}")
        except Exception as e:
            raise LLMProviderError(f"Gemini API call failed ({self.name}): {e}")


class FallbackProvider(LLMProvider):
    """Tries an ordered list of providers, tracking the last-known-good index.

    This is the extension point for future providers: any object with a
    ``generate(prompt, system, num_predict, timeout)`` method can be appended
    to ``self.providers`` without changing ``generate_completion()`` callers.
    """

    name = "fallback"

    def __init__(self, providers: List[LLMProvider]):
        if not providers:
            raise ValueError("FallbackProvider requires at least one provider")
        self.providers = providers
        self._active_index = 0
        self._lock = threading.Lock()

    @property
    def active_index(self) -> int:
        with self._lock:
            return self._active_index

    @active_index.setter
    def active_index(self, value: int) -> None:
        with self._lock:
            self._active_index = value

    def _provider_count(self) -> int:
        return len(self.providers)

    def generate(self, prompt: str, system: str, num_predict: int, timeout: int) -> str:
        start_index = self.active_index
        attempts = 0
        n = self._provider_count()

        while attempts < n:
            idx = (start_index + attempts) % n
            provider = self.providers[idx]
            try:
                result = provider.generate(prompt, system, num_predict, timeout)
                # Success: remember this provider for next time.
                if self.active_index != idx:
                    print(f"[FAILOVER] Switched active provider to {provider.name} (index {idx})")
                self.active_index = idx
                return result
            except _ProviderRetryableError as e:
                print(f"[FAILOVER] {provider.name} retryable failure: {e}")
                attempts += 1
                continue
            except LLMProviderError as e:
                # Non-retryable provider error (bad key, bad model). Try next
                # provider because a different key might still work, but don't
                # treat it as a quota event.
                print(f"[FAILOVER] {provider.name} non-retryable failure, trying next: {e}")
                attempts += 1
                continue

        # All providers failed.
        raise AllProvidersExhaustedError(
            "All configured AI providers are exhausted or unavailable. "
            "Please try again in a few minutes."
        )


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

_default_fallback: Optional[FallbackProvider] = None


def get_llm_provider() -> FallbackProvider:
    """Builds (or returns) the global provider chain."""
    global _default_fallback
    if _default_fallback is None:
        providers: List[LLMProvider] = []
        if LLM_PROVIDER == "gemini":
            for idx, key in enumerate(GEMINI_KEYS, start=1):
                providers.append(GeminiProvider(api_key=key, index=idx))
            print(f"[LLM] Configured {len(providers)} Gemini provider(s)")
        else:
            providers.append(OllamaProvider())
            print(f"[LLM] Configured Ollama provider")
        _default_fallback = FallbackProvider(providers)
    return _default_fallback


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def generate_completion(prompt: str, system: str = "", num_predict: int = 2048, timeout: int = 300) -> str:
    """Calls the configured LLM provider chain and returns the text response.

    Responses are transparently cached on (system, prompt, num_predict). On
    total provider exhaustion, raises AllProvidersExhaustedError with a
    user-friendly message.
    """
    cached = _RESPONSE_CACHE.get(system, prompt, num_predict)
    if cached is not None:
        print("[CACHE] llm_client.py generate_completion: cache hit")
        return cached

    provider = get_llm_provider()
    try:
        result = provider.generate(prompt, system, num_predict, timeout)
    except AllProvidersExhaustedError:
        # Re-raise explicitly so callers can distinguish exhaustion from other errors.
        raise
    except Exception as e:
        # Wrap unexpected errors consistently.
        raise AllProvidersExhaustedError(f"AI provider failure: {e}") from e

    _RESPONSE_CACHE.put(system, prompt, num_predict, result)
    return result


# Backwards-compatible alias for startup/warmup code.
def generate_completion_cached(prompt: str, system: str = "", num_predict: int = 2048, timeout: int = 300) -> str:
    return generate_completion(prompt, system, num_predict, timeout)
