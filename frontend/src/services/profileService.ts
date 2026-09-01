import { Resume, ResumeAnalysis, UserProfile } from '../types';
import { resumeService } from './resumeService';

const PROFILE_KEY = 'nexora_profile_v2';
// Last resume the automatic population ran for. Prevents re-filling a field
// the user deliberately cleared whenever they revisit the same analysis.
const AUTOFILL_LAST_RESUME_KEY = 'nexora_profile_autofill_last_resume';
// Pre-v2 key held a hardcoded demo profile ("Alex Chen") — remove it once so
// no fake data can resurface.
localStorage.removeItem('nexora_profile');

export function emptyProfile(): UserProfile {
  return {
    name: '',
    targetRole: '',
    careerLevel: '',
    education: '',
    skills: [],
    interests: [],
    projects: []
  };
}

/** Profile-relevant fields derivable from one resume + its analysis. */
interface ExtractedProfileData {
  name: string;
  education: string;
  targetRole: string;
  careerLevel: string;
  skills: string[];
  projects: string[];
}

function extractProfileData(resume: Resume, analysis: ResumeAnalysis | null | undefined): ExtractedProfileData {
  const facts = analysis?.truthFacts ?? undefined;
  // Skills and tools both land in the profile's skills list, de-duplicated
  // case-insensitively while preserving the first spelling seen.
  const combined = [...(facts?.skills ?? []), ...(facts?.tools ?? [])]
    .map((s) => String(s).trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const skills = combined.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    name: (facts?.name ?? '').trim(),
    education: (facts?.education ?? '').trim(),
    targetRole: resume.targetRole?.trim() ?? '',
    careerLevel: resume.careerLevel?.trim() ?? '',
    skills,
    projects: (facts?.projects ?? []).map((p) => String(p).trim()).filter(Boolean)
  };
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function isBlank(value: string | string[]): boolean {
  return Array.isArray(value) ? value.length === 0 : value.trim().length === 0;
}

/**
 * Merges extracted resume data into a profile.
 *
 * overwrite = false (automatic, after each analysis): only fields that are
 * currently blank are filled — a manual edit is never silently replaced.
 * overwrite = true (manual "Update from Latest Resume" click): resume-derived
 * fields are replaced, since the user explicitly asked for the refresh.
 */
function applyExtracted(
  base: UserProfile,
  extracted: ExtractedProfileData,
  overwrite: boolean
): { profile: UserProfile; changedFields: string[] } {
  const next: UserProfile = {
    ...base,
    skills: [...base.skills],
    interests: [...base.interests],
    projects: [...base.projects]
  };
  const changedFields: string[] = [];

  const textFields = ['name', 'targetRole', 'careerLevel', 'education'] as const;
  for (const field of textFields) {
    const incoming = extracted[field];
    if (!incoming) continue;
    const shouldApply = overwrite ? next[field] !== incoming : isBlank(next[field]);
    if (shouldApply) {
      next[field] = incoming;
      changedFields.push(field);
    }
  }

  const listFields = ['skills', 'projects'] as const;
  for (const field of listFields) {
    const incoming = extracted[field];
    if (incoming.length === 0) continue;
    const shouldApply = overwrite ? !arraysEqual(next[field], incoming) : next[field].length === 0;
    if (shouldApply) {
      next[field] = incoming;
      changedFields.push(field);
    }
  }

  return { profile: next, changedFields };
}

function parseStoredProfile(data: string | null): UserProfile {
  if (!data) return emptyProfile();
  try {
    const parsed = JSON.parse(data) as Partial<UserProfile>;
    return {
      ...emptyProfile(),
      ...parsed,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      interests: Array.isArray(parsed.interests) ? parsed.interests : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : []
    };
  } catch {
    return emptyProfile();
  }
}

export const profileService = {
  getProfile(): UserProfile {
    return parseStoredProfile(localStorage.getItem(PROFILE_KEY));
  },

  saveProfile(profile: UserProfile): void {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  },

  /**
   * Automatic population after a resume analysis (Phase 2). Fill-only-blank
   * policy; runs at most once per resumeId so cleared fields stay cleared
   * until a genuinely new resume is analyzed.
   */
  autoPopulateFromResume(resume: Resume, analysis: ResumeAnalysis | null | undefined): { profile: UserProfile; changedFields: string[] } | null {
    if (localStorage.getItem(AUTOFILL_LAST_RESUME_KEY) === resume.id) return null;
    localStorage.setItem(AUTOFILL_LAST_RESUME_KEY, resume.id);

    const { profile, changedFields } = applyExtracted(this.getProfile(), extractProfileData(resume, analysis), false);
    if (changedFields.length > 0) {
      this.saveProfile(profile);
    }
    return { profile, changedFields };
  },

  /**
   * Manual sync (explicit button click). Overwrites resume-derived fields
   * with the latest analyzed resume's data; never touches `interests`.
   */
  async syncFromLatestResume(): Promise<{ profile: UserProfile; changedFields: string[]; resume: Resume } | null> {
    const resumes = await resumeService.getResumes();
    if (resumes.length === 0) return null;
    const latest = resumes[0];
    const analysis = await resumeService.getAnalysis(latest.id);

    const { profile, changedFields } = applyExtracted(this.getProfile(), extractProfileData(latest, analysis), true);
    if (changedFields.length > 0) {
      this.saveProfile(profile);
      // Re-arm automatic population: the next new resume should fill blanks again.
      localStorage.setItem(AUTOFILL_LAST_RESUME_KEY, latest.id);
    }
    return { profile, changedFields, resume: latest };
  }
};
