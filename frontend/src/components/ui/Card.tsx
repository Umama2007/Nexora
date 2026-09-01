import React from 'react';
import styles from './Card.module.css';

interface CardProps {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  hoverable?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  title,
  extra,
  children,
  className = '',
  noPadding = false,
  hoverable = false,
  onClick
}) => {
  const cardClass = [
    styles.card,
    hoverable || onClick ? styles.hoverable : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass} onClick={onClick}>
      {title || extra ? (
        <div className={styles.header}>
          {title && typeof title === 'string' ? (
            <h3 className={styles.title}>{title}</h3>
          ) : (
            title
          )}
          {extra && <div className={styles.extra}>{extra}</div>}
        </div>
      ) : null}
      <div className={noPadding ? styles.bodyNoPadding : styles.body}>
        {children}
      </div>
    </div>
  );
};
