import { InterviewSession, InterviewFeedback } from '../types';
import { API_BASE } from '../config';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // keep the default message
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const interviewService = {
  async getSessions(): Promise<InterviewSession[]> {
    const res = await fetch(`${API_BASE}/interviews`);
    if (!res.ok) return [];
    return await res.json();
  },

  async getSession(id: string): Promise<InterviewSession | undefined> {
    const res = await fetch(`${API_BASE}/interviews/${id}`);
    if (!res.ok) return undefined;
    return await res.json();
  },

  async createSession(resumeId: string, type: 'HR' | 'Technical' | 'Resume-Based'): Promise<InterviewSession> {
    const res = await fetch(`${API_BASE}/interviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId, type }),
    });
    return await handle<InterviewSession>(res);
  },

  async submitMessage(sessionId: string, message: string): Promise<InterviewSession & { response: string }> {
    const res = await fetch(`${API_BASE}/interviews/${sessionId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    return await handle<InterviewSession & { response: string }>(res);
  },

  async getFeedback(sessionId: string): Promise<InterviewFeedback | undefined> {
    const res = await fetch(`${API_BASE}/interviews/${sessionId}/feedback`);
    if (!res.ok) return undefined;
    return await res.json();
  },

  async scoreSession(sessionId: string): Promise<InterviewFeedback> {
    const res = await fetch(`${API_BASE}/interviews/${sessionId}/score`, { method: 'POST' });
    return await handle<InterviewFeedback>(res);
  },
};
