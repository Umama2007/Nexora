"""Truth Guard Step 1 (FR-6): local, deterministic resume fact extraction.

This module is deliberately LLM-free — extraction runs on plain resume text
so the upload pipeline keeps exactly one unified analysis request while the
frontend Profile page still receives the complete five-key fact shape:

    {"name": str, "education": str, "skills": [...], "tools": [...], "projects": [...]}

Unknown fields stay empty rather than guessed (never fake data).
"""

from typing import Dict, Any, List, Optional, Tuple
import re

from app.core.grounding import TECH_TERMS, DISPLAY_NAMES

# Short words that are real technology names but also common English words.
# They only count as skills when they appear inside an explicit Skills section.
AMBIGUOUS_TERMS = {"go", "r", "c", "qt", "ruby", "swift"}

# Matched TECH_TERMS that read better under "tools" than "skills" (VCS, CI,
# containers, collaboration platforms) — mirrors the old extraction contract.
# Every consumer (Profile page, Dashboard, grounding, tailor, interviews)
# reads or merges both keys, so the split is purely cosmetic.
TOOL_TERMS = {
    "git", "github", "gitlab", "bitbucket",
    "docker", "kubernetes", "terraform", "ansible", "helm", "vagrant",
    "jenkins", "circleci", "github actions", "gitlab ci",
    "jira", "confluence", "postman",
}

MAX_PROJECTS = 8


def _get_display_name(term: str) -> str:
    if term in DISPLAY_NAMES:
        return DISPLAY_NAMES[term]
    if len(term) <= 4 and term.isalpha():
        return term.upper()
    if ' ' in term:
        return term.title()
    return term.title()


# ---------------------------------------------------------------------------
# Line helpers
# ---------------------------------------------------------------------------

# Bullets: glyphs, dashes followed by a space, or 1. / 1) / a. numbering.
_BULLET_PREFIX = re.compile(
    r"^\s*(?:[\u2022\u25aa\u25cf\u25e6\u2023\u00b7*]|[-\u2013\u2014]\s|\d{1,2}[.)]\s+|[a-z][.)]\s+)"
)


def _is_bullet(line: str) -> bool:
    return bool(_BULLET_PREFIX.match(line))


def _strip_bullet(line: str) -> str:
    """Removes the bullet/numbering marker and collapses whitespace."""
    s = _BULLET_PREFIX.sub("", line, count=1)
    return re.sub(r"\s{2,}", " ", s).strip()


def _normalize(line: str) -> str:
    """Normalizes a line for heading detection (bullets, numbering, colons)."""
    s = line.strip()
    s = re.sub(r"^[\s\u2022\u25aa\u25cf\u25e6\u2023\u00b7*\-\u2013\u2014]+", "", s)
    s = re.sub(r"^(?:\d{1,2}|[a-z])[.)]\s+", "", s)
    s = s.strip("*_# \t")
    s = re.sub(r"[:\uff1a]\s*$", "", s)
    return re.sub(r"\s{2,}", " ", s)


# ---------------------------------------------------------------------------
# Section headings
# ---------------------------------------------------------------------------

_SKILLS_HEADER = re.compile(
    r"^(?:technical|core|key|relevant|professional|personal|main|computer)?\s*"
    r"(?:skills?|technologies|competencies|tech\s*stack)"
    r"(?:\s*(?:&|and|/)\s*(?:tools|technologies|abilities|expertise|summary|highlights|interests))?$"
)
_PROJECTS_HEADER = re.compile(
    r"^(?:(?:selected|academic|personal|notable|key|relevant|major|team|individual)\s+)?"
    r"projects?$|^portfolio$"
)
_EDUCATION_HEADER = re.compile(
    r"^(?:education|academics?|academic\s+(?:background|qualifications?|history)|"
    r"educational\s+(?:background|qualifications?)|qualifications?|certifications?|"
    r"certificates?|university|college|degree)"
    r"(?:\s*(?:&|and|/)\s*(?:training|certifications?|courses?))?$"
)
_EXPERIENCE_HEADER = re.compile(
    r"^(?:(?:work|professional|employment|relevant|industry|internship)\s+)?experience$|"
    r"^employment(?:\s+history)?$|^work\s+history$|^internships?$"
)
# Recognized headings that carry no extractable facts — they simply close the
# currently open section so content never leaks across section boundaries.
_OTHER_HEADER = re.compile(
    r"^(?:professional\s+summary|executive\s+summary|summary|objective|career\s+objective|"
    r"profile|personal\s+profile|about(?:\s+me)?|achievements?|awards?|honors?|"
    r"leadership(?:\s*&\s*activities)?|activities|extracurricular(?:\s+activities)?|"
    r"volunteering|volunteer\s+experience|community(?:\s+service)?|publications?|"
    r"languages?|references?|interests?|hobbies|coursework|relevant\s+coursework|"
    r"additional\s+information|personal\s+details|contact(?:\s+information)?|declaration)$"
)
# Generic document titles that may sit ABOVE the candidate's name.
_GENERIC_TITLE = re.compile(r"^(?:curriculum\s*vitae|resume|cv)$")


