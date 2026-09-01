import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, MessagesSquare, Award, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ScoreCard } from '../../components/ui/ScoreCard';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Badge } from '../../components/ui/Badge';
import { resumeService } from '../../services/resumeService';
import { interviewService } from '../../services/interviewService';
import { recommendationService } from '../../services/recommendationService';
import { Resume, ResumeAnalysis, InterviewSession, InterviewFeedback } from '../../types';
import styles from './Dashboard.module.css';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [latestResume, setLatestResume] = useState<Resume | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, InterviewFeedback>>({});
  const [pendingRecsCount, setPendingRecsCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const fetchedResumes = await resumeService.getResumes();
        setResumes(fetchedResumes);
        if (fetchedResumes.length > 0) {
          setLatestResume(fetchedResumes[0]);
          const ana = await resumeService.getAnalysis(fetchedResumes[0].id);
          if (ana) {
            setAnalysis(ana);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchData();

    // Interview sessions and their persisted FR-12 feedback scores
    const fetchInterviews = async () => {
      try {
        const ints = await interviewService.getSessions();
        setSessions(ints);
        const completed = ints.filter(s => s.status === 'completed');
        const feedbacks = await Promise.all(completed.map(s => interviewService.getFeedback(s.id)));
        const map: Record<string, InterviewFeedback> = {};
        completed.forEach((s, i) => {
          if (feedbacks[i]) map[s.id] = feedbacks[i] as InterviewFeedback;
        });
        setFeedbackMap(map);
      } catch (err) {
        console.error(err);
      }
    };

    fetchInterviews();

    // Pending action items come from the real derived recommendations
    const fetchRecs = async () => {
      try {
        const recs = await recommendationService.buildRecommendations();
        setPendingRecsCount(recs.filter((r) => r.status !== 'completed').length);
      } catch (err) {
        console.error(err);
      }
    };

    fetchRecs();
  }, []);

  const handleAnalyzeClick = () => {
    navigate('/resume-analysis');
  };

  // Safe defaults if no resume is uploaded yet
  const score = analysis?.score ?? 0;
  const status = analysis?.status ?? 'No Data';
  const breakdown = analysis?.breakdown ?? { content: 0, impact: 0, skills: 0, experience: 0, formatting: 0 };
  const hasAnalysis = Boolean(analysis && analysis.analysisStatus !== 'error');

  // Real skills count from the Truth Guard extraction (skills + tools,
  // de-duplicated case-insensitively); missing keywords come from the
  // fast analysis path. No data yet → show a genuine empty stat.
  const missingKeywords = analysis?.breakdown.missing_keywords ?? [];
  const skillsTracked = (() => {
    const facts = analysis?.truthFacts;
    if (!hasAnalysis || !facts) return null;
    const all = [...(facts.skills ?? []), ...(facts.tools ?? [])].map((s) => s.trim().toLowerCase());
    return new Set(all.filter(Boolean)).size;
  })();
  
  // Calculate average interview score from real persisted feedback (FR-12)
  const completedInterviews = sessions.filter(s => s.status === 'completed');
  let interviewReadiness = 'Average';
  let averageInterviewScore = 0;
  if (completedInterviews.length > 0) {
    const scored = completedInterviews.filter(s => feedbackMap[s.id]);
    if (scored.length > 0) {
      const total = scored.reduce((acc, sess) => acc + (feedbackMap[sess.id]?.score ?? 0), 0);
      averageInterviewScore = Math.round(total / scored.length);
      if (averageInterviewScore >= 80) interviewReadiness = 'Strong';
      else if (averageInterviewScore < 60) interviewReadiness = 'Weak';
    }
  }

  // Activity list combines resumes and interviews
  const activities = [
    ...resumes.map(r => ({
      id: r.id,
      type: 'resume' as const,
      title: r.filename,
      detail: r.targetRole,
      // uploadedAt is unix seconds from the API - convert to ms before parsing
      date: new Date(Number(r.uploadedAt) * 1000).toLocaleDateString(),
      score: r.id === analysis?.resumeId ? analysis.score : 0, // Using currently loaded analysis score or 0
      path: `/analysis/${r.id}`
    })),
    ...sessions.map(s => {
      const fb = feedbackMap[s.id];
      return {
        id: s.id,
        type: 'interview' as const,
        title: `${s.type} Practice`,
        detail: s.status === 'completed' ? 'Completed Session' : 'In Progress',
        date: new Date(s.startedAt).toLocaleDateString(),
        score: fb?.score ?? 0,
        path: s.status === 'completed' ? `/interview/${s.id}/feedback` : `/interview/${s.id}`
      };
    })
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  return (
    <div className={styles.container}>
      {/* Header Banner */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h2>Welcome back.</h2>
          <p>Here is your career profile at a glance.</p>
        </div>
        <Button variant="primary" onClick={handleAnalyzeClick}>
          + Analyze Resume
        </Button>
      </div>

      {/* Stats KPI Row */}
      <div className={styles.statsRow}>
        <ScoreCard
          score={score}
          label="Resume Score"
          subLabel={latestResume ? latestResume.filename : 'No resume uploaded'}
          statusText={score > 0 ? status : 'No Data'}
          statusVariant={score >= 80 ? 'success' : score >= 65 ? 'warning' : 'danger'}
        />
        <ScoreCard
          score={averageInterviewScore}
          label="Interview Readiness"
          subLabel={`${completedInterviews.length} mock sessions run`}
          statusText={averageInterviewScore > 0 ? interviewReadiness : 'Not Started'}
          statusVariant={averageInterviewScore >= 80 ? 'success' : averageInterviewScore >= 60 ? 'warning' : 'default'}
        />
        <Card className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Skills Tracked</span>
            <Award className={styles.statIcon} size={20} />
          </div>
          <span className={styles.statNumber}>{skillsTracked ?? '—'}</span>
          <span className={styles.statSubText}>
            {skillsTracked === null
              ? 'No resume analyzed yet'
              : missingKeywords.length > 0
                ? `${missingKeywords.length} keywords missing for target`
                : 'No missing keywords for target'}
          </span>
        </Card>
        <Card className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Action Items</span>
            <Sparkles className={styles.statIcon} size={20} />
          </div>
          <span className={styles.statNumber}>{pendingRecsCount}</span>
          <span className={styles.statSubText}>Pending recommendations</span>
        </Card>
      </div>

      {/* Main Grid */}
      <div className={styles.mainGrid}>
        {/* Resume Health Breakdown */}
        <Card title="Resume Health" extra={<Button variant="ghost" onClick={() => latestResume && navigate(`/analysis/${latestResume.id}/feedback`)}>Detailed Edits <ArrowRight size={14} /></Button>}>
          {latestResume ? (
            <div className={styles.healthList}>
              <ProgressBar value={breakdown.content} label="Content" subLabel="Bullet quality & phrasing" />
              <ProgressBar value={breakdown.impact} label="Impact" subLabel="Quantifiable achievements" />
              <ProgressBar value={breakdown.skills} label="Skills" subLabel="Keyword optimization" />
              <ProgressBar value={breakdown.experience} label="Experience" subLabel="Career progression" />
              <ProgressBar value={breakdown.formatting} label="Formatting" subLabel="ATS readability" />
            </div>
          ) : (
            <div className={styles.emptyCardBody}>
              <p>No resume health data available.</p>
              <Button variant="secondary" onClick={handleAnalyzeClick} className={styles.emptyBtn}>Upload Resume</Button>
            </div>
          )}
        </Card>

        {/* Column 2: AI Insights + Recent Activity */}
        <div className={styles.column2}>
          {/* AI Insight Card */}
          <Card className={styles.insightCard} noPadding>
            <div className={styles.insightHeader}>
              <Sparkles size={16} className={styles.insightIcon} />
              <h4>AI INSIGHT</h4>
            </div>
            <div className={styles.insightBody}>
              <p className={styles.insightText}>
                {hasAnalysis
                  ? missingKeywords.length > 0
                    ? `Your resume for "${latestResume?.targetRole}" scores ${score}/100, with ${missingKeywords.length} missing keyword${missingKeywords.length === 1 ? '' : 's'} (e.g. ${missingKeywords.slice(0, 3).join(', ')}). Add the ones that are truthful for your experience to strengthen ATS matching.`
                    : `Your resume for "${latestResume?.targetRole}" scores ${score}/100 and covers all commonly expected keywords for the role. Focus your next effort on the detailed edit suggestions in the report.`
                  : 'Upload your resume to receive contextual AI insights comparing your experience to industry standards.'}
              </p>
              <Button
                variant="ghost"
                className={styles.insightBtn}
                onClick={() => navigate('/recommendations')}
              >
                View recommendations <ArrowRight size={14} />
              </Button>
            </div>
          </Card>

          {/* Recent Activity Card */}
          <Card title="Recent Activity" extra={<Button variant="ghost" onClick={() => navigate('/analysis-history')}>View All</Button>}>
            {activities.length > 0 ? (
              <div className={styles.activityList}>
                {activities.map((act) => (
                  <div key={act.id} className={styles.activityRow} onClick={() => navigate(act.path)}>
                    <div className={styles.actLeft}>
                      <div className={styles.actIconWrapper}>
                        {act.type === 'resume' ? (
                          <FileText size={16} />
                        ) : (
                          <MessagesSquare size={16} />
                        )}
                      </div>
                      <div className={styles.actMeta}>
                        <span className={styles.actTitle}>{act.title}</span>
                        <span className={styles.actDetail}>{act.detail}</span>
                      </div>
                    </div>
                    <div className={styles.actRight}>
                      <span className={styles.actDate}>{act.date}</span>
                      {act.score > 0 && (
                        <Badge variant={act.score >= 80 ? 'success' : 'default'}>
                          {act.score} pts
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyActivities}>
                <CheckCircle2 size={32} className={styles.checkIcon} />
                <p>No recent activity. Get started by uploading a resume or trying an interview session!</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
