import React from 'react';
import { Card } from './Card';
import { Badge } from './Badge';
import styles from './ScoreCard.module.css';

interface ScoreCardProps {
  score: number;
  maxScore?: number;
  label: string;
  subLabel?: string;
  statusText?: string;
  statusVariant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const ScoreCard: React.FC<ScoreCardProps> = ({
  score,
  maxScore = 100,
  label,
  subLabel,
  statusText,
  statusVariant = 'primary'
}) => {
  return (
    <Card className={styles.scoreCard}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {statusText && (
          <Badge variant={statusVariant}>{statusText}</Badge>
        )}
      </div>
      <div className={styles.number}>
        {score}
        <span className={styles.slash}>/{maxScore}</span>
      </div>
      {subLabel && (
        <span className={styles.subLabel} title={subLabel}>
          {subLabel}
        </span>
      )}
    </Card>
  );
};
