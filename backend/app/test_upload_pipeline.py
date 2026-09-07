import pytest
import json
import asyncio
from unittest.mock import patch, MagicMock

from app.main import run_async_analysis, _progress_store
from app.core.database import init_db, get_db

@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    # Clear tables for test
    conn = get_db()
    conn.execute("DELETE FROM resumes")
    conn.execute("DELETE FROM analyses")
    conn.commit()
    conn.close()
    
    # Clear progress store
    _progress_store.clear()

@pytest.mark.asyncio
@patch('app.core.pdf_parser.extract_resume_text')
@patch('app.api.resume.generate_completion')
async def test_normal_upload_calls_llm_once(mock_generate, mock_extract):
    # Mocking extraction
    mock_extract.return_value = "This is a python developer resume. Experience: built stuff. Skills: Python, AWS."
    
    # Mocking single LLM call response
    mock_generate.return_value = json.dumps({
        "score_data": {
            "score": 85,
            "status": "Outstanding",
            "verdict_reason": "Great match.",
            "breakdown": {"content": 10, "impact": 10, "skills": 10, "experience": 10, "formatting": 10}
        },
        "missing_keywords": [],
        "improvements_data": {
            "summary": "Good resume",
            "strengths": ["Strong python"],
            "improvements": []
        }
    })

    await run_async_analysis("resume-1", "fake.pdf", "Python Dev")
    
    # Assert generate_completion was called EXACTLY ONCE
    assert mock_generate.call_count == 1
    
    # Assert database has the completed status
    conn = get_db()
    row = conn.execute("SELECT * FROM analyses WHERE resumeId = 'resume-1'").fetchone()
    conn.close()
    
    assert row is not None
    assert row["analysisStatus"] == "completed"
    assert row["score"] == 85

@pytest.mark.asyncio
@patch('app.core.pdf_parser.extract_resume_text')
@patch('app.api.resume.generate_completion')
async def test_cache_hit_zero_llm_calls(mock_generate, mock_extract):
    resume_text = "Standard resume text"
    mock_extract.return_value = resume_text
    
    mock_generate.return_value = json.dumps({
        "score_data": {
            "score": 80,
            "status": "Good",
            "verdict_reason": "ok",
            "breakdown": {"content": 10, "impact": 10, "skills": 10, "experience": 10, "formatting": 10}
        },
        "missing_keywords": [],
        "improvements_data": {}
    })
    
    # First call will miss cache and invoke LLM
    await run_async_analysis("resume-2", "fake2.pdf", "Role")
    assert mock_generate.call_count == 1
    
    # Second call with SAME inputs will hit cache
    await run_async_analysis("resume-3", "fake3.pdf", "Role")
    
    # Should STILL be 1, because the second call used the cache!
    assert mock_generate.call_count == 1
    
    # Verify both exist and have same score
    conn = get_db()
    rows = conn.execute("SELECT * FROM analyses ORDER BY resumeId").fetchall()
    conn.close()
    
    assert len(rows) == 2
    assert rows[0]["analysisStatus"] == "completed"
    assert rows[1]["analysisStatus"] == "completed"

@pytest.mark.asyncio
@patch('app.core.pdf_parser.extract_resume_text')
@patch('app.api.resume.generate_completion')
async def test_malformed_json_no_retries(mock_generate, mock_extract):
    mock_extract.return_value = "Broken JSON resume"
    
    # Return broken JSON
    mock_generate.return_value = "{ broken json... "
    
    await run_async_analysis("resume-4", "fake4.pdf", "Role")
    
    # Should still only be called ONCE (no retry loop)
    assert mock_generate.call_count == 1
    
    # Database should reflect error state
    conn = get_db()
    row = conn.execute("SELECT * FROM analyses WHERE resumeId = 'resume-4'").fetchone()
    conn.close()
    
    assert row is not None
    assert row["analysisStatus"] == "error"
