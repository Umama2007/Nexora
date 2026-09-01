import sqlite3
import json
from typing import Optional

DB_PATH = "nexora.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Resumes
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS resumes (
            id TEXT PRIMARY KEY,
            filename TEXT,
            targetRole TEXT,
            careerLevel TEXT,
            uploadedAt TEXT,
            jobDescription TEXT
        )
    ''')

    # Migration: optional job description pasted at upload (FR-2/FR-3) —
    # drives JD-based missing-keyword matching and resume tailoring.
    resume_columns = [row[1] for row in cursor.execute('PRAGMA table_info(resumes)').fetchall()]
    if 'jobDescription' not in resume_columns:
        cursor.execute('ALTER TABLE resumes ADD COLUMN jobDescription TEXT')
    
    # Analyses
    # analysisStatus tracks the fast/detailed pipeline state:
    # 'fast_completed' = score + keywords persisted, detailed feedback still generating
    # 'completed'      = detailed feedback (summary, strengths, improvements) persisted
    # 'error'          = pipeline failed (before or after the fast-phase write);
    #                    the row carries no usable score/feedback
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS analyses (
            id TEXT PRIMARY KEY,
            resumeId TEXT,
            score INTEGER,
            status TEXT,
            breakdown TEXT,
            summary TEXT,
            strengths TEXT,
            improvements TEXT,
            truthFacts TEXT,
            analysisStatus TEXT DEFAULT 'completed'
        )
    ''')

    # Migration for databases created before the fast/detailed split:
    # legacy rows are fully analyzed, so they default to 'completed'.
    existing_columns = [row[1] for row in cursor.execute('PRAGMA table_info(analyses)').fetchall()]
    if 'analysisStatus' not in existing_columns:
        cursor.execute("ALTER TABLE analyses ADD COLUMN analysisStatus TEXT DEFAULT 'completed'")
    
    # Interviews
    # resumeId links a session to the analyzed resume so the FR-12 scoring
    # pass can reload the same Truth Guard facts that grounded the questions.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS interviews (
            id TEXT PRIMARY KEY,
            resumeId TEXT,
            type TEXT,
            status TEXT,
            startedAt TEXT,
            currentQuestionIndex INTEGER,
            questionsCount INTEGER,
            chatHistory TEXT
        )
    ''')
    
    # Migration for sessions created before FR-12 scoring existed.
    interview_columns = [row[1] for row in cursor.execute('PRAGMA table_info(interviews)').fetchall()]
    if 'resumeId' not in interview_columns:
        cursor.execute("ALTER TABLE interviews ADD COLUMN resumeId TEXT")
    
    # Interview Feedback
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS interview_feedback (
            id TEXT PRIMARY KEY,
            sessionId TEXT,
            type TEXT,
            score INTEGER,
            accuracy INTEGER,
            communication INTEGER,
            confidence INTEGER,
            feedbackSummary TEXT,
            issues TEXT
        )
    ''')
    
    # Job Matches
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS job_matches (
            id TEXT PRIMARY KEY,
            resumeId TEXT,
            targetRole TEXT,
            matchPercentage INTEGER,
            matchingSkills TEXT,
            missingSkills TEXT
        )
    ''')
    
    # Roadmaps
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS roadmaps (
            id TEXT PRIMARY KEY,
            targetRole TEXT,
            missingSkills TEXT,
            steps TEXT
        )
    ''')
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database fully initialized with all required frontend schema tables.")
