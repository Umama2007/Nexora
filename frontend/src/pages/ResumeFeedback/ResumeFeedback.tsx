import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, X, BookOpen, User, Briefcase, Award, Palette, AlertTriangle, Wand2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { resumeService } from '../../services/resumeService';
import { useAnalysisPolling } from '../../hooks/useAnalysisPolling';
import { Resume, ResumeAnalysis, ImprovementItem, TailorResult } from '../../types';
import styles from './ResumeFeedback.module.css';

export const ResumeFeedback: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [resume, setResume] = useState<Resume | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Experience' | 'Skills' | 'Education' | 'Formatting'>('Overview');
  const [isLoading, setIsLoading] = useState(true);

  // FR-7 tailoring state — generated on demand, grounded in Truth Guard facts.
  const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorError, setTailorError] = useState('');

  const handleTailor = async () => {
    if (!id || isTailoring) return;
    setIsTailoring(true);
    setTailorError('');
    try {
      const result = await resumeService.tailorResume(id);
      setTailorResult(result);
    } catch (err) {
      setTailorError(err instanceof Error ? err.message : 'Tailoring failed.');
    } finally {
      setIsTailoring(false);
    }
  };

  // Read initial tab from router state redirection (if passed from Results page quick links)
  useEffect(() => {
    const state = location.state as { initialTab?: 'Experience' | 'Skills' | 'Education' | 'Formatting' | 'Overview' } | null;
    if (state && state.initialTab) {
      setActiveTab(state.initialTab);
    }
  }, [location]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const [res, ana] = await Promise.all([
          resumeService.getResume(id),
          resumeService.getAnalysis(id),
        ]);
        if (!cancelled) {
          setResume(res ?? null);
          setAnalysis(ana ?? null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Poll every 3s while the detailed path is still generating (fast/detailed split)
  useAnalysisPolling(analysis, setAnalysis);

  const handleApply = async (impId: string) => {
    if (!id) return;
    const updated = await resumeService.updateImprovementStatus(id, impId, 'applied');
    if (updated) {
      setAnalysis(updated);
    }
  };

  const handleDismiss = async (impId: string) => {
    if (!id) return;
    const updated = await resumeService.updateImprovementStatus(id, impId, 'dismissed');
    if (updated) {
      setAnalysis(updated);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Loading editor suggestions...</p>
      </div>
    );
  }

  if (!resume || !analysis) {
    return (
      <div className={styles.errorContainer}>
        <AlertTriangle size={48} className={styles.errorIcon} />
        <h2>Feedback Not Found</h2>
        <p>We could not retrieve suggestions for the specified resume ID.</p>
        <Button variant="primary" onClick={() => navigate('/dashboard')}>
          Dashboard
        </Button>
      </div>
    );
  }

  // Skeleton state while the detailed path is still generating — the fast
  // path (score) is ready, but everything on this page needs detailed data.
  if (analysis.analysisStatus === 'fast_completed') {
    return (
      <div className={styles.container}>
        <div className={styles.backRow}>
          <Button variant="ghost" onClick={() => navigate(`/analysis/${id}`)} className={styles.backBtn}>
            <ArrowLeft size={16} />
            Back to Report
          </Button>
          <div className={styles.metaInfo}>
            <span className={styles.filename}>{resume.filename}</span>
            <Badge variant="primary">Score: {analysis.score}/100</Badge>
          </div>
        </div>

        <Card className={styles.generatingCard}>
          <div className={styles.generatingBody}>
            <div className={styles.spinner} />
            <h3>Generating detailed feedback...</h3>
            <p className={styles.generatingText}>
              Your score is ready. Detailed improvement suggestions are still being generated —
              this page will update automatically.
            </p>
            <div className={styles.skeletonLines} aria-hidden="true">
              <span className={styles.skeletonLine} style={{ width: '42%' }} />
              <span className={styles.skeletonLine} style={{ width: '92%' }} />
              <span className={styles.skeletonLine} style={{ width: '85%' }} />
              <span className={styles.skeletonLine} style={{ width: '66%' }} />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const tabs: { value: typeof activeTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { value: 'Overview', label: 'Overview', icon: BookOpen },
    { value: 'Experience', label: 'Experience', icon: Briefcase },
    { value: 'Skills', label: 'Skills', icon: Award },
    { value: 'Education', label: 'Education', icon: User },
    { value: 'Formatting', label: 'Formatting', icon: Palette }
  ];

  // Filter items matching the active tab
  const filteredImprovements = analysis.improvements.filter(imp => imp.section === activeTab);

  return (
    <div className={styles.container}>
      {/* Back navigation */}
      <div className={styles.backRow}>
        <Button variant="ghost" onClick={() => navigate(`/analysis/${id}`)} className={styles.backBtn}>
          <ArrowLeft size={16} />
          Back to Report
        </Button>
        <div className={styles.metaInfo}>
          <span className={styles.filename}>{resume.filename}</span>
          <Badge variant="primary">Score: {analysis.score}/100</Badge>
        </div>
      </div>

      {analysis.analysisStatus === 'error' && (
        <div className={styles.generationError}>
          <AlertTriangle size={16} />
          <span>Detailed feedback could not be generated for this analysis.</span>
        </div>
      )}

      {/* Tabs Row */}
      <div className={styles.tabsRow}>
        {tabs.map((t) => {
          const TabIcon = t.icon;
          return (
            <button
              key={t.value}
              className={`${styles.tabBtn} ${activeTab === t.value ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(t.value)}
            >
              <TabIcon size={16} />
              <span>{t.label}</span>
              {t.value !== 'Overview' && (
                <span className={styles.tabBadge}>
                  {analysis.improvements.filter(i => i.section === t.value && i.status === 'pending').length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className={styles.tabContent}>
        {activeTab === 'Overview' && (
          <div className={styles.overviewSection}>
            <Card title="Executive AI Assessment">
              <p className={styles.overviewPara}>{analysis.summary}</p>
            </Card>

            <div className={styles.assessmentGrid}>
              <Card title="Strengths Summary" className={styles.assessmentCard}>
                <ul className={styles.assessmentList}>
                  {analysis.strengths.map((str, idx) => (
                    <li key={idx}>
                      <span className={styles.bulletCheck}>✓</span>
                      {str}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title="Action Status" className={styles.assessmentCard}>
                <div className={styles.statusGrid}>
                  <div className={styles.statusBox}>
                    <span className={styles.statusCount}>
                      {analysis.improvements.filter(i => i.status === 'pending').length}
                    </span>
                    <span className={styles.statusLabel}>Pending</span>
                  </div>
                  <div className={styles.statusBox}>
                    <span className={`${styles.statusCount} ${styles.greenText}`}>
                      {analysis.improvements.filter(i => i.status === 'applied').length}
                    </span>
                    <span className={styles.statusLabel}>Applied</span>
                  </div>
                  <div className={styles.statusBox}>
                    <span className={`${styles.statusCount} ${styles.grayText}`}>
                      {analysis.improvements.filter(i => i.status === 'dismissed').length}
                    </span>
                    <span className={styles.statusLabel}>Dismissed</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* FR-7: on-demand bullet tailoring, grounded in Truth Guard facts */}
            <Card title="Tailor Bullets to Your Target Job" className={styles.tailorCard}>
              <p className={styles.tailorIntro}>
                Rewrites your resume bullets to better match <strong>{resume.targetRole}</strong>, using only the skills,
                tools, and projects extracted from your resume. Every rewrite is checked against your extracted facts
                before it is shown — nothing the model invents slips through silently.
              </p>

              {isTailoring ? (
                <div className={styles.tailorLoading}>
                  <div className={styles.spinner} />
                  <p>Rewriting your bullets on the local model — this usually takes under a minute.</p>
                </div>
              ) : tailorError ? (
                <div className={styles.tailorError}>
                  <AlertTriangle size={18} />
                  <p>{tailorError}</p>
                  <Button variant="secondary" onClick={handleTailor}>Try again</Button>
                </div>
              ) : tailorResult ? (
                <>
                  <div className={`${styles.groundingRow} ${tailorResult.grounding.is_grounded ? styles.grounded : styles.ungrounded}`}>
                    {tailorResult.grounding.is_grounded ? (
                      <><ShieldCheck size={16} /> Grounded — every technology term in these rewrites appears in your extracted skills.</>
                    ) : (
                      <><ShieldAlert size={16} /> Flagged terms not in your resume: {tailorResult.grounding.hallucinations_caught.join(', ')} — treat those rewrites with caution.</>
                    )}
                  </div>
                  <div className={styles.tailorList}>
                    {tailorResult.tailoredBullets.map((bullet, idx) => (
                      <div key={idx} className={styles.tailorItem}>
                        <div className={styles.textBlock}>
                          <span className={styles.blockLabel}>ORIGINAL</span>
                          <p className={styles.currentText}>{bullet.original}</p>
                        </div>
                        <div className={styles.textBlock}>
                          <span className={styles.blockLabel}>TAILORED</span>
                          <p className={styles.suggestionText}>{bullet.tailored}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={styles.tailorBtnRow}>
                    <Button variant="ghost" onClick={handleTailor} disabled={isTailoring}>
                      <Wand2 size={14} />
                      Regenerate
                    </Button>
                  </div>
                </>
              ) : (
                <div className={styles.tailorBtnRow}>
                  <Button variant="primary" onClick={handleTailor}>
                    <Wand2 size={16} />
                    Generate tailored bullets
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab !== 'Overview' && (
          <div className={styles.feedbackSection}>
            {filteredImprovements.length > 0 ? (
              <div className={styles.feedbackList}>
                {filteredImprovements.map((imp) => (
                  <Card key={imp.id} className={styles.feedbackCard}>
                    <div className={styles.feedbackRow}>
                      <div className={styles.feedbackLeft}>
                        {/* Status Label badge */}
                        <div className={styles.feedbackHeader}>
                          <Badge variant={imp.status === 'applied' ? 'success' : imp.status === 'dismissed' ? 'default' : 'warning'}>
                            {imp.status.toUpperCase()}
                          </Badge>
                        </div>

                        {/* Current bullet text block */}
                        <div className={styles.textBlock}>
                          <span className={styles.blockLabel}>CURRENT TEXT</span>
                          <p className={styles.currentText}>
                            {imp.status === 'applied' ? imp.suggestion : imp.current}
                          </p>
                        </div>

                        {/* AI feedback assessment */}
                        <div className={styles.textBlock}>
                          <span className={styles.blockLabel}>AI FEEDBACK</span>
                          <p className={styles.feedbackText}>{imp.feedback}</p>
                        </div>

                        {/* Proposed suggestion bullet block */}
                        <div className={styles.textBlock}>
                          <span className={styles.blockLabel}>SUGGESTED APPROACH</span>
                          <p className={styles.suggestionText}>{imp.suggestion}</p>
                        </div>
                      </div>

                      {/* Action trigger columns */}
                      <div className={styles.feedbackRight}>
                        {imp.status === 'pending' ? (
                          <div className={styles.actionButtons}>
                            <Button
                              variant="primary"
                              onClick={() => handleApply(imp.id)}
                              className={styles.applyBtn}
                            >
                              <Check size={16} />
                              Apply suggestion
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => handleDismiss(imp.id)}
                              className={styles.dismissBtn}
                            >
                              <X size={16} />
                              Dismiss
                            </Button>
                          </div>
                        ) : imp.status === 'applied' ? (
                          <div className={styles.successIndicator}>
                            <Check size={20} className={styles.greenCheck} />
                            <span>Applied to profile</span>
                            <Button variant="ghost" onClick={() => handleDismiss(imp.id)} className={styles.undoBtn}>
                              Undo
                            </Button>
                          </div>
                        ) : (
                          <div className={styles.dismissIndicator}>
                            <span>Dismissed</span>
                            <Button variant="ghost" onClick={() => handleApply(imp.id)} className={styles.undoBtn}>
                              Restore
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className={styles.emptyFeedback}>
                <Check size={32} className={styles.completCheck} />
                <h3>No pending issues!</h3>
                <p>Everything in the {activeTab} section matches standard guidelines. Great job!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default ResumeFeedback;
