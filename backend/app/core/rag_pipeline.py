"""RAG pipeline — provider-aware, swappable between local and cloud embeddings.

The interview RAG system indexes a user's Truth Guard facts (skills, tools,
projects) and retrieves relevant context for each interview turn, so the LLM's
questions and follow-ups are grounded in the actual resume.

Two engines are available, selected automatically based on LLM_PROVIDER:

  Gemini mode (LLM_PROVIDER=gemini):
    Embeddings: Google Gemini text-embedding-004 API (cloud REST call).
    Storage:    Plain in-memory list + cosine similarity search.
    Memory:     ~0 MB extra — no torch, no transformers, no chromadb.

  Ollama mode (LLM_PROVIDER=ollama):
    Embeddings: sentence-transformers all-MiniLM-L6-v2 (local CPU).
    Storage:    ChromaDB ephemeral in-memory client.
    Memory:     ~280 MB extra (torch + transformers + sentence-transformers + chromadb).

Both paths are real, tested implementations. The public interface
(initialize_interview_rag, get_interview_context) is identical regardless
of which engine is active — callers never need to know.

All heavy imports are deferred to function scope so server boot stays
fast (~1.5 s, ~22 MB) and Render's 512 MB free tier is not OOM-killed at
startup.
"""
import json
import math
import os
import urllib.request
import urllib.error


# ---------------------------------------------------------------------------
# Public interface — same signatures regardless of provider.
# ---------------------------------------------------------------------------

_engine = None


def get_rag_engine():
    """Returns the provider-appropriate RAG engine (lazy singleton)."""
    global _engine
    if _engine is None:
        from app.core.llm_client import LLM_PROVIDER
        if LLM_PROVIDER == "gemini":
            _engine = GeminiRAGEngine()
        else:
            _engine = OllamaRAGEngine()
        print(f"[RAG] Initialized {type(_engine).__name__}")
    return _engine


def initialize_interview_rag(session_id: str, truth_facts: dict):
    """Index the user's resume facts for later retrieval during interview."""
    get_rag_engine().initialize(session_id, truth_facts)


def get_interview_context(session_id: str, query: str, k: int = 2) -> str:
    """Retrieve the top-k most relevant facts for an interview query."""
    return get_rag_engine().get_context(session_id, query, k)


# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------

def _flatten_facts(truth_facts: dict) -> list:
    """Flatten Truth Guard extraction into a list of labelled document strings."""
    documents = []
    for i, skill in enumerate(truth_facts.get("skills", [])):
        documents.append(f"Skill: {skill}")
    for i, tool in enumerate(truth_facts.get("tools", [])):
        documents.append(f"Tool: {tool}")
    for i, project in enumerate(truth_facts.get("projects", [])):
        documents.append(f"Project/Experience: {project}")
    return documents


