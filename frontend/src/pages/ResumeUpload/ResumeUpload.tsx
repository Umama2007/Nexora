import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { resumeService } from '../../services/resumeService';
import { API_BASE } from '../../config';
import styles from './ResumeUpload.module.css';

export const ResumeUpload: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [careerLevel, setCareerLevel] = useState('recent grad');
  const [targetRole, setTargetRole] = useState('Full Stack Engineer');
  // Optional pasted job description — switches missing-keyword matching from
  // the bare role name to the actual JD (FR-2/FR-3).
  const [jobDescription, setJobDescription] = useState('');

  // File states
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<'default' | 'uploading' | 'success' | 'error'>('default');
  const [errorMsg, setErrorMsg] = useState('');

  const careerOptions = [
    { value: 'student', label: 'Student' },
    { value: 'recent grad', label: 'Recent Graduate' },
    { value: 'job seeker', label: 'Job Seeker' },
    { value: 'career switch', label: 'Career Switcher' }
  ];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (selectedFile: File) => {
    // Validate file type
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
    
    const isPDF = selectedFile.type === 'application/pdf' || fileExtension === 'pdf';
    const isDOCX = selectedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileExtension === 'docx';
    
    if (!isPDF && !isDOCX) {
      setUploadState('error');
      setErrorMsg('Invalid file type. Please upload a PDF or DOCX file.');
      return;
    }

    // Validate size (10 MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setUploadState('error');
      setErrorMsg('File size exceeds the 10 MB limit.');
      return;
    }

    setFile(selectedFile);
    setUploadState('success');
    setErrorMsg('');
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleReplace = () => {
    setFile(null);
    setUploadState('default');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const [progressStage, setProgressStage] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // Handles for the status poll + elapsed timer; cleared on unmount so
  // navigating away mid-analysis cannot leak them.
  const timersRef = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearInterval);
    };
  }, []);

  const handleAnalyze = async () => {
    if (!file || !targetRole.trim()) return;

    setUploadState('uploading');
    setProgressStage(0);
    setElapsedSeconds(0);

    // CPU-only LLM inference takes ~a minute even for the fast path, so show
    // real elapsed time instead of implying near-instant results.
    const elapsedTimer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    timersRef.current.push(elapsedTimer);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetRole', targetRole.trim());
      formData.append('careerLevel', careerLevel);
      formData.append('jobDescription', jobDescription.trim());

      const response = await fetch(`${API_BASE}/resumes/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      const resumeId = data.resumeId;

      // Start polling
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/resumes/${resumeId}/status`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            
            if (statusData.progress_stage !== undefined) {
              setProgressStage(statusData.progress_stage);
            }
            
            // The fast path (score + missing keywords) is enough to open the
            // results page — detailed feedback keeps generating in the background.
            if (statusData.status === 'fast_completed' || statusData.status === 'completed') {
              clearInterval(pollInterval);
              clearInterval(elapsedTimer);
              setUploadState('success');
              navigate(`/analysis/${resumeId}`);
            } else if (statusData.status === 'error') {
              clearInterval(pollInterval);
              clearInterval(elapsedTimer);
              setUploadState('error');
              if (statusData.error_code === 'AI_PROVIDERS_EXHAUSTED') {
                setErrorMsg('Our AI service is temporarily at capacity — please try again in a few minutes.');
              } else {
                setErrorMsg(statusData.message || 'Analysis failed.');
              }
            }
          }
        } catch (err) {
          console.error("Polling error", err);
        }
      }, 2000);
      timersRef.current.push(pollInterval);

    } catch (err) {
      clearInterval(elapsedTimer);
      setUploadState('error');
      setErrorMsg('Something went wrong during the analysis. Please try again.');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>Resume Analysis</h2>
        <p>Get a detailed AI-powered review of your resume compared to target listings.</p>
      </div>

      <div className={styles.contentGrid}>
        {/* Onboarding Questionnaire */}
        <Card title="Career Context" className={styles.contextCard}>
          <div className={styles.formGroup}>
            <label htmlFor="careerLevel" className={styles.label}>
              Where are you in your career?
            </label>
            <div className={styles.selectWrapper}>
              <select
                id="careerLevel"
                className={styles.select}
                value={careerLevel}
                onChange={(e) => setCareerLevel(e.target.value)}
                disabled={uploadState === 'uploading'}
              >
                {careerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="targetRole" className={styles.label}>
              What role are you targeting?
            </label>
            <input
              type="text"
              id="targetRole"
              className={styles.input}
              placeholder="e.g. Full Stack Engineer"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              disabled={uploadState === 'uploading'}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="jobDescription" className={styles.label}>
              Job description <span style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              id="jobDescription"
              className={styles.textarea}
              placeholder="Paste the target job description here to compare missing keywords against the actual listing instead of the role name..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              disabled={uploadState === 'uploading'}
            />
            <p className={styles.jdHint}>
              With a job description, the analyzer lists keywords required by that listing but missing from your resume; without one, it compares against typical expectations for the role.
            </p>
          </div>
        </Card>

        {/* Upload Card */}
        <Card title="Upload Resume" className={styles.uploadCard}>
          {uploadState === 'default' && (
            <div
              className={`${styles.dropzone} ${isDragging ? styles.dragging : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleBrowseClick}
            >
              <input
                type="file"
                ref={fileInputRef}
                className={styles.fileInput}
                accept=".pdf,.docx"
                onChange={handleFileChange}
              />
              <UploadCloud className={styles.uploadIcon} size={48} />
              <h3>Drag & drop your resume here</h3>
              <p className={styles.helpText}>PDF or DOCX — Max 10 MB</p>
              <Button
                variant="secondary"
                onClick={handleBrowseClick}
                className={styles.browseBtn}
              >
                Browse files
              </Button>
            </div>
          )}

          {uploadState === 'uploading' && (
            <div className={styles.processingZone}>
              <RefreshCw className={styles.pulseIcon} size={48} />
              <h3>Analyzing your resume...</h3>
              <p className={styles.helpText}>
                {progressStage === 0 && "Parsing your resume and running Truth Guard extraction..."}
                {progressStage === 1 && "Facts verified. Calculating your fast ATS score..."}
                {progressStage === 2 && "Score ready! Opening your report..."}
                {progressStage === 3 && "Generating detailed feedback..."}
                {progressStage === 4 && "Finalizing your report..."}
              </p>
              <p className={styles.elapsedText}>Elapsed: {elapsedSeconds}s</p>
              <div className={styles.progressBarWrapper}>
                <div 
                  className={styles.progressBarFill} 
                  style={{ width: `${Math.min(100, 30 + progressStage * 32)}%`, transition: 'width 0.5s ease-in-out' }} 
                />
              </div>
              <p className={styles.splitNote}>
                Your score usually arrives within a minute or two — detailed suggestions keep generating on the results page.
              </p>
            </div>
          )}

          {uploadState === 'success' && file && (
            <div className={styles.successZone}>
              <div className={styles.fileCard}>
                <FileText className={styles.fileIcon} size={32} />
                <div className={styles.fileMeta}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <CheckCircle2 className={styles.checkIcon} size={24} />
              </div>

              <div className={styles.actions}>
                <Button variant="ghost" onClick={handleReplace} className={styles.btn}>
                  Replace File
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAnalyze}
                  className={styles.btn}
                  disabled={!targetRole.trim()}
                >
                  Analyze Resume
                </Button>
              </div>
            </div>
          )}

          {uploadState === 'error' && (
            <div className={styles.errorZone}>
              <AlertCircle className={styles.errorIcon} size={48} />
              <h3>Upload Failed</h3>
              <p className={styles.errorText}>{errorMsg}</p>
              <Button variant="secondary" onClick={handleReplace} className={styles.retryBtn}>
                Try again
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
export default ResumeUpload;
