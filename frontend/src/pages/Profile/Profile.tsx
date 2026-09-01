import React, { useState } from 'react';
import { User, RefreshCw, Award, GraduationCap, Compass, FolderKanban, Gauge, X, Plus, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { profileService } from '../../services/profileService';
import { UserProfile } from '../../types';
import styles from './Profile.module.css';

const CAREER_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'student', label: 'Student' },
  { value: 'recent grad', label: 'Recent Graduate' },
  { value: 'job seeker', label: 'Job Seeker' },
  { value: 'career switch', label: 'Career Switcher' }
];

type TagField = 'skills' | 'interests' | 'projects';

interface TagEditorProps {
  label: string;
  icon: React.ReactNode;
  items: string[];
  ghost?: boolean;
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}

/** Editable chip list — type a value and press Enter (or +) to add it. */
const TagEditor: React.FC<TagEditorProps> = ({ label, icon, items, ghost, placeholder, onAdd, onRemove }) => {
  const [input, setInput] = useState('');

  const commit = () => {
    if (input.trim()) {
      onAdd(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div className={styles.detailItem}>
      <span className={styles.detailIcon}>{icon}</span>
      <div className={styles.detailText}>
        <span className={styles.detailLabel}>{label}</span>
        {items.length > 0 ? (
          <div className={styles.tags}>
            {items.map((item) => (
              <span key={item} className={ghost ? styles.tagGhost : styles.tag}>
                {item}
                <button
                  type="button"
                  className={styles.tagRemove}
                  onClick={() => onRemove(item)}
                  aria-label={`Remove ${item}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className={styles.emptyHint}>Nothing added yet.</span>
        )}
        <div className={styles.tagAddRow}>
          <input
            type="text"
            className={styles.tagAddInput}
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button variant="ghost" className={styles.tagAddBtn} onClick={commit} aria-label={`Add to ${label}`}>
            <Plus size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export const Profile: React.FC = () => {
  // localStorage is synchronous, so the saved baseline and the editing draft
  // can be initialized directly (no loading state, no effect needed).
  const [profile, setProfile] = useState<UserProfile>(() => profileService.getProfile()); // saved baseline
  const [draft, setDraft] = useState<UserProfile>(() => profileService.getProfile());     // being edited
  const [justSaved, setJustSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(profile);

  const setField = <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
    setDraft((d) => (d ? { ...d, [field]: value } : d));
    setJustSaved(false);
  };

  const handleAddTag = (field: TagField, value: string) => {
    const v = value.trim();
    if (!v) return;
    setDraft((d) => {
      if (!d) return d;
      if (d[field].some((t) => t.toLowerCase() === v.toLowerCase())) return d;
      return { ...d, [field]: [...d[field], v] };
    });
    setJustSaved(false);
  };

  const handleRemoveTag = (field: TagField, value: string) => {
    setDraft((d) => (d ? { ...d, [field]: d[field].filter((t) => t !== value) } : d));
    setJustSaved(false);
  };

  const handleSave = () => {
    profileService.saveProfile(draft);
    setProfile(draft);
    setJustSaved(true);
    setSyncMsg(null);
  };

  const handleDiscard = () => {
    setDraft(profile);
    setJustSaved(false);
    setSyncMsg(null);
  };

  const handleSync = async () => {
    if (isDirty) {
      setSyncMsg({ ok: false, text: 'Save or discard your changes before syncing.' });
      return;
    }
    setIsSyncing(true);
    setSyncMsg(null);
    try {
      const result = await profileService.syncFromLatestResume();
      if (!result) {
        setSyncMsg({ ok: false, text: 'No uploaded resume found yet — upload and analyze one first.' });
      } else if (result.changedFields.length === 0) {
        setSyncMsg({ ok: true, text: `Profile already matches "${result.resume.filename}".` });
      } else {
        setProfile(result.profile);
        setDraft(result.profile);
        setSyncMsg({
          ok: true,
          text: `Updated ${result.changedFields.length} field${result.changedFields.length === 1 ? '' : 's'} from "${result.resume.filename}".`
        });
      }
    } catch {
      setSyncMsg({ ok: false, text: 'Could not reach the local backend to load your latest resume.' });
    } finally {
      setIsSyncing(false);
    }
  };

  // A stored careerLevel that predates the option list (or was typed by an
  // older flow) still needs to render as a selectable option.
  const careerValue = draft.careerLevel;
  const extraCareerOption =
    careerValue && !CAREER_OPTIONS.some((o) => o.value === careerValue)
      ? [{ value: careerValue, label: careerValue }]
      : [];

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>Your Profile</h2>
        <p>Career facts auto-filled from your resume analyses — every field is editable, and manual edits are never overwritten.</p>
      </div>

      <div className={styles.grid}>
        {/* Main Profile Form */}
        <Card className={styles.mainCard}>
          <div className={styles.avatarSection}>
            <div className={styles.avatar}>
              <User size={40} />
            </div>
            <div className={styles.avatarMeta}>
              <input
                type="text"
                className={styles.nameInput}
                placeholder="Your name"
                value={draft.name}
                onChange={(e) => setField('name', e.target.value)}
                aria-label="Name"
              />
              <input
                type="text"
                className={styles.roleInput}
                placeholder="Target role, e.g. Full Stack Engineer"
                value={draft.targetRole}
                onChange={(e) => setField('targetRole', e.target.value)}
                aria-label="Target role"
              />
            </div>
          </div>

          <div className={styles.detailsList}>
            {/* Career Level */}
            <div className={styles.detailItem}>
              <Gauge className={styles.detailIcon} size={18} />
              <div className={styles.detailText}>
                <span className={styles.detailLabel}>Career Level</span>
                <select
                  className={styles.fieldSelect}
                  value={draft.careerLevel}
                  onChange={(e) => setField('careerLevel', e.target.value)}
                  aria-label="Career level"
                >
                  {[...extraCareerOption, ...CAREER_OPTIONS].map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Education */}
            <div className={styles.detailItem}>
              <GraduationCap className={styles.detailIcon} size={18} />
              <div className={styles.detailText}>
                <span className={styles.detailLabel}>Education Credentials</span>
                <input
                  type="text"
                  className={styles.fieldInput}
                  placeholder="e.g. B.S. in Computer Science, State University"
                  value={draft.education}
                  onChange={(e) => setField('education', e.target.value)}
                  aria-label="Education"
                />
              </div>
            </div>

            {/* Core Skills */}
            <TagEditor
              label="Skills Logged"
              icon={<Award size={18} />}
              items={draft.skills}
              placeholder="Add a skill and press Enter, e.g. Python"
              onAdd={(v) => handleAddTag('skills', v)}
              onRemove={(v) => handleRemoveTag('skills', v)}
            />

            {/* Projects (extracted from resumes) */}
            <TagEditor
              label="Projects"
              icon={<FolderKanban size={18} />}
              items={draft.projects}
              placeholder="Add a project and press Enter"
              onAdd={(v) => handleAddTag('projects', v)}
              onRemove={(v) => handleRemoveTag('projects', v)}
            />

            {/* Career Interests */}
            <TagEditor
              label="Interests"
              icon={<Compass size={18} />}
              items={draft.interests}
              ghost
              placeholder="Add an interest and press Enter, e.g. Web Performance"
              onAdd={(v) => handleAddTag('interests', v)}
              onRemove={(v) => handleRemoveTag('interests', v)}
            />
          </div>

          {/* Save / Sync bar */}
          <div className={styles.footer}>
            <div className={styles.footerStatus}>
              {justSaved ? (
                <span className={styles.savedNote}>
                  <CheckCircle2 size={14} /> Profile saved
                </span>
              ) : isDirty ? (
                <span>Unsaved changes</span>
              ) : syncMsg ? (
                <span className={syncMsg.ok ? styles.savedNote : styles.errorNote}>{syncMsg.text}</span>
              ) : null}
            </div>
            <div className={styles.footerActions}>
              {isDirty && (
                <Button variant="ghost" onClick={handleDiscard}>
                  Discard
                </Button>
              )}
              <Button
                variant="secondary"
                className={styles.syncBtn}
                onClick={handleSync}
                disabled={isSyncing}
              >
                <RefreshCw className={`${styles.btnIcon} ${isSyncing ? styles.spin : ''}`} size={14} />
                {isSyncing ? 'Syncing Profile...' : 'Update from Latest Resume'}
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={!isDirty}>
                Save Changes
              </Button>
            </div>
          </div>
        </Card>

        {/* Local Scope FAQ Sidebar */}
        <Card title="Nexora System Architecture" className={styles.faqCard}>
          <div className={styles.faqList}>
            <div className={styles.faqItem}>
              <h4>Where is my data stored?</h4>
              <p>Resumes, analyses, and interview sessions live in a local SQLite database on this machine, served by the local backend. Your profile and UI preferences stay in your browser's localStorage. Nothing leaves your laptop.</p>
            </div>

            <div className={styles.faqItem}>
              <h4>How do I edit my profile?</h4>
              <p>Every field on this page is editable — type directly, add or remove skills and projects, then press Save Changes. After each resume analysis, fields that are still empty fill in automatically from the extracted facts; anything you have already filled in is left untouched.</p>
            </div>

            <div className={styles.faqItem}>
              <h4>Is my connection secure?</h4>
              <p>All processing — parsing, storage, and LLM inference — runs locally on this machine. No resume data is sent to any third-party service.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
export default Profile;
