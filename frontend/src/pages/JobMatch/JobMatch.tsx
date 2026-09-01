import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, FileText, CheckCircle, AlertCircle, ArrowRight, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { resumeService } from '../../services/resumeService';
import { jobMatchService } from '../../services/jobMatchService';
import { Resume, JobMatch as JobMatchType } from '../../types';
import styles from './JobMatch.module.css';

export const JobMatch: React.FC = () => {
  const navigate = useNavigate();

  // Load resumes to pick from
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState('');
  
  // Input fields
  const [jobTitle, setJobTitle] = useState('Full Stack Engineer');
  const [jobDescription, setJobDescription] = useState('');

  // States
  const [isMatching, setIsMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<JobMatchType | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResumes = async () => {
      try {
        const list = await resumeService.getResumes();
        setResumes(list);
        if (list.length > 0) {
          setSelectedResumeId(list[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchResumes();
  }, []);

  const handleMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResumeId || !jobDescription.trim() || !jobTitle.trim()) return;

    setIsMatching(true);
    setMatchResult(null);
    setMatchError(null);

    try {
      // Real FR-14 backend call — the LLM comparison can take a while on
      // CPU-only hardware, which the isMatching spinner state covers.
      const match = await jobMatchService.matchJob(selectedResumeId, jobTitle.trim(), jobDescription.trim());
      setMatchResult(match);
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : 'Job match failed.');
    } finally {
      setIsMatching(false);
    }
  };

  const handleSeeRoadmap = () => {
    if (!matchResult) return;
    // Carrying missing-skills state forward to the Roadmap page
    navigate('/roadmap', {
      state: {
        missingSkills: matchResult.missingSkills,
        targetRole: matchResult.targetRole
      }
    });
  };

  const hasResumes = resumes.length > 0;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>Job Match</h2>
        <p>Compare your credentials with a specific job listing to inspect technical alignment and identify skill gaps.</p>
      </div>

      {!hasResumes ? (
        <Card className={styles.emptyCard}>
          <AlertTriangle className={styles.emptyIcon} size={48} />
          <h3>No Resume Uploaded Yet</h3>
          <p>You need to upload and analyze your resume first before you can compare it against job descriptions.</p>
          <Button variant="primary" onClick={() => navigate('/resume-analysis')}>
            Upload Resume
          </Button>
        </Card>
      ) : (
        <div className={styles.grid}>
          {/* Inputs Section */}
          <Card title="Listing Details" className={styles.formCard}>
            <form onSubmit={handleMatch} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Select Resume</label>
                <div className={styles.selectWrapper}>
                  <select
                    className={styles.select}
                    value={selectedResumeId}
                    onChange={(e) => setSelectedResumeId(e.target.value)}
                    disabled={isMatching}
                  >
                    {resumes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.filename} ({r.targetRole})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="jobTitle" className={styles.label}>Target Job Title</label>
                <input
                  type="text"
                  id="jobTitle"
                  className={styles.input}
                  placeholder="e.g. Senior Frontend Developer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                  disabled={isMatching}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="jobDescription" className={styles.label}>Paste Job Description</label>
                <textarea
                  id="jobDescription"
                  className={styles.textarea}
                  placeholder="Paste the raw text of the job requirements here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  required
                  rows={8}
                  disabled={isMatching}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={!jobDescription.trim() || !jobTitle.trim() || isMatching}
              >
                {isMatching ? (
                  <>
                    <Loader2 size={16} className={styles.spin} />
                    Calculating Match Score...
                  </>
                ) : (
                  'Analyze Match'
                )}
              </Button>
            </form>
          </Card>

          {/* Results Section */}
          <div className={styles.resultCol}>
            {isMatching && (
              <Card className={styles.matchingPlaceholder}>
                <Loader2 className={styles.spinBig} size={48} />
                <h3>Scanning credentials...</h3>
                <p>Cross-referencing technology frameworks, parsing experience keywords, and mapping requirements.</p>
              </Card>
            )}

            {!isMatching && !matchResult && !matchError && (
              <div className={styles.resultPlaceholder}>
                <Target size={48} className={styles.placeholderIcon} />
                <h3>Awaiting Analysis</h3>
                <p>Paste a job description on the left and click "Analyze Match" to spot gaps.</p>
              </div>
            )}

            {!isMatching && matchError && (
              <Card className={styles.matchingPlaceholder}>
                <AlertTriangle size={48} className={styles.placeholderIcon} />
                <h3>Match Failed</h3>
                <p>{matchError}</p>
              </Card>
            )}

            {!isMatching && matchResult && (
              <div className={styles.resultView}>
                {/* Score Circle Card */}
                <Card className={styles.scoreResultCard}>
                  <div className={styles.scoreRow}>
                    <div className={styles.circleContainer}>
                      <span className={styles.percentText}>{matchResult.matchPercentage}%</span>
                      <span className={styles.percentLabel}>Match Rate</span>
                    </div>
                    <div className={styles.scoreMeta}>
                      <h3>{matchResult.targetRole}</h3>
                      <p>Resume: {resumes.find(r => r.id === selectedResumeId)?.filename}</p>
                      <Badge variant={matchResult.matchPercentage >= 75 ? 'success' : matchResult.matchPercentage >= 50 ? 'warning' : 'danger'}>
                        {matchResult.matchPercentage >= 75 ? 'Highly Competitive' : matchResult.matchPercentage >= 50 ? 'Good Baseline' : 'High Gaps'}
                      </Badge>
                    </div>
                  </div>
                </Card>

                {/* Skills Grid */}
                <div className={styles.skillsGrid}>
                  {/* Matching Skills */}
                  <Card title="Matching Qualifications" className={styles.matchingSkillsCard}>
                    <div className={styles.tagWrapper}>
                      {matchResult.matchingSkills.length > 0 ? (
                        matchResult.matchingSkills.map((sk) => (
                          <span key={sk} className={styles.matchTag}>
                            ✓ {sk}
                          </span>
                        ))
                      ) : (
                        <p className={styles.emptySkillsText}>No explicit matching skills found.</p>
                      )}
                    </div>
                  </Card>

                  {/* Missing Skills */}
                  <Card title="Identified Skill Gaps" className={styles.missingSkillsCard}>
                    <div className={styles.tagWrapper}>
                      {matchResult.missingSkills.length > 0 ? (
                        matchResult.missingSkills.map((sk) => (
                          <span key={sk} className={styles.missingTag}>
                            + {sk}
                          </span>
                        ))
                      ) : (
                        <p className={styles.emptySkillsText}>Perfect match! No missing skills identified.</p>
                      )}
                    </div>
                  </Card>
                </div>

                {/* CTA Action */}
                {matchResult.missingSkills.length > 0 && (
                  <Card className={styles.roadmapCtaCard}>
                    <div className={styles.roadmapCtaContent}>
                      <div className={styles.ctaText}>
                        <h4>Close your skill gaps</h4>
                        <p>We found {matchResult.missingSkills.length} missing technologies. Create a month-by-month study plan to build project proof and add them to your resume.</p>
                      </div>
                      <Button variant="primary" onClick={handleSeeRoadmap} className={styles.roadmapBtn}>
                        See your roadmap
                        <ArrowRight size={16} />
                      </Button>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default JobMatch;
