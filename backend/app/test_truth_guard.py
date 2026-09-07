"""Tests for the fully-local Truth Guard extractor (FR-6).

The extractor must never touch an LLM and must always return the complete
five-key fact shape the Profile page depends on:
name / education / skills / tools / projects.
"""

import inspect
import json
from unittest.mock import patch

import pytest

from app.core import truth_guard
from app.core.truth_guard import extract_truth_guard_facts


# Mirrors the structure of a real uploaded resume (PDF text extraction).
REPRESENTATIVE_RESUME = """\
UMAMA UME AMEN
Aspiring AI Engineer  |  Full-Stack Developer
03349725250   |   umamasajid25@gmail.com   |   linkedin.com/in/umama-sajid
PROFESSIONAL SUMMARY
BSc Artificial Intelligence student with hands-on experience shipping AI-integrated
full-stack applications using Python, Flask, and REST APIs.
TECHNICAL SKILLS
Programming Languages: Python, C, C++, JavaScript, SQL
Web Development: Flask, HTML5, CSS3, JavaScript, AJAX
Tools & Platforms: Git, GitHub, Postman
PROJECTS
SmartBuddy AI – PDF Summarizer & Slide Generator
Personal Project   |   2025
•  Built a web application that uses AI to generate instant PDF summaries
•  Integrated a conversational chat feature for document Q&A
Bite & Beans – Full-Stack Coffee Shop Web Application
Personal Project   |   2025
•  Engineered a 19-route Flask application with AJAX-based shopping cart
Online Food Ordering System
Team Project (C++ OOP)   |   2025
•  Developed a C++ application applying OOP principles with file storage
EDUCATION
BSc Artificial Intelligence (AI)
University of Engineering & Technology (UET), Lahore   |   2025 – 2029
"""


# ---------------------------------------------------------------------------
# LLM-free guarantee
# ---------------------------------------------------------------------------

def test_extractor_never_calls_llm():
    with patch("app.core.llm_client.generate_completion") as mock_llm:
        facts = extract_truth_guard_facts(REPRESENTATIVE_RESUME)
    assert mock_llm.call_count == 0
    # The module must not even reference LLM machinery.
    source = inspect.getsource(truth_guard).lower()
    for forbidden in ("generate_completion", "llm_client", "gemini", "ollama"):
        assert forbidden not in source
    assert facts["name"]  # sanity: extraction actually ran


# ---------------------------------------------------------------------------
# Complete five-key shape
# ---------------------------------------------------------------------------

def test_returns_all_five_keys_even_for_empty_or_garbage_input():
    for text in ("", "\n\n  \n", "12345 … — |||"):
        facts = extract_truth_guard_facts(text)
        assert set(facts.keys()) == {"name", "education", "skills", "tools", "projects"}
        assert facts["name"] == ""
        assert facts["education"] == ""
        assert facts["skills"] == []
        assert facts["tools"] == []
        assert facts["projects"] == []


def test_output_is_deterministic():
    first = extract_truth_guard_facts(REPRESENTATIVE_RESUME)
    second = extract_truth_guard_facts(REPRESENTATIVE_RESUME)
    assert first == second


# ---------------------------------------------------------------------------
# Name & education
# ---------------------------------------------------------------------------

def test_extracts_name_and_education_from_representative_resume():
    facts = extract_truth_guard_facts(REPRESENTATIVE_RESUME)
    assert facts["name"] == "UMAMA UME AMEN"
    assert "BSc Artificial Intelligence" in facts["education"]
    assert "University of Engineering & Technology" in facts["education"]


def test_name_variants():
    # Explicit "Name:" label (with an apostrophe in the surname).
    labeled = "Name: Jane Mary O'Brien\nEmail: jane@example.com\nEXPERIENCE\n- Built things\n"
    assert extract_truth_guard_facts(labeled)["name"] == "Jane Mary O'Brien"

    # "Name | Target role" header line — the role must NOT become the name.
    separated = "Umama Amen | Aspiring Data Scientist\nEXPERIENCE\n- Built things\n"
    assert extract_truth_guard_facts(separated)["name"] == "Umama Amen"

    # Role title printed above the name.
    role_first = "Software Engineer\nJohn Smith\njohn@x.com\nEXPERIENCE\n- Built things\n"
    assert extract_truth_guard_facts(role_first)["name"] == "John Smith"

    # Uncertain input must yield an empty string, never a fake name.
    uncertain = "umama@example.com\n+92 300 1234567\nEXPERIENCE\n- Built things with Python\n"
    assert extract_truth_guard_facts(uncertain)["name"] == ""


def test_education_from_certifications_heading():
    resume = """\
Alex Kim
CERTIFICATIONS
AWS Certified Solutions Architect
Google Cloud Professional
"""
    facts = extract_truth_guard_facts(resume)
    assert "AWS Certified Solutions Architect" in facts["education"]


# ---------------------------------------------------------------------------
# Skills & tools
# ---------------------------------------------------------------------------

def test_ambiguous_terms_only_count_inside_skills_section():
    # "go-to-market", "swift", "R platform" appear only in bullets — no Skills
    # section exists, so none of them may be extracted.
    no_skills = """\
Umama Amen
Data Analyst
EXPERIENCE
- Led go-to-market analysis with swift iteration on the R platform
- Built dashboards in Python and SQL
EDUCATION
BS Statistics
Lahore University
"""
    facts = extract_truth_guard_facts(no_skills)
    assert facts["skills"] == ["Python", "SQL"]
    for term in ("Go", "R", "Swift", "Ruby", "C"):
        assert term not in facts["skills"]

    # The same words listed inside an explicit Technical Skills section do count.
    with_skills = """\
Jane O'Brien
TECHNICAL SKILLS
Languages: Go, R, C, Swift, Ruby, Python
Databases: PostgreSQL, Redis
"""
    facts = extract_truth_guard_facts(with_skills)
    for term in ("Go", "R", "C", "Swift", "Ruby", "Python", "PostgreSQL", "Redis"):
        assert term in facts["skills"]


