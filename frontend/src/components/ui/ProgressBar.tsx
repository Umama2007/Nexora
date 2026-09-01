import React from 'react';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  value: number;
  label?: string;
  subLabel?: string;
  size?: 'sm' | 'md';
  showValue?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  label,
  subLabel,
  size = 'md',
  showValue = true
}) => {
  // Determine color category based on score value
  let scoreClass = styles.success;
  if (value < 50) {
    scoreClass = styles.error;
  } else if (value < 80) {
    scoreClass = styles.warning;
  }

  const containerClass = `${styles.barContainer} ${size === 'sm' ? styles.sm : styles.md}`;

  return (
    <div className={styles.wrapper}>
      {label || showValue ? (
        <div className={styles.labels}>
          <div className={styles.leftLabel}>
            {label && <span className={styles.mainLabel}>{label}</span>}
            {subLabel && <span className={styles.subLabel}>{subLabel}</span>}
          </div>
          {showValue && <span className={styles.value}>{value}/100</span>}
        </div>
      ) : null}
      <div className={containerClass}>
        <div
          className={`${styles.fill} ${scoreClass}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
};
