import React from 'react';
import styles from './RadialScore.module.css';

interface RadialScoreProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

export const RadialScore: React.FC<RadialScoreProps> = ({
  score,
  size = 140,
  strokeWidth = 8
}) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  // Determine track color class based on score
  let strokeColorClass = styles.success;
  if (score < 50) {
    strokeColorClass = styles.error;
  } else if (score < 80) {
    strokeColorClass = styles.warning;
  }

  return (
    <div className={styles.container} style={{ width: size, height: size }}>
      <svg className={styles.svg} viewBox="0 0 100 100">
        {/* Background Circle */}
        <circle
          className={styles.bgCircle}
          cx="50"
          cy="50"
          r={radius}
          strokeWidth={strokeWidth}
        />
        {/* Animated Active Score Circle */}
        <circle
          className={`${styles.activeCircle} ${strokeColorClass}`}
          cx="50"
          cy="50"
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      {/* Centered Score Text Overlay */}
      <div className={styles.textOverlay}>
        <span className={styles.score}>{score}</span>
        <span className={styles.label}>/ 100</span>
      </div>
    </div>
  );
};
