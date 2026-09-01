import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, ArrowRight, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { RadialScore } from '../../components/charts/RadialScore';
import { resumeService } from '../../services/resumeService';
import { profileService } from '../../services/profileService';
import { useAnalysisPolling } from '../../hooks/useAnalysisPolling';
import { Resume, ResumeAnalysis } from '../../types';
import styles from './AnalysisResults.module.css';

export const AnalysisResults: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [resume, setResume] = useState<Resume | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Poll every 3s while the detailed path is still generating (fast/detailed split)
  useAnalysisPolling(analysis, setAnalysis);

  // Phase 2: once an analysis exists (the fast path already carries the
  // Truth Guard facts), fill any blank profile fields automatically. The
  // service is idempotent per resume and never overwrites existing values.
  useEffect(() => {
    if (!resume || !analysis || analysis.analysisStatus === 'error') return;
    profileService.autoPopulateFromResume(resume, analysis);
  }, [resume, analysis]);

  useEffect(() => {
    if (!id) return;
    
    const fetchData = async () => {
      try {
        const res = await resumeService.getResume(id);
        const ana = await resumeService.getAnalysis(id);
        
        if (res && ana) {
          setResume(res);
          setAnalysis(ana);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [id]);

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Loading analysis report...</p>
      </div>
    );
  }

  if (!resume || !analysis) {
    return (
      <div className={styles.errorContainer}>
        <AlertTriangle size={48} className={styles.errorIcon} />
        <h2>Report Not Found</h2>
        <p>We could not find the resume analysis report for the specified ID.</p>
        <Button variant="primary" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const { score, status, breakdown, summary, strengths, improvements } = analysis;

  // Fast-path data (score, breakdown, missing keywords) is already available here;
  // the detailed path (summary, strengths, improvements) may still be generating.
  const detailedPending = analysis.analysisStatus === 'fast_completed';
  const detailedFailed = analysis.analysisStatus === 'error';
  const missingKeywords = breakdown.missing_keywords ?? [];
  // FR-3: keywords may be matched against a pasted job description or the
  // bare role name — the hint must say which one is true.
  const fromJobDescription = breakdown.keyword_source === 'job_description';
  const verdictReason = breakdown.verdict_reason ?? '';

  const handleDetailedFeedbackClick = (tabSection?: string) => {
    const route = `/analysis/${id}/feedback`;
    if (tabSection) {
      navigate(route, { state: { initialTab: tabSection } });
    } else {
      navigate(route);
    }
  };

  return (
    <div className={styles.container}>
      {/* Back to dashboard breadcrumb */}
      <div className={styles.backRow}>
        <Button variant="ghost" onClick={() => navigate('/dashboard')} className={styles.backBtn}>
          <ArrowLeft size={16} />
          Back to Dashboard
        </Button>
      </div>

      {/* Main Score Banner */}
      <Card className={styles.heroCard}>
        <div className={styles.heroContent}>
          <div className={styles.scoreChart}>
            <RadialScore score={score} size={150} strokeWidth={8} />
          </div>
          <div className={styles.heroMeta}>
            <div className={styles.titleRow}>
              <h2>Your Resume Score</h2>
              <Badge variant={score >= 80 ? 'success' : score >= 65 ? 'warning' : 'danger'}>
                {status} Matches
              </Badge>
            </div>
            <p className={styles.filenameText}>Based on: <strong>{resume.filename}</strong></p>
            <p className={styles.roleText}>Target: {resume.targetRole} ({resume.careerLevel})</p>
            <p className={styles.dateText}>Analyzed on {new Date(Number(resume.uploadedAt) * 1000).toLocaleDateString()}</p>
            {verdictReason && (
              <p className={styles.roleText}><strong>Verdict:</strong> {verdictReason}</p>
            )}
            <div className={styles.heroActions}>
              <Button variant="primary" onClick={() => handleDetailedFeedbackClick()}>
                Improve Resume
                <ArrowRight size={16} className={styles.btnArrow} />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Content Grid */}
      <div className={styles.layoutGrid}>
        {/* Breakdown Progress Bars */}
        <div className={styles.leftCol}>
          <Card title="Score Breakdown">
            <div className={styles.breakdownList}>
              <ProgressBar value={breakdown.content} label="Content Quality" subLabel="Grammar, wording strength, and active verbs" />
              <ProgressBar value={breakdown.impact} label="Impact & Quantification" subLabel="Measurable statistics and business results" />
              <ProgressBar value={breakdown.skills} label="Skills Indexing" subLabel="Overlap with standard industry keywords" />
              <ProgressBar value={breakdown.experience} label="Work History Structure" subLabel="Logical formatting and career trajectory progress" />
              <ProgressBar value={breakdown.formatting} label="Parser Formatting" subLabel="Document cleanliness for automated screeners" />
            </div>
          </Card>

          {/* Missing Keywords (fast path — vs. the pasted job description or
              the target role, whichever was provided at upload) */}
          <Card title="Missing Keywords">
            {missingKeywords.length > 0 ? (
              <>
                <div className={styles.keywordsList}>
                  {missingKeywords.map((keyword) => (
                    <span key={keyword} className={styles.keywordChip}>{keyword}</span>
                  ))}
                </div>
                <p className={styles.keywordsHint}>
                  {fromJobDescription
                    ? 'Required by the job description you pasted, but not detected in your resume.'
                    : `Commonly expected for ${resume.targetRole} but not detected in your resume.`}
                </p>
              </>
            ) : (
              <p className={styles.keywordsHint}>
                {fromJobDescription
                  ? 'Every keyword required by the job description you pasted was detected. Nice work!'
                  : `No critical keywords missing for ${resume.targetRole}. Nice work!`}
              </p>
            )}
          </Card>

          {/* Overall AI Summary Assessment (detailed path) */}
          <Card title="AI Executive Summary" className={styles.summaryCard}>
            {detailedPending ? (
              <div className={styles.skeletonList} aria-hidden="true">
                <span className={styles.skeletonLine} style={{ width: '100%' }} />
                <span className={styles.skeletonLine} style={{ width: '94%' }} />
                <span className={styles.skeletonLine} style={{ width: '62%' }} />
              </div>
            ) : detailedFailed ? (
              <p className={styles.summaryText}>Detailed summary is unavailable for this analysis.</p>
            ) : (
              <p className={styles.summaryText}>{summary}</p>
            )}
          </Card>
        </div>

        {/* Strengths & Improvements (detailed path) */}
        <div className={styles.rightCol}>
          {detailedPending ? (
            <>
              <Card title="Key Strengths" className={styles.strengthsCard}>
                <div className={styles.skeletonList} aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={styles.skeletonRow}>
                      <span className={styles.skeletonDot} />
                      <span className={styles.skeletonLine} style={{ width: `${92 - i * 14}%` }} />
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Areas to Improve">
                <div className={styles.generatingNote}>
                  <span className={styles.miniSpinner} />
                  <span>Generating detailed feedback — strengths and suggestions will appear here in the next minute or two.</span>
                </div>
                <div className={styles.skeletonList} aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={styles.skeletonBlock}>
                      <span className={styles.skeletonLine} style={{ width: '38%' }} />
                      <span className={styles.skeletonLine} style={{ width: `${88 - i * 8}%` }} />
                      <span className={styles.skeletonLine} style={{ width: `${68 - i * 8}%` }} />
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : detailedFailed ? (
            <Card className={styles.detailedErrorCard}>
              <div className={styles.detailedError}>
                <AlertTriangle size={20} className={styles.detailedErrorIcon} />
                <div>
                  <h4>Detailed feedback unavailable</h4>
                  <p>
                    The detailed analysis could not be generated. Your score and breakdown above are
                    still valid — try re-analyzing the resume.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {/* Strengths Card */}
              <Card title="Key Strengths" className={styles.strengthsCard}>
                <ul className={styles.list}>
                  {strengths.map((str, idx) => (
                    <li key={idx} className={styles.listRow}>
                      <CheckCircle className={styles.checkIcon} size={18} />
                      <span>{str}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Areas to Improve Card */}
              <Card
                title="Areas to Improve"
                extra={
                  <Button variant="ghost" onClick={() => handleDetailedFeedbackClick()}>
                    View All Edits
                  </Button>
                }
              >
                <div className={styles.improvementsList}>
                  {improvements.slice(0, 3).map((imp) => (
                    <div key={imp.id} className={styles.improvementItem}>
                      <div className={styles.impHeader}>
                        <Badge variant={imp.status === 'applied' ? 'success' : 'warning'}>
                          {imp.section}
                        </Badge>
                        <button
                          className={styles.quickLink}
                          onClick={() => handleDetailedFeedbackClick(imp.section)}
                          aria-label={`Go to detailed ${imp.section} feedback`}
                        >
                          Fix item
                          <ArrowUpRight size={14} />
                        </button>
                      </div>
                      <p className={styles.impCurrent}>"{imp.current}"</p>
                      <p className={styles.impFeedback}>{imp.feedback}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
export default AnalysisResults;
