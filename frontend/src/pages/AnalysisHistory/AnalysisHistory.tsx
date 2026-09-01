import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Eye, ArrowRight, FileText } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { resumeService } from '../../services/resumeService';
import { Resume, ResumeAnalysis } from '../../types';
import styles from './AnalysisHistory.module.css';

export const AnalysisHistory: React.FC = () => {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, ResumeAnalysis>>({});

  useEffect(() => {
    // Fetch resumes history, then prefetch each analysis so the per-row
    // score/status lookups below stay synchronous during render.
    const fetchData = async () => {
      try {
        const list = await resumeService.getResumes();
        setResumes(list);
        const results = await Promise.all(list.map((r) => resumeService.getAnalysis(r.id)));
        const byResumeId: Record<string, ResumeAnalysis> = {};
        results.forEach((a) => {
          if (a) byResumeId[a.resumeId] = a;
        });
        setAnalyses(byResumeId);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  const getAnalysisScore = (resumeId: string) => {
    return analyses[resumeId]?.score ?? 0;
  };

  const getAnalysisStatus = (resumeId: string) => {
    return analyses[resumeId]?.status ?? 'Weak';
  };

  // Rows with no analysis at all, or a failed one, must not fall back to the
  // 0/100 "Weak" display — that is indistinguishable from a real poor score.
  const isAnalysisUnavailable = (resumeId: string) => {
    const a = analyses[resumeId];
    return !a || a.analysisStatus === 'error';
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>Analysis History</h2>
        <p>A history of your uploaded credentials and computed parser scores over time.</p>
      </div>

      {resumes.length > 0 ? (
        <Card className={styles.tableCard} noPadding>
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Resume Filename</th>
                  <th className={styles.th}>Target Role</th>
                  <th className={styles.th}>Score</th>
                  <th className={styles.th}>Upload Date</th>
                  <th className={styles.th}>Parser Match</th>
                  <th className={styles.th + ' ' + styles.textRight}>Action</th>
                </tr>
              </thead>
              <tbody>
                {resumes.map((res) => {
                  const score = getAnalysisScore(res.id);
                  const status = getAnalysisStatus(res.id);
                  const unavailable = isAnalysisUnavailable(res.id);
                  
                  return (
                    <tr key={res.id} className={styles.tr} onClick={() => navigate(`/analysis/${res.id}`)}>
                      <td className={styles.td}>
                        <div className={styles.filenameCell}>
                          <FileText size={16} className={styles.fileIcon} />
                          <span className={styles.filename}>{res.filename}</span>
                        </div>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.roleCell}>
                          <span className={styles.roleName}>{res.targetRole}</span>
                          <span className={styles.levelName}>{res.careerLevel}</span>
                        </div>
                      </td>
                      <td className={styles.td}>
                        {unavailable ? (
                          <span className={styles.unavailableText}>N/A</span>
                        ) : (
                          <span className={styles.scoreText}>{score}/100</span>
                        )}
                      </td>
                      <td className={styles.td}>
                        <span className={styles.dateText}>
                          {new Date(Number(res.uploadedAt) * 1000).toLocaleDateString()}
                        </span>
                      </td>
                      <td className={styles.td}>
                        {unavailable ? (
                          <Badge variant="default">Analysis unavailable</Badge>
                        ) : (
                          <Badge variant={score >= 80 ? 'success' : score >= 65 ? 'warning' : 'danger'}>
                            {status}
                          </Badge>
                        )}
                      </td>
                      <td className={styles.td + ' ' + styles.textRight} onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          className={styles.viewBtn}
                          onClick={() => navigate(`/analysis/${res.id}`)}
                        >
                          <Eye size={14} />
                          View Report
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className={styles.emptyCard}>
          <History size={48} className={styles.emptyIcon} />
          <h3>No Analysis History</h3>
          <p>You have not uploaded any resumes for screening yet. Submit your first resume file to start tracking scores.</p>
          <Button variant="primary" onClick={() => navigate('/resume-analysis')}>
            Analyze Resume
          </Button>
        </Card>
      )}
    </div>
  );
};
export default AnalysisHistory;
