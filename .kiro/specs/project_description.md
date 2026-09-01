# Nexora — Project Description

## The Problem

Fresh graduates and early-career job seekers face a specific, concrete problem: they don't know why their resume is being rejected. Most AI tools respond to this with encouragement — "your resume looks great!" — which is useless. Real recruiters apply a different standard: missing quantified impact, absent keywords for the target role, project descriptions that can't be defended under questioning. Candidates don't get that feedback, so they keep submitting the same resume and practicing for generic interviews while wondering why nothing is working.

## The Solution

Nexora is an AI career coach that applies the same standard a recruiter would. It analyzes your resume for ATS compatibility, identifies missing keywords against a specific job description you paste in, flags formatting issues that confuse automated screeners, and gives you a one-sentence shortlist verdict with a stated reason — not a score without context. It rewrites your resume bullets to better match a target role. It runs three modes of mock interview: behavioral HR questions, technical questions scoped strictly to your skill set, and a project audit mode where the interviewer picks specific entries from your resume and makes you defend them. After each session it scores your technical accuracy, communication, and confidence with concrete issue descriptions that reference what you actually said.

The differentiating design choice is **Truth Guard** — a three-step grounding system that ensures the AI never invents skills or claims the candidate doesn't actually have. Step 1 runs a dedicated extraction pass over the resume before any other LLM call, producing a structured fact list (skills, tools, projects). Step 2 injects those facts into every downstream prompt with an explicit constraint. Step 3 runs a deterministic post-generation scan: a regex check against a curated 100+ term technology lexicon that flags any generated skill claim absent from the extracted facts. This third step was validated with a deliberate hallucination injection test — prompting the model to include "GraphQL" and "MongoDB" in a tailored resume for a candidate who had neither — which the scanner caught correctly. The grounding guarantee is structural, not a prompt instruction.

## How Spec-Driven Development Shaped the Architecture

Working through requirements → design → tasks in sequence produced two architectural decisions that wouldn't have emerged from just writing code.

The requirements phase forced precision about what "fast" means on real hardware. Writing testable acceptance criteria against actual measured latency — "fast path completes in ~60–90 s on 8 GB RAM, CPU-only" — rather than aspirational targets exposed early that a single combined analysis prompt would keep users on a loading screen for three minutes. That requirement drove the fast/detailed pipeline split: the score, verdict, and missing keywords generate first at a 512-token cap and release the frontend immediately; the detailed feedback (summary, strengths, improvements) generates in the background at a 1,536-token cap while the user is already reading their results. The 1,536 cap itself came from the tasks phase, where an integration task surfaced that the earlier 1,024 limit caused truncated JSON on larger resumes.

The design phase forced a decision about the LLM backend before any integration code was written. Documenting the provider abstraction as a design requirement — identical `generate_completion` signature regardless of provider, validated at startup before any request is served — made the Gemini integration later a clean swap rather than a retrofit. It also surfaced the httpx SSL problem on Windows before it became a production issue: the design specified urllib as the transport layer for both providers, which resolved the handshake failures the google-genai SDK was causing.

The tasks phase made the ordering explicit: Truth Guard extraction runs once before both the fast and detailed paths, not redundantly in each, because the tasks checklist made it visible that both paths need the same facts and running extraction twice wastes ~30 seconds on CPU-only inference.

The result is a system that runs entirely offline on a standard laptop, switches to Gemini for cloud deployment via a single environment variable, and gives job seekers the honest, grounded, specific feedback that most tools deliberately withhold.
