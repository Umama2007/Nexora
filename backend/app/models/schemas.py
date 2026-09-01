from pydantic import BaseModel
from typing import List, Optional, Literal

class ImprovementItem(BaseModel):
    id: str
    section: Literal['Experience', 'Skills', 'Education', 'Formatting']
    current: str
    feedback: str
    suggestion: str
    status: Literal['pending', 'applied', 'dismissed']

class ScoreBreakdown(BaseModel):
    content: int
    impact: int
    skills: int
    experience: int
    formatting: int

class ResumeAnalysis(BaseModel):
    id: str
    resumeId: str
    score: int
    status: Literal['Weak', 'Average', 'Strong']
    uploadedAt: str
    breakdown: ScoreBreakdown
    summary: str
    strengths: List[str]
    improvements: List[ImproveItem]

class ChatMessage(BaseModel):
    id: str
    sender: Literal['ai', 'user']
    text: str
    timestamp: str

class InterviewIssue(BaseModel):
    id: str
    type: str
    description: str
    suggestion: str

class InterviewFeedback(BaseModel):
    id: str
    sessionId: str
    type: Literal['HR', 'Technical', 'Resume-Based']
    score: int
    accuracy: int
    communication: int
    confidence: int
    feedbackSummary: str
    issues: List[InterviewIssue]

class InterviewSession(BaseModel):
    id: str
    type: Literal['HR', 'Technical', 'Resume-Based']
    status: Literal['in-progress', 'completed']
    startedAt: str
    currentQuestionIndex: int
    questionsCount: int
    chatHistory: List[ChatMessage]

class RoadmapStep(BaseModel):
    month: str
    title: str
    focus: str
    whyItMatters: str

class Roadmap(BaseModel):
    id: str
    targetRole: str
    missingSkills: List[str]
    steps: List[RoadmapStep]

class JobMatch(BaseModel):
    id: str
    resumeId: str
    targetRole: str
    matchPercentage: int
    matchingSkills: List[str]
    missingSkills: List[str]
