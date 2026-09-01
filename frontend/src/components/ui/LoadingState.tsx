import React from 'react';
import styles from './LoadingState.module.css';

interface LoadingStateProps {
  type?: 'dashboard' | 'analysis' | 'interview' | 'roadmap' | 'generic';
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  type = 'generic'
}) => {
  const renderDashboardSkeleton = () => (
    <div className={styles.grid}>
      {/* 4 Stat Cards */}
      {[1, 2, 3, 4].map(n => (
        <div key={n} className={styles.skeletonCard}>
          <div className={`${styles.skeletonText} ${styles.w40} ${styles.mb10}`} />
          <div className={`${styles.skeletonTitle} ${styles.w60}`} />
        </div>
      ))}
      {/* Main Section */}
      <div className={`${styles.skeletonCard} ${styles.colSpan2}`}>
        <div className={`${styles.skeletonTitle} ${styles.w30} ${styles.mb20}`} />
        {[1, 2, 3].map(n => (
          <div key={n} className={styles.row}>
            <div className={`${styles.skeletonText} ${styles.w20}`} />
            <div className={`${styles.skeletonBar} ${styles.w80}`} />
          </div>
        ))}
      </div>
      {/* Sidebar Health Section */}
      <div className={styles.skeletonCard}>
        <div className={`${styles.skeletonTitle} ${styles.w50} ${styles.mb20}`} />
        <div className={`${styles.skeletonCircle} ${styles.mb20}`} />
        <div className={`${styles.skeletonText} ${styles.w100}`} />
      </div>
    </div>
  );

  const renderAnalysisSkeleton = () => (
    <div className={styles.analysisContainer}>
      <div className={styles.headerRow}>
        <div className={styles.headerLeft}>
          <div className={`${styles.skeletonTitle} ${styles.w40} ${styles.mb10}`} />
          <div className={`${styles.skeletonText} ${styles.w20}`} />
        </div>
        <div className={styles.headerRight}>
          <div className={styles.scoreCircle} />
        </div>
      </div>
      <div className={styles.grid2}>
        <div className={styles.skeletonCard}>
          <div className={`${styles.skeletonTitle} ${styles.w40} ${styles.mb20}`} />
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} className={styles.barRow}>
              <div className={`${styles.skeletonText} ${styles.w30}`} />
              <div className={styles.barPlaceholder} />
            </div>
          ))}
        </div>
        <div className={styles.skeletonCard}>
          <div className={`${styles.skeletonTitle} ${styles.w50} ${styles.mb20}`} />
          <div className={`${styles.skeletonText} ${styles.w100} ${styles.mb10}`} />
          <div className={`${styles.skeletonText} ${styles.w90} ${styles.mb10}`} />
          <div className={`${styles.skeletonText} ${styles.w100}`} />
        </div>
      </div>
    </div>
  );

  const renderInterviewSkeleton = () => (
    <div className={styles.interviewContainer}>
      <div className={styles.chatHeader}>
        <div className={`${styles.skeletonTitle} ${styles.w20}`} />
        <div className={`${styles.skeletonText} ${styles.w10}`} />
      </div>
      <div className={styles.chatArea}>
        <div className={`${styles.chatBubble} ${styles.aiBubble}`}>
          <div className={`${styles.skeletonText} ${styles.w80}`} />
          <div className={`${styles.skeletonText} ${styles.w40} ${styles.mt5}`} />
        </div>
        <div className={`${styles.chatBubble} ${styles.userBubble}`}>
          <div className={`${styles.skeletonText} ${styles.w60}`} />
        </div>
        <div className={`${styles.chatBubble} ${styles.aiBubble}`}>
          <div className={`${styles.skeletonText} ${styles.w90}`} />
          <div className={`${styles.skeletonText} ${styles.w70} ${styles.mt5}`} />
        </div>
      </div>
      <div className={styles.chatInputPlaceholder}>
        <div className={styles.inputSkeleton} />
        <div className={styles.buttonSkeleton} />
      </div>
    </div>
  );

  const renderRoadmapSkeleton = () => (
    <div className={styles.roadmapContainer}>
      <div className={`${styles.skeletonTitle} ${styles.w30} ${styles.mb10}`} />
      <div className={`${styles.skeletonText} ${styles.w50} ${styles.mb30}`} />
      <div className={styles.timeline}>
        {[1, 2, 3].map(n => (
          <div key={n} className={styles.timelineItem}>
            <div className={styles.timelinePoint} />
            <div className={styles.timelineContent}>
              <div className={`${styles.skeletonTitle} ${styles.w40} ${styles.mb10}`} />
              <div className={`${styles.skeletonText} ${styles.w90} ${styles.mb5}`} />
              <div className={`${styles.skeletonText} ${styles.w80}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderGenericSkeleton = () => (
    <div className={styles.skeletonCard}>
      <div className={`${styles.skeletonTitle} ${styles.w50} ${styles.mb15}`} />
      <div className={`${styles.skeletonText} ${styles.w100} ${styles.mb10}`} />
      <div className={`${styles.skeletonText} ${styles.w90} ${styles.mb10}`} />
      <div className={`${styles.skeletonText} ${styles.w80}`} />
    </div>
  );

  switch (type) {
    case 'dashboard':
      return renderDashboardSkeleton();
    case 'analysis':
      return renderAnalysisSkeleton();
    case 'interview':
      return renderInterviewSkeleton();
    case 'roadmap':
      return renderRoadmapSkeleton();
    case 'generic':
    default:
      return renderGenericSkeleton();
  }
};
