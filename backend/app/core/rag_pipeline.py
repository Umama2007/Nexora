import chromadb
from sentence_transformers import SentenceTransformer

# Initialize globally so models aren't reloaded every request
_model = None
_client = None

def get_rag_model():
    global _model
    if _model is None:
        _model = SentenceTransformer('all-MiniLM-L6-v2')
    return _model

def get_chroma_client():
    global _client
    if _client is None:
        # Use ephemeral client for now (in memory), but we can switch to persistent
        _client = chromadb.Client()
    return _client

def initialize_interview_rag(session_id: str, truth_facts: dict):
    client = get_chroma_client()
    model = get_rag_model()
    
    # Create or get collection for this interview session
    try:
        collection = client.create_collection(name=session_id)
    except:
        collection = client.get_collection(name=session_id)
        
    documents = []
    ids = []
    
    # Flatten facts into documents
    for i, skill in enumerate(truth_facts.get("skills", [])):
        documents.append(f"Skill: {skill}")
        ids.append(f"skill_{i}")
        
    for i, tool in enumerate(truth_facts.get("tools", [])):
        documents.append(f"Tool: {tool}")
        ids.append(f"tool_{i}")
        
    for i, project in enumerate(truth_facts.get("projects", [])):
        documents.append(f"Project/Experience: {project}")
        ids.append(f"proj_{i}")
        
    if documents:
        embeddings = model.encode(documents).tolist()
        collection.add(
            embeddings=embeddings,
            documents=documents,
            ids=ids
        )

def get_interview_context(session_id: str, query: str, k: int = 2) -> str:
    client = get_chroma_client()
    model = get_rag_model()
    
    try:
        collection = client.get_collection(name=session_id)
    except:
        return "" # No context found
        
    query_embedding = model.encode([query]).tolist()
    
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=k
    )
    
    if results and results['documents'] and len(results['documents'][0]) > 0:
        return "\n".join(results['documents'][0])
    return ""
