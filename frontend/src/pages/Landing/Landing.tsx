import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, MessagesSquare, Compass, ShieldAlert, Sparkles, ArrowRight, Mail } from 'lucide-react';
import logo from '../../assets/logo.jpg';
import styles from './Landing.module.css';
import { Button } from '../../components/ui/Button';
import { NetworkDiagram } from '../../components/ui/NetworkDiagram';

export const Landing: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Set warm background color on html and body for Landing page to prevent gray seams
    document.documentElement.style.backgroundColor = '#F5F1E9';
    document.body.style.backgroundColor = '#F5F1E9';

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealed);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const targets = document.querySelectorAll(`.${styles.reveal}`);
    targets.forEach((t) => observer.observe(t));

    return () => {
      observer.disconnect();
      // Clean up body and root background style to restore internal cool grey background
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, []);

  const features = [
    {
      icon: FileText,
      title: 'Resume Assessment',
      desc: 'Understand how screening tools read your resume. Get granular feedback on grammar, readability, formatting, and key developer bullet impact.'
    },
    {
      icon: MessagesSquare,
      title: 'Simulated Interviews',
      desc: 'Interactive chat practice across Technical, HR, and Resume-Based questions. Get direct scoring on communications, accuracy, and confidence.'
    },
    {
      icon: Compass,
      title: 'Targeted Job Matching',
      desc: 'Paste a specific Job Description and compare it line-by-line with your current qualifications. Instantly highlight matching strengths and missing skills.'
    },
    {
      icon: Sparkles,
      title: 'Career Roadmap Planner',
      desc: 'Turn missing skill gaps into month-by-month actionable learning timelines, pointing you directly to what concepts to master and build next.'
    }
  ];

  const steps = [
    { num: '01', title: 'Upload Resume', desc: 'Provide your details and upload your PDF resume.' },
    { num: '02', title: 'Audit Gaps', desc: 'Scan metrics against target roles or job descriptions.' },
    { num: '03', title: 'Simulate Interviews', desc: 'Practice talking points in realistic conversational loops.' },
    { num: '04', title: 'Apply Edits', desc: 'Refine your credentials and build missing technical projects.' }
  ];

  return (
    <div className={styles.container}>
      {/* Top Navbar */}
      <header className={styles.navbar}>
        <div className={styles.brand}>
          <div className={styles.logoContainer}>
            <img src={logo} className={styles.logo} alt="Nexora Logo" />
          </div>
          <span className={styles.wordmark}>NEXORA</span>
        </div>
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          Dashboard
        </Button>
      </header>

      {/* Hero Section */}
      <section className={styles.heroGrid}>
        <div className={styles.heroLeft}>
          <h2 className={styles.tagline}>See your potential. Shape your future.</h2>
          <p className={styles.heroSubtitle}>
            An honest, local-first career intelligence assistant. Assess resume weak spots, practice conversational interviews, audit role gaps, and build a clearer technical direction. No cloud sign-ups, no data leaks.
          </p>
          <div className={styles.ctaGroup}>
            <Button variant="primary" className={styles.heroCta} onClick={() => navigate('/resume-analysis')}>
              Analyze my resume
              <ArrowRight size={16} className={styles.ctaIcon} />
            </Button>
            <Button variant="secondary" className={styles.heroSec} onClick={() => navigate('/dashboard')}>
              Explore dashboard
            </Button>
          </div>
        </div>

        <div className={styles.heroRight}>
          <NetworkDiagram variant="radial" className={styles.heroDiagram} />
        </div>
      </section>

      {/* New Section: Your Career, Reflected */}
      <section className={`${styles.reflectedSection} ${styles.reveal}`}>
        <div className={styles.reflectedHeader}>
          <span className={styles.reflectedLabel}>YOUR CAREER, REFLECTED.</span>
          <h3 className={styles.reflectedHeadline}>
            A continuous audit of your capabilities and market fit.
          </h3>
        </div>
        <div className={styles.reflectedDiagramContainer}>
          <NetworkDiagram variant="flow" className={styles.flowDiagram} />
        </div>
      </section>

      {/* Honest Capability Stats Strip */}
      <div className={`${styles.statsStrip} ${styles.reveal}`}>
        <div className={styles.statItem}>
          <span className={styles.statNumberText}>3</span>
          <span className={styles.capabilityLabelText}>Interview Modes (HR, Tech, Resume)</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNumberText}>5</span>
          <span className={styles.capabilityLabelText}>Resume Dimensions Scored</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNumberText}>100%</span>
          <span className={styles.capabilityLabelText}>Local — Private & Secure</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNumberText}>0</span>
          <span className={styles.capabilityLabelText}>Signups Required</span>
        </div>
      </div>

      {/* Feature Grid Section */}
      <section className={`${styles.featuresSection} ${styles.reveal}`}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Everything you need to level up</h3>
          <p className={styles.sectionSubtitle}>A lightweight, unified dashboard covering your entire resume edit and mock interview loop.</p>
        </div>
        
        <div className={styles.featuresGrid}>
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className={styles.featureCard}>
                <div className={styles.featureIconContainer}>
                  <Icon className={styles.featureIcon} size={24} />
                </div>
                <h4 className={styles.featureTitle}>{f.title}</h4>
                <p className={styles.featureDesc}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works section */}
      <section className={`${styles.stepsSection} ${styles.reveal}`}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>How it works</h3>
          <p className={styles.sectionSubtitle}>A simple, iterative loop to clean up formatting and test talking points.</p>
        </div>

        <div className={styles.stepsStrip}>
          {steps.map((s, i) => (
            <div key={i} className={styles.stepItem}>
              <span className={styles.stepNum}>{s.num}</span>
              <h4 className={styles.stepTitle}>{s.title}</h4>
              <p className={styles.stepDesc}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>



      {/* Final CTA Section */}
      <section className={`${styles.finalCtaSection} ${styles.reveal}`}>
        <div className={styles.finalCtaContent}>
          <h3 className={styles.finalCtaHeadline}>Ready to see your direction?</h3>
          <p className={styles.finalCtaSub}>No cloud accounts. No tracking. Just instant, local career intelligence.</p>
          <Button variant="primary" className={styles.finalCtaBtn} onClick={() => navigate('/resume-analysis')}>
            Start Local Assessment
            <ArrowRight size={16} className={styles.btnIcon} />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className={`${styles.footer} ${styles.reveal}`}>
        <div className={styles.footerGrid}>
          <div className={styles.footerLeft}>
            <div className={styles.footerBrand}>
              <div className={styles.footerLogoContainer}>
                <img src={logo} className={styles.footerLogo} alt="Nexora Logo" />
              </div>
              <span className={styles.footerWordmark}>NEXORA</span>
            </div>
            <p className={styles.footerTagline}>See your potential. Shape your future.</p>
          </div>
          
          <div className={styles.footerRight}>
            <span className={styles.connectHeading}>Built solo by Umama</span>
            <div className={styles.socialLinks}>
              <a href="mailto:byteum.dev@gmail.com" className={styles.socialLink} aria-label="Mail" target="_blank" rel="noopener noreferrer">
                <Mail size={18} />
              </a>
              <a href="https://www.linkedin.com/in/umama-ume-amen-6916ab374?utm_source=share_via&utm_content=profile&utm_medium=member_android" className={styles.socialLink} aria-label="LinkedIn" target="_blank" rel="noopener noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>
              </a>
              <a href="https://www.instagram.com/byteum.dev_?igsi=NmJhZXZma21nMWM3" className={styles.socialLink} aria-label="Instagram" target="_blank" rel="noopener noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
              </a>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p>© {new Date().getFullYear()} Nexora — a local-first career intelligence tool.</p>
        </div>
      </footer>
    </div>
  );
};
export default Landing;
