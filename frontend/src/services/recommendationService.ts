import { Recommendation, InterviewFeedback, InterviewSession } from '../types';
import { resumeService } from './resumeService';
import { interviewService } from './interviewService';

const STATUS_KEY = 'nexora_recommendation_status_v2';
// Pre-v2 key was seeded with four hardcoded demo recommendations — remove it
// once so no fake data can resurface.
localStorage.removeItem('nexora_recommendations');

type StatusMap = Record<string, Recommendation['status']>;

function readStatuses(): StatusMap {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    return raw ? (JSON.parse(raw) as StatusMap) : {};
  } catch {
    return {};
  }
}

export const recommendationService = {
  setStatus(id: string, status: Recommendation['status']): void {
    const statuses = readStatuses();
    statuses[id] = status;
    localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
  },

  /**
   * Builds the recommendation list from the user's real data — latest
   * analysis (missing keywords, pending improvements) and persisted
   * interview feedback. Nothing is hardcoded: a fresh system with no
   * analyses and no interviews yields an empty list.
   */
  async buildRecommendations(): Promise<Recommendation[]> {
    const recs: Recommendation[] = [];

    // --- Resume-derived recommendations ---
    const resumes = await resumeService.getResumes().catch(() => []);
    const latest = resumes[0];
    const analysis = latest ? await resumeService.getAnalysis(latest.id).catch(() => undefined) : undefined;
    const analysisUsable = Boolean(analysis && analysis.analysisStatus !== 'error');

    if (latest && analysis && analysisUsable) {
      const missingKeywords = analysis.breakdown.missing_keywords ?? [];

      if (missingKeywords.length > 0) {
        recs.push({
          id: `rec-keywords-${analysis.resumeId}`,
          category: 'Skills',
          title: `Close ${missingKeywords.length} keyword gap${missingKeywords.length === 1 ? '' : 's'} for ${latest.targetRole}`,
          whyItMatters: `The analyzer flagged these as commonly expected for ${latest.targetRole} but not detected in your resume: ${missingKeywords.slice(0, 6).join(', ')}${missingKeywords.length > 6 ? ', …' : ''}.`,
          recommendedAction: 'Where they are truthful for your experience, work these keywords into your project and experience bullets, then re-analyze to confirm they are detected.',
          priority: missingKeywords.length >= 5 || analysis.score < 65 ? 'High' : 'Medium',
          status: 'todo'
        });
      }

      const pending = analysis.improvements.filter((i) => i.status === 'pending');
      if (pending.length > 0) {
        const first = pending[0];
        const preview = (first.suggestion || first.feedback || '').slice(0, 140);
        recs.push({
          id: `rec-improvements-${analysis.resumeId}`,
          category: 'Resume',
          title: `Apply ${pending.length} pending resume edit${pending.length === 1 ? '' : 's'}`,
          whyItMatters: `Detailed feedback is waiting in your latest report — starting with the ${first.section} section.`,
          recommendedAction: `Open the analysis report and work through the suggested edits, e.g. ${preview}${preview.length >= 140 ? '…' : ''}`,
          priority: analysis.score < 65 ? 'High' : 'Medium',
          status: 'todo'
        });
      }
    }

    // --- Interview-derived recommendations (FR-12 feedback) ---
    let scored: Array<{ session: InterviewSession; feedback: InterviewFeedback }> = [];
    try {
      const sessions = await interviewService.getSessions();
      const completed = sessions.filter((s) => s.status === 'completed');
      const pairs = await Promise.all(
        completed.map(async (session) => ({ session, feedback: await interviewService.getFeedback(session.id) }))
      );
      scored = pairs.filter((p): p is { session: InterviewSession; feedback: InterviewFeedback } => Boolean(p.feedback));
    } catch {
      // backend unreachable — skip interview-derived recommendations
    }

    if (scored.length > 0) {
      const dimensionLabels: Array<{ key: keyof InterviewFeedback; label: string }> = [
        { key: 'accuracy', label: 'technical accuracy' },
        { key: 'communication', label: 'communication' },
        { key: 'confidence', label: 'confidence' }
      ];
      const averages = dimensionLabels
        .map(({ key, label }) => ({
          label,
          score: Math.round(scored.reduce((acc, p) => acc + (Number(p.feedback[key]) || 0), 0) / scored.length)
        }))
        .sort((a, b) => a.score - b.score);
      const weakest = averages[0];

      if (weakest.score < 80) {
        recs.push({
          id: 'rec-interview-weakness',
          category: 'Interview Prep',
          title: `Strengthen your weakest interview dimension: ${weakest.label}`,
          whyItMatters: `Across ${scored.length} scored session${scored.length === 1 ? '' : 's'}, your average ${weakest.label} score is lowest at ${weakest.score}/100.`,
          recommendedAction: `Run another mock interview and consciously focus on ${weakest.label}; compare the before and after scores on the feedback screen.`,
          priority: weakest.score < 60 ? 'High' : 'Medium',
          status: 'todo'
        });
      }
    } else if (analysisUsable) {
      // Resume analyzed but no scored sessions yet — a real, actionable next step.
      recs.push({
        id: 'rec-first-interview',
        category: 'Interview Prep',
        title: 'Run your first mock interview',
        whyItMatters: 'You have an analyzed resume but no scored interview sessions yet — feedback from interviews feeds the readiness score on your dashboard.',
        recommendedAction: 'Open the Interview Room and run a 5-question HR, Technical, or Resume-Based session against your resume.',
        priority: 'Low',
        status: 'todo'
      });
    }

    // Overlay user-tracked statuses so completed/started items persist.
    const statuses = readStatuses();
    return recs.map((r) => ({ ...r, status: statuses[r.id] ?? r.status }));
  }
};