def _cosine_similarity(a: list, b: list) -> float:
    """Cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# ---------------------------------------------------------------------------
# Gemini RAG Engine — cloud embeddings, in-memory similarity
# ---------------------------------------------------------------------------

class GeminiRAGEngine:
    """Uses Google's text-embedding-004 API for embeddings and a simple
    in-memory store with cosine similarity for retrieval.

    Zero ML dependencies — the embedding model runs on Google's servers.
    The per-session corpus is tiny (~20-30 documents), so brute-force
    cosine similarity over a Python list is faster than a vector DB lookup
    and avoids pulling in chromadb + its transitive dependencies.
    """

    EMBEDDING_MODEL = "gemini-embedding-001"

    def __init__(self):
        self._api_key = os.environ.get("GEMINI_API_KEY", "")
        self._sessions: dict = {}  # session_id -> {"docs": [...], "embeddings": [[...]]}

    def _embed(self, texts: list) -> list:
        """Call Gemini embedContent API for each text. Returns list of vectors.

        Uses the stable gemini-embedding-001 model with the embedContent
        method. A persistent HTTPS connection amortises the SSL handshake
        cost across all calls in a batch (important during interview init
        when ~20-30 fact documents are embedded at once).

        The free-tier embedding quota is low (~15 req/min). When a 429 is
        hit, we wait and retry up to 3 times with increasing delay.
        """
        import http.client
        import time

        host = "generativelanguage.googleapis.com"
        conn = http.client.HTTPSConnection(host, timeout=60)
        embeddings = []
        max_retries = 3

        try:
            for i, text in enumerate(texts):
                path = (
                    f"/v1beta/models/{self.EMBEDDING_MODEL}"
                    f":embedContent?key={self._api_key}"
                )
                payload = json.dumps({
                    "model": f"models/{self.EMBEDDING_MODEL}",
                    "content": {"parts": [{"text": text}]},
                })

                for attempt in range(max_retries + 1):
                    conn.request(
                        "POST", path, body=payload,
                        headers={"Content-Type": "application/json"},
                    )
                    resp = conn.getresponse()
                    body = resp.read().decode("utf-8")

                    if resp.status == 200:
                        result = json.loads(body)
                        embeddings.append(result["embedding"]["values"])
                        break
                    elif resp.status == 429:
                        wait = 5 * (attempt + 1)
                        print(f"[RAG/Gemini] Embedding rate-limited (doc {i+1}/{len(texts)}), "
                              f"retrying in {wait}s (attempt {attempt+1}/{max_retries})...")
                        time.sleep(wait)
                        # Re-create connection after sleep (server may close idle)
                        conn.close()
                        conn = http.client.HTTPSConnection(host, timeout=60)
                    else:
                        raise RuntimeError(
                            f"Gemini embedding API failed (HTTP {resp.status}): {body[:300]}"
                        )
                else:
                    raise RuntimeError(
                        f"Gemini embedding API rate-limited after {max_retries} retries"
                    )
        finally:
            conn.close()

        return embeddings

    def initialize(self, session_id: str, truth_facts: dict):
        documents = _flatten_facts(truth_facts)
        if not documents:
            self._sessions[session_id] = {"docs": [], "embeddings": []}
            return

        embeddings = self._embed(documents)
        self._sessions[session_id] = {
            "docs": documents,
            "embeddings": embeddings,
        }
        print(f"[RAG/Gemini] Indexed {len(documents)} facts for session {session_id}")

    def get_context(self, session_id: str, query: str, k: int = 2) -> str:
        session = self._sessions.get(session_id)
        if not session or not session["docs"]:
            return ""

        try:
            query_emb = self._embed([query])[0]
        except Exception as e:
            print(f"[RAG/Gemini] Embedding query failed: {e}")
            return ""

        scored = []
        for doc, emb in zip(session["docs"], session["embeddings"]):
            score = _cosine_similarity(query_emb, emb)
            scored.append((score, doc))

        scored.sort(key=lambda x: x[0], reverse=True)
        top_k = scored[:k]

        return "\n".join(doc for _, doc in top_k)


# ---------------------------------------------------------------------------
# Ollama RAG Engine — local SentenceTransformer + ChromaDB
# ---------------------------------------------------------------------------

class OllamaRAGEngine:
    """Uses sentence-transformers (all-MiniLM-L6-v2) for local CPU embeddings
    and ChromaDB's ephemeral in-memory client for vector storage and retrieval.

    All heavy imports are deferred to method scope so they only load when an
    interview actually starts — keeping server boot lightweight.
    """

    def __init__(self):
        self._model = None
        self._client = None

    def _get_model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError:
                raise ImportError(
                    "Ollama mode's interview RAG requires local embedding packages. "
                    "Install with: pip install sentence-transformers chromadb"
                )
            self._model = SentenceTransformer("all-MiniLM-L6-v2")
        return self._model

    def _get_client(self):
        if self._client is None:
            try:
                import chromadb
            except ImportError:
                raise ImportError(
                    "Ollama mode's interview RAG requires chromadb. "
                    "Install with: pip install chromadb"
                )
            self._client = chromadb.Client()
        return self._client

    def initialize(self, session_id: str, truth_facts: dict):
        client = self._get_client()
        model = self._get_model()

        try:
            collection = client.create_collection(name=session_id)
        except Exception:
            collection = client.get_collection(name=session_id)

        documents = _flatten_facts(truth_facts)
        if documents:
            embeddings = model.encode(documents).tolist()
            ids = [f"doc_{i}" for i in range(len(documents))]
            collection.add(
                embeddings=embeddings,
                documents=documents,
                ids=ids,
            )
            print(f"[RAG/Ollama] Indexed {len(documents)} facts for session {session_id}")

    def get_context(self, session_id: str, query: str, k: int = 2) -> str:
        client = self._get_client()
        model = self._get_model()

        try:
            collection = client.get_collection(name=session_id)
        except Exception:
            return ""

        query_embedding = model.encode([query]).tolist()
        results = collection.query(
            query_embeddings=query_embedding,
            n_results=k,
        )

        if results and results["documents"] and len(results["documents"][0]) > 0:
            return "\n".join(results["documents"][0])
        return ""