def _match_header(norm_lower: str) -> Optional[str]:
    """Maps a normalized lowercase line to a section key (or None)."""
    if _SKILLS_HEADER.match(norm_lower):
        return "skills"
    if _PROJECTS_HEADER.match(norm_lower):
        return "projects"
    if _EDUCATION_HEADER.match(norm_lower):
        return "education"
    if _EXPERIENCE_HEADER.match(norm_lower):
        return "experience"
    if _OTHER_HEADER.match(norm_lower) or _GENERIC_TITLE.match(norm_lower):
        return "other"
    return None


def _scan_sections(lines: List[str]) -> List[Tuple[str, str, Optional[str], bool]]:
    """One pass over the resume lines.

    Returns (raw, normalized, section, is_header) tuples. `section` is the
    section a CONTENT line belongs to (None before the first heading);
    heading lines themselves are flagged and skipped by every extractor.
    """
    entries: List[Tuple[str, str, Optional[str], bool]] = []
    current: Optional[str] = None
    for raw in lines:
        if not raw.strip():
            continue
        norm = _normalize(raw)
        if not norm:
            continue
        header = _match_header(norm.lower())
        if header is not None:
            # "other" headings close the current section; factual headings
            # switch to it (certifications keep feeding education by design).
            current = None if header == "other" else header
            entries.append((raw.strip(), norm, header, True))
            continue
        entries.append((raw.strip(), norm, current, False))
    return entries


# ---------------------------------------------------------------------------
# Name
# ---------------------------------------------------------------------------

_NAME_LABEL = re.compile(r"^\s*(?:full\s+name|name)\s*[:\-\u2013\u2014]\s*(.+)$", re.IGNORECASE)
# "Umama Amen | Software Engineer" / "Umama Amen \u2013 Engineer" style headers.
_NAME_SPLIT = re.compile(r"\s*[|\u2022\u00b7]\s*|\s+[\u2013\u2014]\s+")
_NAME_TOKEN = re.compile(r"^[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff]+(?:[.'\u2019\-][A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff]+)*[.,]?$")

# Tokens that mark a line as a ROLE/TITLE line, never a person's name.
_ROLE_ANYWHERE = {
    "engineer", "developer", "programmer", "analyst", "designer", "architect",
    "manager", "scientist", "specialist", "consultant", "intern", "associate",
    "administrator", "technician", "researcher", "assistant", "aspiring",
    "aspirant", "senior", "junior", "fresher", "graduate", "student",
    "candidate", "lead", "head", "director", "officer", "founder",
    "entrepreneur", "freelancer", "freelance", "volunteer", "teacher", "tutor",
    "lecturer", "professor", "accountant", "trainer",
}
# Role-ish words that only disqualify when they START the line ("AI Engineer"
# is a role; "Umama Ai" is a name).
_ROLE_FIRST = _ROLE_ANYWHERE | {
    "ai", "ml", "web", "qa", "dev", "data", "software", "machine", "learning",
    "product", "cloud", "system", "systems", "business", "technical", "creative",
    "digital", "marketing", "sales", "operations", "fullstack", "full-stack",
    "frontend", "backend", "java", "python", "php", "sap", "hr",
}
# Company suffixes ("TechCorp Inc." is an employer, not a person).
_COMPANY_TOKENS = {"inc", "ltd", "llc", "corp", "corporation", "co", "gmbh", "pvt", "pte", "limited", "plc", "llp"}
_DEGREE_FIRST = {
    "bachelor", "bachelors", "master", "masters", "bsc", "msc", "bba", "mba",
    "phd", "btech", "mtech", "be", "me", "ba", "ma", "bs", "ms", "diploma",
    "doctorate", "undergraduate", "postgraduate", "ca", "cpa",
}
_GENERIC_NAME_WORDS = {
    "resume", "curriculum", "vitae", "profile", "summary", "objective",
    "portfolio", "contact", "references", "declaration", "email", "phone",
    "address", "mobile", "linkedin", "github",
}
_CONTACT_HINT = re.compile(r"\b(?:http|www|linkedin|github|gitlab|tel|phone|email|mail)\b", re.IGNORECASE)


