import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { RadialScore } from '../../components/charts/RadialScore';
import { interviewService } from '../../services/interviewService';
import { InterviewFeedback as FeedbackType, InterviewSession } from '../../types';
import styles from './InterviewFeedback.module.css';

export const InterviewFeedback: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [feedback, setFeedback] = useState<FeedbackType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScoring, setIsScoring] = useState(false);
  const [scoreError, setScoreError] = useState('');
  const [isRetaking, setIsRetaking] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const sess = await interviewService.getSession(sessionId);
        if (cancelled) return;
        setSession(sess ?? null);
        setIsLoading(false);
        if (!sess) return;

        const existing = await interviewService.getFeedback(sessionId);
        if (cancelled) return;
        if (existing) {
          setFeedback(existing);
          return;
        }

        // FR-12: first view of an ended session triggers the LLM scoring pass
        setIsScoring(true);
        try {
          const scored = await interviewService.scoreSession(sessionId);
          if (!cancelled) setFeedback(scored);
        } catch (err) {
          if (!cancelled) setScoreError(err instanceof Error ? err.message : 'Scoring failed.');
        } finally {
          if (!cancelled) setIsScoring(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleRetake = async () => {
    if (!session || isRetaking) return;
    if (!session.resumeId) {
      navigate('/interview');
      return;
    }
    setIsRetaking(true);
    setScoreError('');
    try {
      const newSession = await interviewService.createSession(session.resumeId, session.type);
      navigate(`/interview/${newSession.id}`);
    } catch (err) {
      setIsRetaking(false);
      setScoreError(err instanceof Error ? err.message : 'Failed to start a new session.');
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Opening feedback report...</p>
      </div>
    );
  }

  if (isScoring) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Generating performance audit... this runs the AI scoring pass and usually takes under a minute.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={styles.errorContainer}>
        <AlertCircle size={48} className={styles.errorIcon} />
        <h2>Feedback Report Not Found</h2>
        <p>We could not find this interview session.</p>
        <Button variant="primary" onClick={() => navigate('/interview')}>
          Back to Mode Select
        </Button>
      </div>
    );
  }

  if (!feedback) {
    // Honest empty state - e.g. an interview ended before any answers were given
    return (
      <div className={styles.errorContainer}>
        <AlertCircle size={48} className={styles.errorIcon} />
        <h2>No Scores Yet</h2>
        <p>{scoreError || 'This interview has not been scored yet.'}</p>
        <Button variant="primary" onClick={() => navigate(`/interview/${sessionId}`)}>
          Back to Interview
        </Button>
      </div>
    );
  }

  const { score, accuracy, communication, confidence, feedbackSummary, issues } = feedback;

  return (
    <div className={styles.container}>
      {/* Navigation */}
      <div className={styles.backRow}>
        <Button variant="ghost" onClick={() => navigate('/interview')} className={styles.backBtn}>
          <ArrowLeft size={16} />
          Back to Mode Selection
        </Button>
      </div>

      {/* Main Score Card Banner */}
      <Card className={styles.heroCard}>
        <div className={styles.heroContent}>
          <div className={styles.scoreChart}>
            <RadialScore score={score} size={140} strokeWidth={8} />
          </div>
          <div className={styles.heroMeta}>
            <div className={styles.titleRow}>
              <h2>Interview Assessment</h2>
              <Badge variant={score >= 80 ? 'success' : score >= 65 ? 'warning' : 'danger'}>
                {score >= 80 ? 'Job Ready' : score >= 65 ? 'Needs Practice' : 'Needs Work'}
              </Badge>
            </div>
            <p className={styles.sessionText}>Mode: <strong>{session.type} Interview</strong></p>
            <p className={styles.dateText}>Completed on {new Date(session.startedAt).toLocaleDateString()}</p>
            <div className={styles.heroActions}>
              <Button variant="primary" onClick={handleRetake} className={styles.retakeBtn} disabled={isRetaking}>
                <RefreshCw size={14} className={styles.btnIcon} />
                {isRetaking ? 'Starting new session...' : 'Start New Session'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Grid Layout */}
      <div className={styles.layoutGrid}>
        {/* Left Column: Comms / Comps scores */}
        <div className={styles.leftCol}>
          <Card title="Competency Metrics">
            <div className={styles.metricsList}>
              <ProgressBar
                value={accuracy}
                label="Technical Accuracy"
                subLabel="Correctness of concepts and API frameworks described"
              />
              <ProgressBar
                value={communication}
                label="Communication Quality"
                subLabel="Clarity, structure, and STAR method pacing"
              />
              <ProgressBar
                value={confidence}
                label="Confidence & Tone"
                subLabel="Firmness of assertions and reduction of filler words"
              />
            </div>
          </Card>

          <Card title="AI Audit Overview">
            <p className={styles.summaryText}>{feedbackSummary}</p>
          </Card>
        </div>

        {/* Right Column: Evidence issues list */}
        <div className={styles.rightCol}>
          <Card title="Specific Talking Points to Fix">
            {issues.length > 0 ? (
              <div className={styles.issuesList}>
                {issues.map((iss) => (
                  <div key={iss.id} className={styles.issueItem}>
                    <div className={styles.issueHeader}>
                      <Badge variant={iss.type === 'Technical Accuracy' ? 'danger' : iss.type === 'Confidence' ? 'warning' : 'primary'}>
                        {iss.type}
                      </Badge>
                    </div>
                    <h4 className={styles.issueDesc}>{iss.description}</h4>
                    <div className={styles.suggestionBlock}>
                      <span className={styles.suggestLabel}>SUGGESTED APPROACH</span>
                      <p className={styles.suggestText}>{iss.suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.noIssues}>
                <CheckCircle size={32} className={styles.greenCheck} />
                <h4>Perfect alignment!</h4>
                <p>We did not detect any major speech fillers or concept errors. You explained all metrics accurately.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
export default InterviewFeedback;
