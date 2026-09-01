import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Home, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import styles from './ErrorState.module.css';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry
}) => {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        <AlertCircle className={styles.icon} size={32} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        {onRetry && (
          <Button variant="primary" onClick={onRetry} className={styles.btn}>
            <RefreshCw size={14} className={styles.btnIcon} />
            Retry
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigate(-1)} className={styles.btn}>
          <ArrowLeft size={14} className={styles.btnIcon} />
          Go Back
        </Button>
        <Button variant="ghost" onClick={() => navigate('/dashboard')} className={styles.btn}>
          <Home size={14} className={styles.btnIcon} />
          Dashboard
        </Button>
      </div>
    </div>
  );
};