def _plausible_name(line: str) -> Optional[str]:
    """Returns the cleaned candidate name from one line, or None."""
    tokens = line.split()
    if not 2 <= len(tokens) <= 5:
        return None
    if len(line) > 48:
        return None
    # Personal names are capitalized in resumes ("Umama Amen", "UMAMA AMEN",
    # "Dr. Jane Smith"); lowercase phrases are summary/label noise.
    if not tokens[0][0].isupper():
        return None
    lowered = [t.strip(".,'\u2019-").lower() for t in tokens]
    if lowered[0] in _ROLE_FIRST or lowered[0] in _DEGREE_FIRST:
        return None
    if any(t in _ROLE_ANYWHERE or t in _COMPANY_TOKENS or t in _GENERIC_NAME_WORDS for t in lowered):
        return None
    for t in tokens:
        if not _NAME_TOKEN.match(t) or len(t) > 25:
            return None
    return re.sub(r"\s{2,}", " ", line).strip()


def _name_from_segment(segment: str) -> Optional[str]:
    """Checks one 'Name | Title' segment against every contact/role filter."""
    seg = segment.strip()
    if not seg:
        return None
    if any(ch in seg for ch in "@+/") or any(ch.isdigit() for ch in seg):
        return None
    if ":" in seg or _CONTACT_HINT.search(seg):
        return None
    return _plausible_name(seg)


def _extract_name(entries: List[Tuple[str, str, Optional[str], bool]]) -> str:
    # 1) Explicit "Name: Umama Amen" labels near the top.
    for raw, _norm, _section, _is_header in entries[:20]:
        m = _NAME_LABEL.match(raw)
        if m:
            candidate = _name_from_segment(m.group(1))
            if candidate:
                return candidate

    # 2) The first plausible personal-name line before any real section
    #    heading. "CURRICULUM VITAE" may sit above the name; any other
    #    heading means the header block is over.
    for raw, norm, _section, is_header in entries[:20]:
        if is_header:
            if _GENERIC_TITLE.match(norm.lower()):
                continue
            break
        # "Umama Amen | Software Engineer" — evaluate each segment alone.
        segments = _NAME_SPLIT.split(raw) if _NAME_SPLIT.search(raw) else [raw]
        for segment in segments:
            candidate = _name_from_segment(segment)
            if candidate:
                return candidate
    return ""


# ---------------------------------------------------------------------------
# Education
# ---------------------------------------------------------------------------

_DATE_ONLY = re.compile(
    r"^\d{4}(?:\s*[\u2013\u2014/-]\s*(?:\d{4}|present|ongoing|current))?$"
    r"|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|summer|fall|spring|winter)"
    r"[a-z]*\.?\s+'?\d{2,4}"
    r"(?:\s*[\u2013\u2014/-]\s*(?:[a-z]*\.?\s+'?\d{2,4}|present|ongoing|current))?$",
    re.IGNORECASE,
)


def _is_date_only(text: str) -> bool:
    return bool(_DATE_ONLY.match(text.strip()))


def _extract_education(entries: List[Tuple[str, str, Optional[str], bool]]) -> str:
    """First one or two meaningful lines under an education-style heading
    (Education, Academic Background, Qualifications, Certifications,
    University, College, Degree ...)."""
    edu: List[str] = []
    for raw, _norm, section, is_header in entries:
        if is_header or section != "education":
            continue
        if len(edu) >= 2:
            break
        clean = _strip_bullet(raw)
        lower = clean.lower()
        if not 5 <= len(clean) <= 90:
            continue
        if _is_date_only(clean):
            continue
        if any(w in lower for w in ("gpa", "cgpa", "coursework", "@", "http", "www", "linkedin", "github")):
            continue
        edu.append(clean)
    return " | ".join(edu)


