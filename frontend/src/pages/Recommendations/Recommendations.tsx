import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CheckCircle2, Play, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { recommendationService } from '../../services/recommendationService';
import { Recommendation } from '../../types';
import styles from './Recommendations.module.css';

export const Recommendations: React.FC = () => {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // Recommendations are derived from the user's real analyses and
        // interview feedback — nothing is hardcoded.
        const recs = await recommendationService.buildRecommendations();
        if (!cancelled) setRecommendations(recs);
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError('Could not reach the local backend to build recommendations.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleStatus = (id: string) => {
    const current = recommendations.find((r) => r.id === id);
    if (!current) return;
    const next: Recommendation['status'] =
      current.status === 'todo' ? 'started' : current.status === 'started' ? 'completed' : 'todo';
    recommendationService.setStatus(id, next);
    setRecommendations((list) => list.map((r) => (r.id === id ? { ...r, status: next } : r)));
  };

  const handleStartAction = (rec: Recommendation) => {
    if (rec.status === 'completed') return;

    if (rec.status === 'todo') {
      handleToggleStatus(rec.id);
    }

    // Direct routing helper based on category
    if (rec.category === 'Resume') {
      navigate('/resume-analysis');
    } else if (rec.category === 'Interview Prep') {
      navigate('/interview');
    } else if (rec.category === 'Skills') {
      navigate('/roadmap');
    } else if (rec.category === 'Career') {
      navigate('/job-match');
    }
  };

  const getPriorityVariant = (priority: 'High' | 'Medium' | 'Low') => {
    if (priority === 'High') return 'danger';
    if (priority === 'Medium') return 'warning';
    return 'default';
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>Recommendations</h2>
        <p>Personalized actions derived from your resume analyses and mock interview scores.</p>
      </div>

      {isLoading ? (
        <Card className={styles.loadingCard}>
          <div className={styles.spinner} />
          <p>Compiling recommendations from your latest analysis and interview results...</p>
        </Card>
      ) : loadError ? (
        <Card className={styles.errorCard}>
          <AlertTriangle size={48} className={styles.errorIcon} />
          <h3>Could not load recommendations</h3>
          <p>{loadError} Make sure the local backend is running, then try again.</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            <RefreshCw size={14} />
            Retry
          </Button>
        </Card>
      ) : recommendations.length > 0 ? (
        <div className={styles.grid}>
          {recommendations.map((rec) => {
            const isCompleted = rec.status === 'completed';
            const isStarted = rec.status === 'started';

            return (
              <Card
                key={rec.id}
                className={`${styles.recCard} ${isCompleted ? styles.completedCard : ''}`}
                title={
                  <div className={styles.cardHeader}>
                    <Badge variant="primary">{rec.category}</Badge>
                    <Badge variant={getPriorityVariant(rec.priority)}>
                      {rec.priority} Priority
                    </Badge>
                  </div>
                }
                extra={
                  <button
                    className={styles.statusToggleBtn}
                    onClick={() => handleToggleStatus(rec.id)}
                    aria-label={`Mark recommendation "${rec.title}" as ${isCompleted ? 'todo' : 'completed'}`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className={styles.completedIcon} size={20} />
                    ) : (
                      <div className={styles.circlePlaceholder} />
                    )}
                  </button>
                }
              >
                <h3 className={styles.recTitle}>{rec.title}</h3>
                
                <div className={styles.details}>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>WHY THIS MATTERS</span>
                    <p className={styles.metaText}>{rec.whyItMatters}</p>
                  </div>

                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>RECOMMENDED ACTION</span>
                    <p className={styles.metaText}>{rec.recommendedAction}</p>
                  </div>
                </div>

                <div className={styles.footer}>
                  <Button
                    variant={isCompleted ? 'secondary' : isStarted ? 'secondary' : 'primary'}
                    className={styles.actionBtn}
                    onClick={() => handleStartAction(rec)}
                    disabled={isCompleted}
                  >
                    {isCompleted ? (
                      <>
                        <Check size={14} />
                        Done
                      </>
                    ) : isStarted ? (
                      <>
                        <Play size={14} className={styles.playIcon} />
                        Resume Progress
                      </>
                    ) : (
                      'Start Task'
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className={styles.emptyCard}>
          <Sparkles size={48} className={styles.emptyIcon} />
          <h3>All caught up!</h3>
          <p>No new actions recommended yet. Upload a resume or practice an interview to get suggestions.</p>
          <Button variant="primary" onClick={() => navigate('/resume-analysis')}>
            Upload Resume
          </Button>
        </Card>
      )}
    </div>
  );
};
export default Recommendations;
