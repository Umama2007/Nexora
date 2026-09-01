import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../../components/layout/Sidebar';
import Topbar from '../../components/layout/Topbar';
import styles from './AppLayout.module.css';

export const AppLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className={styles.layout}>
      {/* Sidebar - fixed on desktop, slide drawer on mobile */}
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      {/* Main viewport area */}
      <div className={styles.mainWrapper}>
        <Topbar onMenuClick={toggleSidebar} />
        
        <main className={styles.content}>
          <div className={styles.pageContainer}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
export default AppLayout;