# ---------------------------------------------------------------------------
# Skills & tools
# ---------------------------------------------------------------------------

def _extract_skills_tools(resume_text: str, entries: List[Tuple[str, str, Optional[str], bool]]) -> Tuple[List[str], List[str]]:
    """Case-insensitive TECH_TERMS matching over the whole resume; ambiguous
    short words (go, r, c, swift, ruby, qt) only count inside an explicit
    Skills/Technical Skills section."""
    text_lower = resume_text.lower()
    skills_section_text = " ".join(
        norm.lower() for _raw, norm, section, is_header in entries
        if not is_header and section == "skills"
    )

    skills: set = set()
    tools: set = set()
    for term in TECH_TERMS:
        # Trailing digits are allowed (html5, css3, react18) but a trailing
        # letter is not ("javascript" must never count as "java").
        pattern = r"(?<![a-z0-9])" + re.escape(term) + r"(?![a-z])"
        haystack = skills_section_text if term in AMBIGUOUS_TERMS else text_lower
        if not haystack:
            continue
        if re.search(pattern, haystack):
            (tools if term in TOOL_TERMS else skills).add(_get_display_name(term))

    # "c" and "r" are real language names but too short for the shared
    # TECH_TERMS lexicon (the grounding check scans it, and a bare "c" would
    # false-flag generated "C++" content). They only count inside an
    # explicit Skills section, and "C" is never pulled out of "C++"/"C#"/
    # "Objective-C" mentions.
    for term, pattern in (("c", r"(?<![a-z0-9+\-])c(?![a-z+#])"), ("r", r"(?<![a-z0-9])r(?![a-z])")):
        if re.search(pattern, skills_section_text):
            skills.add(_get_display_name(term))

    return sorted(skills), sorted(tools)


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

_ACTION_VERBS = (
    "developed", "built", "designed", "created", "led", "managed", "implemented",
    "architected", "engineered", "integrated", "deployed", "launched", "wrote",
    "authored", "delivered", "optimized", "migrated", "automated", "researched",
    "prototyped", "maintained", "collaborated", "presented", "organized", "taught",
    "shipped", "scaled", "refactored", "tested", "analyzed", "improved", "reduced",
    "increased", "founded", "volunteered", "worked", "assisted", "participated",
    "contributed", "used", "leveraged", "modeled", "simulated", "mentored",
    "published", "supported", "configured", "established", "spearheaded",
)

# "Personal Project | 2025" / "Team Project (C++ OOP) | 2025" — metadata, not titles.
_PROJECT_META_PREFIX = re.compile(
    r"^(?:personal|team|academic|individual|group|client|freelance|semester|"
    r"course|class|capstone|graduation|school|college|university)\s+projects?\b"
)

# Label words: a colon-title or whole line made only of these is not a project.
_GENERIC_LABELS = {
    "technologies", "technology", "tech", "stack", "tools", "skills", "languages",
    "frameworks", "framework", "libraries", "database", "databases", "role", "team",
    "duration", "status", "link", "links", "github", "repo", "repository", "source",
    "project", "projects", "position", "company", "organization", "organisation",
    "client", "location", "date", "period", "overview", "description",
    "responsibilities", "achievements", "education", "experience", "name", "title",
    "platform", "platforms", "environment", "ongoing", "present", "current",
    "pending", "completed",
}


def _is_project_metadata(text: str) -> bool:
    """True for 'Personal Project | 2025' style sub-labels under project titles."""
    s = text.lower().strip()
    m = _PROJECT_META_PREFIX.match(s)
    if not m:
        return False
    rest = s[m.end():]
    rest = re.sub(r"\([^)]*\)", " ", rest)                              # "(C++ OOP)"
    rest = re.sub(r"\b(?:19|20)\d{2}\b", " ", rest)                     # years
    rest = re.sub(r"\b(?:present|ongoing|current)\b", " ", rest)
    rest = re.sub(r"[|:\u00b7,.\-/\u2013\u2014]+", " ", rest)
    return len(rest.split()) <= 1


