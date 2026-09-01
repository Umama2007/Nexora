import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileSearch,
  History,
  MessagesSquare,
  Target,
  Compass,
  Sparkles,
  User,
  X
} from 'lucide-react';
import logo from '../../assets/logo.jpg';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const navGroups = [
    {
      label: 'Overview',
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }
      ]
    },
    {
      label: 'ANALYZE',
      items: [
        { path: '/resume-analysis', label: 'Resume Analysis', icon: FileSearch },
        { path: '/analysis-history', label: 'Analysis History', icon: History }
      ]
    },
    {
      label: 'INTERVIEW',
      items: [
        { path: '/interview', label: 'Mock Interview', icon: MessagesSquare }
      ]
    },
    {
      label: 'CAREER',
      items: [
        { path: '/job-match', label: 'Job Match', icon: Target },
        { path: '/roadmap', label: 'Roadmap', icon: Compass },
        { path: '/recommendations', label: 'Recommendations', icon: Sparkles }
      ]
    },
    {
      label: 'PERSONAL',
      items: [
        { path: '/profile', label: 'Profile', icon: User }
      ]
    }
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && <div className={styles.overlay} onClick={onClose} />}

      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
        {/* Sidebar Header */}
        <div className={styles.header}>
          <NavLink to="/dashboard" className={styles.brand} onClick={onClose}>
            <div className={styles.logoContainer}>
              <img src={logo} className={styles.logo} alt="Nexora Logo" />
            </div>
            <span className={styles.wordmark}>NEXORA</span>
          </NavLink>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className={styles.nav}>
          {navGroups.map((group, index) => (
            <div key={index} className={styles.group}>
              <span className={styles.groupLabel}>{group.label}</span>
              <ul className={styles.list}>
                {group.items.map((item, itemIndex) => {
                  const Icon = item.icon;
                  return (
                    <li key={itemIndex}>
                      <NavLink
                        to={item.path}
                        className={({ isActive }) =>
                          `${styles.link} ${isActive ? styles.active : ''}`
                        }
                        onClick={onClose}
                      >
                        <Icon size={18} className={styles.icon} />
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
};
export default Sidebar;
