import { JobMatch } from '../types';

const API_BASE = 'http://127.0.0.1:8000/api';

// Pre-v2 key stored simulated (Math.random-based) match results — remove it
// once so no fake data can resurface.
localStorage.removeItem('nexora_job_matches');

export const jobMatchService = {
  /**
   * FR-14: runs the real job-match comparison on the backend. The backend
   * compares the job description against the resume's stored Truth Guard
   * facts and persists the result in the job_matches table.
   */
  async matchJob(resumeId: string, jobTitle: string, jobDescription: string): Promise<JobMatch> {
    const res = await fetch(`${API_BASE}/job-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId, targetRole: jobTitle, jobDescription })
    });

    if (!res.ok) {
      let detail = `Job match request failed (${res.status}).`;
      try {
        const body = await res.json();
        if (body?.detail) detail = String(body.detail);
      } catch {
        // keep the default message
      }
      throw new Error(detail);
    }

    const data = await res.json();
    if (data?.error || typeof data?.matchPercentage !== 'number') {
      throw new Error('The match engine returned an unreadable result. Please try again.');
    }
    return data as JobMatch;
  }
};
