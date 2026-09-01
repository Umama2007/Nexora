import { useEffect } from 'react';
import { resumeService } from '../services/resumeService';
import { ResumeAnalysis } from '../types';

const POLL_INTERVAL_MS = 3000;
// Give up after ~5 minutes and surface an error state instead of polling forever
// (e.g. if the backend restarts mid-generation, the row stays 'fast_completed').
const MAX_POLL_ATTEMPTS = 100;

/**
 * Polls the backend until the detailed analysis path finishes.
 * Only active while the analysis is in the 'fast_completed' state; once the
 * status changes to 'completed' (or 'error'), the final analysis is passed
 * to onUpdate and polling stops.
 */
export function useAnalysisPolling(
  analysis: ResumeAnalysis | null,
  onUpdate: (analysis: ResumeAnalysis) => void
) {
  useEffect(() => {
    if (!analysis || analysis.analysisStatus !== 'fast_completed') return;

    let cancelled = false;
    let attempts = 0;

    const pollInterval = setInterval(async () => {
      attempts += 1;

      if (attempts > MAX_POLL_ATTEMPTS) {
        clearInterval(pollInterval);
        if (!cancelled) onUpdate({ ...analysis, analysisStatus: 'error' });
        return;
      }

      try {
        const updated = await resumeService.getAnalysis(analysis.resumeId);
        if (cancelled || !updated) return;
        if (updated.analysisStatus && updated.analysisStatus !== 'fast_completed') {
          clearInterval(pollInterval);
          onUpdate(updated);
        }
      } catch (err) {
        console.error('Detailed analysis polling error', err);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [analysis, onUpdate]);
}
