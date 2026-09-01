import { Resume, ResumeAnalysis, TailorResult } from '../types';
import { API_BASE } from '../config';

export const resumeService = {
  async getResumes(): Promise<Resume[]> {
    const res = await fetch(`${API_BASE}/resumes`);
    if (!res.ok) return [];
    return await res.json();
  },

  async getResume(id: string): Promise<Resume | undefined> {
    const res = await fetch(`${API_BASE}/resumes/${id}`);
    if (!res.ok) return undefined;
    return await res.json();
  },

  async getAnalysis(resumeId: string): Promise<ResumeAnalysis | undefined> {
    const res = await fetch(`${API_BASE}/analyses/${resumeId}`);
    if (!res.ok) return undefined;
    return await res.json();
  },

  // Upload is now handled directly in ResumeUpload.tsx to support polling,
  // but we keep the signature for type completeness if needed elsewhere.
  async uploadResume(file: File, targetRole: string, careerLevel: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetRole', targetRole);
    formData.append('careerLevel', careerLevel);

    const res = await fetch(`${API_BASE}/resumes/upload`, {
      method: 'POST',
      body: formData,
    });
    return await res.json();
  },

  // Persists the applied/dismissed state of one improvement via the
  // backend PATCH endpoint, so the editor state survives page reloads.
  async updateImprovementStatus(resumeId: string, improvementId: string, status: 'applied' | 'dismissed'): Promise<ResumeAnalysis | undefined> {
    const res = await fetch(`${API_BASE}/analyses/${resumeId}/improvements`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ improvementId, status })
    });
    if (!res.ok) {
      console.error('Failed to update improvement status', res.status);
      return undefined;
    }
    return await res.json();
  },

  // FR-7: rewrite resume bullets toward the target job. The backend grounds
  // every bullet in the Truth Guard facts and runs the FR-8 grounding check
  // before returning — this call takes ~30-60s on local CPU.
  async tailorResume(resumeId: string): Promise<TailorResult> {
    const res = await fetch(`${API_BASE}/tailor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId })
    });
    if (!res.ok) {
      let detail = `Tailoring request failed (${res.status}).`;
      try {
        const body = await res.json();
        if (body?.detail) detail = String(body.detail);
      } catch {
        // keep the default message
      }
      throw new Error(detail);
    }
    return await res.json();
  }
};
