import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, BookOpen, ChevronRight, HelpCircle, ArrowLeft } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { resumeService } from '../../services/resumeService';
import { API_BASE } from '../../config';
import { Roadmap as RoadmapType } from '../../types';
import styles from './Roadmap.module.css';

export const Roadmap: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [roadmap, setRoadmap] = useState<RoadmapType | null>(null);
  const [targetRole, setTargetRole] = useState('Full Stack Engineer');
  const [isFromJobMatch, setIsFromJobMatch] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchRoadmap = async () => {
      // 1. Check router state for passed variables
      const state = location.state as { missingSkills?: string[]; targetRole?: string } | null;
      
      let skills: string[] = [];
      let role = 'Full Stack Engineer';

      if (state) {
        if (state.missingSkills && state.missingSkills.length > 0) {
          skills = state.missingSkills;
          setIsFromJobMatch(true);
        }
        if (state.targetRole) {
          role = state.targetRole;
        }
      } else {
        // Look up default target role from latest analyzed resume
        const resumes = await resumeService.getResumes();
        if (resumes.length > 0) {
          role = resumes[0].targetRole;
          const analysis = await resumeService.getAnalysis(resumes[0].id);
          if (analysis) {
            // The LLM names sections loosely ("Technical Skills", "Skills",
            // ...) and capitalizes status inconsistently ("Pending" vs
            // "pending"), so match both case-insensitively.
            const pendingSkills = analysis.improvements
              .filter(i => (i.section || '').toLowerCase().includes('skill') && (i.status || '').toLowerCase() === 'pending')
              .map(i => i.suggestion.split(':').pop()?.split(',')[0].trim() || '');
            skills = pendingSkills.filter(Boolean);
          }
        }
      }

      setTargetRole(role);
      
      if (skills.length === 0) {
        setRoadmap(null);
        return;
      }

      setIsLoading(true);
      setErrorMsg('');

      try {
        const response = await fetch(`${API_BASE}/roadmap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetRole: role, missingSkills: skills })
        });
        
        if (!response.ok) throw new Error("Failed to start roadmap generation");
        const data = await response.json();
        const roadmapId = data.roadmapId;

        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/roadmap/${roadmapId}/status`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status === 'completed') {
                clearInterval(pollInterval);
                const rmRes = await fetch(`${API_BASE}/roadmap/${roadmapId}`);
                if (rmRes.ok) {
                  const rmData = await rmRes.json();
                  setRoadmap(rmData);
                }
                setIsLoading(false);
              } else if (statusData.status === 'error') {
                clearInterval(pollInterval);
                setErrorMsg('Error generating roadmap.');
                setIsLoading(false);
              }
            }
          } catch (err) {
            console.error(err);
          }
        }, 2000);
      } catch (err) {
        setErrorMsg('Error connecting to backend.');
        setIsLoading(false);
      }
    };

    fetchRoadmap();
  }, [location]);

  return (
    <div className={styles.container}>
      {/* Header Info */}
      <div className={styles.pageHeader}>
        <div className={styles.headerTitleRow}>
          <h2>Your Career Roadmap</h2>
          {isFromJobMatch && (
            <Badge variant="success">Customized from Job Match</Badge>
          )}
        </div>
        <p>A time-boxed plan tailored for: <strong>{targetRole}</strong></p>
      </div>

      {isFromJobMatch && (
        <div className={styles.backRow}>
          <Button variant="ghost" onClick={() => navigate('/job-match')} className={styles.backBtn}>
            <ArrowLeft size={16} />
            Back to Job Match
          </Button>
        </div>
      )}

      {isLoading ? (
        <Card className={styles.loadingCard}>
          <div className={styles.spinner} />
          <h3>Structuring Your Learning Path...</h3>
          <p>Please wait while our AI builds a month-by-month curriculum tailored for {targetRole}.</p>
        </Card>
      ) : errorMsg ? (
        <Card className={styles.errorCard}>
          <h3>Failed to load roadmap</h3>
          <p>{errorMsg}</p>
        </Card>
      ) : roadmap && roadmap.steps.length > 0 ? (
        <div className={styles.roadmapGrid}>
          {/* Main Timeline Column */}
          <div className={styles.timelineCol}>
            <div className={styles.timeline}>
              {roadmap.steps.map((step, idx) => (
                <div key={idx} className={styles.timelineItem}>
                  {/* Timeline Point */}
                  <div className={styles.timelineIconWrapper}>
                    <span className={styles.timelinePointNum}>{idx + 1}</span>
                  </div>

                  {/* Step Card */}
                  <Card className={styles.stepCard}>
                    <div className={styles.stepHeader}>
                      <span className={styles.monthBadge}>{step.month}</span>
                      <Badge variant="primary">Focus: {step.focus}</Badge>
                    </div>
                    <h3 className={styles.stepTitle}>{step.title}</h3>
                    
                    <div className={styles.whyMattersBox}>
                      <span className={styles.whyLabel}>WHY THIS MATTERS</span>
                      <p className={styles.whyText}>{step.whyItMatters}</p>
                    </div>

                    <div className={styles.stepFooter}>
                      <Button
                        variant="ghost"
                        className={styles.practiceBtn}
                        onClick={() => navigate('/interview')}
                      >
                        Practice interviews on {step.focus}
                        <ChevronRight size={14} />
                      </Button>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Meta Guide Column */}
          <div className={styles.metaCol}>
            <Card title="How to execute this plan" className={styles.guideCard}>
              <div className={styles.guideItem}>
                <div className={styles.guideIcon}>
                  <BookOpen size={18} />
                </div>
                <div className={styles.guideText}>
                  <h4>1. Build project proofs</h4>
                  <p>Don't just read documentation. Build a small repository showcasing the technology, write unit tests, and host it live.</p>
                </div>
              </div>

              <div className={styles.guideItem}>
                <div className={styles.guideIcon}>
                  <Compass size={18} />
                </div>
                <div className={styles.guideText}>
                  <h4>2. Update your resume</h4>
                  <p>Once you finish a month's milestone, add the project to your resume with quantified bullets and upload it here again.</p>
                </div>
              </div>

              <div className={styles.guideItem}>
                <div className={styles.guideIcon}>
                  <HelpCircle size={18} />
                </div>
                <div className={styles.guideText}>
                  <h4>3. Run mock interviews</h4>
                  <p>Use the Mock Interview room in Resume-Based mode to defend your project's technology choices under realistic pressure.</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <Card className={styles.emptyCard}>
          <Compass size={48} className={styles.emptyIcon} />
          <h3>No Roadmap Gaps</h3>
          <p>We did not detect any missing skills between your resume and target role profile. Great work!</p>
          <Button variant="primary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </Card>
      )}
    </div>
  );
};
export default Roadmap;
