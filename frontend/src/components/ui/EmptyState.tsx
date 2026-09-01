import React from 'react';
import { useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { Button } from './Button';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  iconName: keyof typeof Icons;
  title: string;
  description: string;
  actionText?: string;
  actionPath?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  iconName,
  title,
  description,
  actionText,
  actionPath,
  onAction
}) => {
  const navigate = useNavigate();
  const IconComponent = Icons[iconName] as React.ComponentType<{ className?: string, size?: number }>;

  const handleAction = () => {
    if (onAction) {
      onAction();
    } else if (actionPath) {
      navigate(actionPath);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        {IconComponent && <IconComponent className={styles.icon} size={32} />}
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {actionText && (actionPath || onAction) && (
        <Button variant="primary" onClick={handleAction} className={styles.btn}>
          {actionText}
        </Button>
      )}
    </div>
  );
};