def _is_generic_label(text: str) -> bool:
    """'Technologies', 'Tools & Platforms', 'Tech Stack' ... — label lines."""
    words = text.lower().strip(" .&").split()
    return bool(words) and len(words) <= 3 and all(w in _GENERIC_LABELS for w in words)


def _has_action_verb(lower: str) -> bool:
    words = lower.split()
    first = words[0] if words else ""
    if any(first.startswith(v) for v in _ACTION_VERBS):
        return True
    return any(re.search(rf"\b{v}\b", lower) for v in _ACTION_VERBS)


def _concise(text: str, limit: int = 90) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:\u2014\u2013-")
    return cut + "\u2026"


def _colon_title(clean: str) -> Optional[str]:
    """"E-commerce Platform: Built a full-stack app ..." -> "E-commerce Platform"."""
    if ":" not in clean:
        return None
    head, _, tail = clean.partition(":")
    title = head.strip()
    tail = tail.strip()
    if not tail or not 3 <= len(title) <= 45:
        return None
    if _is_generic_label(title):
        return None
    if title.lower().split()[0] in _ACTION_VERBS:
        return None
    if any(ch in title for ch in "@/"):
        return None
    # The tail must read like a description, not another name fragment.
    if not (_has_action_verb(tail.lower()) or len(tail) > 25):
        return None
    return title


def _extract_projects(entries: List[Tuple[str, str, Optional[str], bool]]) -> List[str]:
    """Project titles (preferred) and, as fallback, concise meaningful bullets
    from Projects/Portfolio sections, then from Experience/Internships."""
    titles: List[str] = []
    proj_bullets: List[str] = []
    exp_bullets: List[str] = []

    def remember(bucket: List[str], value: str) -> None:
        if value and value.lower() not in {v.lower() for v in bucket}:
            bucket.append(value)

    for raw, _norm, section, is_header in entries:
        if is_header or section not in ("projects", "experience"):
            continue
        clean = _strip_bullet(raw)
        if not clean:
            continue
        lower = clean.lower()
        if any(w in lower for w in ("@", "http", "www.", "linkedin", "github", "gitlab")):
            continue
        if _is_date_only(clean) or _is_project_metadata(clean):
            continue
        if _is_generic_label(clean):
            continue
        is_bullet = _is_bullet(raw)

        if section == "projects":
            # "Title: description" lines yield clean project names.
            colon_title = _colon_title(clean)
            if colon_title:
                remember(titles, colon_title)
                continue
            if is_bullet:
                if _has_action_verb(lower) and len(clean) > 20:
                    remember(proj_bullets, _concise(clean))
                elif 5 <= len(clean) <= 40 and "," not in clean and ":" not in clean:
                    # Bulleted short titles: "▪ Portfolio Website"
                    remember(titles, clean)
            else:
                # Standalone title: "SmartBuddy AI – PDF Summarizer & ..."
                if 5 <= len(clean) <= 80 and ":" not in clean and clean[0].isalpha():
                    remember(titles, clean)
        else:  # experience / internships — job titles and dates are not projects
            if is_bullet and _has_action_verb(lower) and len(clean) > 20:
                remember(exp_bullets, _concise(clean))

    # Prefer clean names; bullets only fill in when titles are scarce or absent.
    if len(titles) >= 3:
        combined = titles
    else:
        combined = titles + proj_bullets + exp_bullets
    return combined[:MAX_PROJECTS]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_truth_guard_facts(resume_text: str) -> Dict[str, Any]:
    """Runs Truth Guard Step 1 fully locally — no LLM, no network.

    Always returns the complete five-key fact shape the Profile page needs:
    name / education / skills / tools / projects. Fields that cannot be
    found stay empty rather than guessed.
    """
    lines = resume_text.split("\n")
    entries = _scan_sections(lines)

    name = _extract_name(entries)
    education = _extract_education(entries)
    skills, tools = _extract_skills_tools(resume_text, entries)
    projects = _extract_projects(entries)

    return {
        "name": name,
        "education": education,
        "skills": skills,
        "tools": tools,
        "projects": projects,
    }
