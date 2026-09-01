import React from 'react';
import { Menu } from 'lucide-react';
import { Button } from '../ui/Button';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './Topbar.module.css';

interface TopbarProps {
  onMenuClick: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine topbar page title based on active path
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Overview';
    if (path === '/resume-analysis') return 'Resume Analysis';
    if (path.startsWith('/analysis/')) {
      if (path.endsWith('/feedback')) return 'Detailed Feedback';
      return 'Analysis Results';
    }
    if (path === '/interview') return 'Mock Interview';
    if (path.startsWith('/interview/')) {
      if (path.endsWith('/feedback')) return 'Interview Feedback';
      return 'Interview Session';
    }
    if (path === '/job-match') return 'Job Match';
    if (path === '/roadmap') return 'Your Career Roadmap';
    if (path === '/recommendations') return 'Recommendations';
    if (path === '/analysis-history') return 'Analysis History';
    if (path === '/profile') return 'Profile';
    return '';
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <button
          className={styles.menuBtn}
          onClick={onMenuClick}
          aria-label="Open sidebar menu"
        >
          <Menu size={20} />
        </button>
        <h1 className={styles.title}>{getPageTitle()}</h1>
      </div>
      <div className={styles.right}>
        <div className={styles.avatar} onClick={() => navigate('/profile')}>
          AC
        </div>
      </div>
    </header>
  );
};
export default Topbar;
