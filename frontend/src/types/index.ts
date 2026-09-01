export interface UserProfile {
  name: string;
  targetRole: string;
  careerLevel: string;
  education: string;
  skills: string[];
  interests: string[];
  /** Projects extracted from the latest analyzed resume (Truth Guard). */
  projects: string[];
}

export interface Resume {
  id: string;
  filename: string;
  fileSizeBytes: number;
  uploadedAt: string;
  targetRole: string;
  careerLevel: string;
}

export interface ImprovementItem {
  id: string;
  section: 'Experience' | 'Skills' | 'Education' | 'Formatting';
  current: string;
  feedback: string;
  suggestion: string;
  status: 'pending' | 'applied' | 'dismissed';
}

export interface ScoreBreakdown {
  content: number;
  impact: number;
  skills: number;
  experience: number;
  formatting: number;
  /** Missing keywords — produced by the fast analysis path. */
  missing_keywords?: string[];
  /** What missing_keywords were matched against (FR-3). */
  keyword_source?: 'job_description' | 'target_role';
  /** One-sentence shortlist verdict reason (FR-5). */
  verdict_reason?: string;
}

/**
 * Pipeline status of the fast/detailed analysis split.
 * 'fast_completed' = score + keywords ready, detailed feedback still generating.
 */
export type AnalysisStatus = 'fast_completed' | 'completed' | 'error';

/** FR-6 Truth Guard extraction stored alongside each analysis. */
export interface TruthFacts {
  name?: string;
  education?: string;
  skills?: string[];
  tools?: string[];
  projects?: string[];
  /** Fallback field when the LLM output could not be parsed as JSON. */
  raw_extraction?: string;
}

export interface ResumeAnalysis {
  id: string;
  resumeId: string;
  score: number;
  /** Verdict label from the fast path (e.g. 'Poor' | 'Average' | 'Good' | 'Outstanding'). */
  status: string;
  uploadedAt: string;
  breakdown: ScoreBreakdown;
  summary: string;
  strengths: string[];
  improvements: ImprovementItem[];
  analysisStatus?: AnalysisStatus;
  /** Truth Guard facts — present once the fast analysis path has run. */
  truthFacts?: TruthFacts | null;
}

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
}

export interface InterviewSession {
  id: string;
  resumeId?: string;
  type: 'HR' | 'Technical' | 'Resume-Based';
  status: 'in-progress' | 'completed';
  startedAt: string;
  currentQuestionIndex: number;
  questionsCount: number;
  chatHistory: ChatMessage[];
}

export interface InterviewIssue {
  id: string;
  type: string;
  description: string;
  suggestion: string;
}

export interface InterviewFeedback {
  id: string;
  sessionId: string;
  type: 'HR' | 'Technical' | 'Resume-Based';
  score: number;
  accuracy: number;
  communication: number;
  confidence: number;
  feedbackSummary: string;
  issues: InterviewIssue[];
}

export interface JobMatch {
  id: string;
  resumeId: string;
  targetRole: string;
  matchPercentage: number;
  matchingSkills: string[];
  missingSkills: string[];
}

export interface RoadmapStep {
  month: string;
  title: string;
  focus: string;
  whyItMatters: string;
}

export interface Roadmap {
  id: string;
  targetRole: string;
  missingSkills: string[];
  steps: RoadmapStep[];
}

export interface Recommendation {
  id: string;
  category: 'Resume' | 'Skills' | 'Interview Prep' | 'Career';
  title: string;
  whyItMatters: string;
  recommendedAction: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'todo' | 'started' | 'completed';
}

/** One original → rewritten bullet pair from the tailoring engine. */
export interface TailoredBullet {
  original: string;
  tailored: string;
}

/** FR-7/FR-8 tailoring result: rewritten bullets + grounding check. */
export interface TailorResult {
  resumeId: string;
  targetRole: string;
  tailoredBullets: TailoredBullet[];
  grounding: {
    is_grounded: boolean;
    hallucinations_caught: string[];
  };
}