def test_skills_and_tools_deduplicated_with_readable_casing():
    resume = """\
Sam Lee
SKILLS
python, PYTHON, Python, javascript, react
Tools: git, github, docker, postman
"""
    facts = extract_truth_guard_facts(resume)
    assert facts["skills"] == ["JavaScript", "Python", "React"]
    assert facts["tools"] == ["Docker", "Git", "GitHub", "Postman"]


def test_c_is_not_extracted_from_cplusplus_or_csharp():
    csharp = "TECHNICAL SKILLS\nLanguages: C#, JavaScript, Python\n"
    assert "C" not in extract_truth_guard_facts(csharp)["skills"]

    objc = "SKILLS\nLanguages: Objective-C, Swift\n"
    facts = extract_truth_guard_facts(objc)
    assert "C" not in facts["skills"]
    assert "Swift" in facts["skills"]  # Swift IS listed in the skills section


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

def test_extracts_clean_project_titles_and_skips_metadata():
    facts = extract_truth_guard_facts(REPRESENTATIVE_RESUME)
    assert facts["projects"] == [
        "SmartBuddy AI – PDF Summarizer & Slide Generator",
        "Bite & Beans – Full-Stack Coffee Shop Web Application",
        "Online Food Ordering System",
    ]
    # Metadata/date lines under the titles must never leak into projects.
    for project in facts["projects"]:
        assert "Personal Project" not in project
        assert "Team Project" not in project


def test_extracts_projects_from_colon_style_bullets():
    resume = """\
Alex Kim
PROJECTS
- E-commerce Platform: Built a full-stack e-commerce app with React, Node.js, and PostgreSQL
- Task Management API: Designed RESTful API with FastAPI and Redis caching
- Portfolio Website: Created responsive portfolio using TypeScript and Tailwind CSS
EXPERIENCE
Software Engineer | TechCorp Inc. | Jan 2022 - Present
- Developed React frontend components for the customer dashboard
"""
    facts = extract_truth_guard_facts(resume)
    # Clean titles are preferred over the full bullet lines and over
    # experience entries (job titles are not projects).
    assert facts["projects"] == [
        "E-commerce Platform",
        "Task Management API",
        "Portfolio Website",
    ]


def test_falls_back_to_experience_bullets_when_no_project_titles():
    resume = """\
Sara Malik
WORK EXPERIENCE
- Developed full-stack web applications using Node.js and React
- Created MongoDB database schemas and optimized queries
- Implemented CI/CD pipeline using Jenkins and Docker
"""
    facts = extract_truth_guard_facts(resume)
    assert facts["projects"] == [
        "Developed full-stack web applications using Node.js and React",
        "Created MongoDB database schemas and optimized queries",
        "Implemented CI/CD pipeline using Jenkins and Docker",
    ]


def test_projects_are_deduplicated_and_capped():
    titles = "\n".join(f"Project {name} – Build {i}" for i, name in enumerate(
        ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"]
    ))
    resume = f"Alex Kim\nPROJECTS\n{titles}\n{titles}\n"
    facts = extract_truth_guard_facts(resume)
    assert len(facts["projects"]) == 8  # capped at the reasonable maximum
    assert len({p.lower() for p in facts["projects"]}) == 8  # duplicates removed


# ---------------------------------------------------------------------------
# Pipeline integration: exactly one unified LLM call, complete stored facts
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def setup_db():
    from app.main import _progress_store
    from app.core.database import init_db, get_db

    init_db()
    conn = get_db()
    conn.execute("DELETE FROM resumes")
    conn.execute("DELETE FROM analyses")
    conn.commit()
    conn.close()
    _progress_store.clear()


@pytest.mark.asyncio
@patch("app.core.pdf_parser.extract_resume_text")
@patch("app.api.resume.generate_completion")
async def test_pipeline_stores_complete_facts_with_one_llm_call(mock_generate, mock_extract):
    from app.main import run_async_analysis
    from app.core.database import get_db

    mock_extract.return_value = REPRESENTATIVE_RESUME
    mock_generate.return_value = json.dumps({
        "score_data": {
            "score": 90,
            "status": "Outstanding",
            "verdict_reason": "Strong match.",
            "breakdown": {"content": 10, "impact": 10, "skills": 10, "experience": 10, "formatting": 10}
        },
        "missing_keywords": [],
        "improvements_data": {"summary": "Good resume", "strengths": ["Strong Python"], "improvements": []}
    })

    await run_async_analysis("resume-tg", "fake.pdf", "AI Engineer")

    # The one-call guarantee: exactly ONE unified analysis request.
    assert mock_generate.call_count == 1

    conn = get_db()
    row = conn.execute("SELECT * FROM analyses WHERE resumeId = 'resume-tg'").fetchone()
    conn.close()

    assert row is not None
    assert row["analysisStatus"] == "completed"

    # The stored Truth Guard facts keep the complete five-key shape with the
    # locally extracted values — what the Profile page auto-fill reads.
    facts = json.loads(row["truthFacts"])
    assert set(facts.keys()) == {"name", "education", "skills", "tools", "projects"}
    assert facts["name"] == "UMAMA UME AMEN"
    assert "BSc Artificial Intelligence" in facts["education"]
    assert "Python" in facts["skills"]
    assert "Git" in facts["tools"]
    assert any("SmartBuddy AI" in p for p in facts["projects"])
