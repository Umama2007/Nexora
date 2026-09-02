import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, ShieldAlert, Award, FileText } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { interviewService } from '../../services/interviewService';
import { resumeService } from '../../services/resumeService';
import styles from './InterviewModeSelect.module.css';

export const InterviewModeSelect: React.FC = () => {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState<'HR' | 'Technical' | 'Resume-Based'>('Technical');
  const [hasResume, setHasResume] = useState(false);
  const [targetRole, setTargetRole] = useState('');
  const [resumeId, setResumeId] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    const fetchResumes = async () => {
      const resumes = await resumeService.getResumes();
      if (resumes.length > 0) {
        setHasResume(true);
        setTargetRole(resumes[0].targetRole);
        setResumeId(resumes[0].id);
      }
    };
    fetchResumes();
  }, []);

  const handleStart = async () => {
    if (isStarting || !resumeId) return;
    setIsStarting(true);
    setStartError('');
    try {
      // The interviewer's opening question is generated on the backend,
      // grounded in the resume's Truth Guard facts - this can take a few seconds.
      const session = await interviewService.createSession(resumeId, selectedMode);
      navigate(`/interview/${session.id}`);
    } catch (err) {
      setIsStarting(false);
      const message = err instanceof Error ? err.message : 'Failed to start the interview.';
      if (message.includes('temporarily at capacity') || message.includes('AI_PROVIDERS_EXHAUSTED')) {
        setStartError('Our AI service is temporarily at capacity — please try again in a few minutes.');
      } else {
        setStartError(message);
      }
    }
  };

  const modes = [
    {
      value: 'Technical' as const,
      title: 'Technical Concepts',
      icon: Award,
      desc: 'Domain and technical questions drawn from the skills and tools on your resume, with follow-up probing on trade-offs and depth.',
      bullets: ['Questions grounded in your extracted skills', 'Trade-off and failure-mode probing', 'Role-relevant domain coverage']
    },
    {
      value: 'HR' as const,
      title: 'Behavioral & HR',
      icon: UserCheck,
      desc: 'Behavioral and situational questions. Tests your teamwork, communication, conflict resolution skills, and how you manage deliverables under pressure.',
      bullets: ['Conflict resolution scenarios', 'STAR answer structuring', 'Career aspirations']
    },
    {
      value: 'Resume-Based' as const,
      title: 'Resume-Based Project Audit',
      icon: FileText,
      desc: hasResume
        ? `Questions generated directly from the projects and experience on your resume${targetRole ? ` for "${targetRole}"` : ''}. You will defend your architecture decisions and outcomes.`
        : 'Questions generated directly from your uploaded experience bullets and projects. (Requires an uploaded resume).',
      bullets: ['Defending project decisions', 'Quantifying deliverables', 'Explaining engineering solutions']
    }
  ];

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>Practice Interviews</h2>
        <p>Hone your talking points in realistic conversational loops. Receive constructive, evidence-based feedback on communication and accuracy.</p>
      </div>

      <div className={styles.grid}>
        {modes.map((m) => {
          const Icon = m.icon;
          const isSelected = selectedMode === m.value;
          return (
            <Card
              key={m.value}
              className={`${styles.modeCard} ${isSelected ? styles.selectedCard : ''} ${!hasResume ? styles.disabledCard : ''}`}
              onClick={() => hasResume && setSelectedMode(m.value)}
            >
              <div className={styles.cardHeader}>
                <div className={`${styles.iconContainer} ${isSelected ? styles.selectedIcon : ''}`}>
                  <Icon size={22} />
                </div>
                <div className={styles.meta}>
                  <h3 className={styles.modeTitle}>{m.title}</h3>
                  {!hasResume && (
                    <Badge variant="default">Upload Needed</Badge>
                  )}
                </div>
              </div>

              <p className={styles.modeDesc}>{m.desc}</p>

              <div className={styles.bulletList}>
                {m.bullets.map((bullet, idx) => (
                  <div key={idx} className={styles.bulletItem}>
                    <Check size={14} className={styles.bulletCheck} />
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <div className={styles.actions}>
        {!hasResume && (
          <p className={styles.warnText}>
            <ShieldAlert size={16} />
            Upload and analyze a resume first - every interview mode is grounded in your actual resume facts.
          </p>
        )}
        {startError && (
          <p className={styles.warnText}>
            <ShieldAlert size={16} />
            {startError}
          </p>
        )}
        <Button variant="primary" onClick={handleStart} className={styles.startBtn} disabled={!hasResume || isStarting}>
          {isStarting ? 'Starting interview...' : 'Start Practice Interview'}
        </Button>
      </div>
    </div>
  );
};

// Canned Helper Component to keep things compact
const Check: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
export default InterviewModeSelect;
