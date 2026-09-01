import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import styles from './NotFound.module.css';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.iconWrapper}>
          <ShieldAlert className={styles.icon} size={36} />
        </div>
        <h2 className={styles.title}>404 — Page Not Found</h2>
        <p className={styles.message}>
          That page doesn't exist. Looks like you've taken a wrong turn on your career roadmap.
        </p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => navigate('/dashboard')} className={styles.btn}>
            Back to Dashboard
          </Button>
          <Button variant="ghost" onClick={() => navigate(-1)} className={styles.btn}>
            <ArrowLeft size={14} />
            Go Back
          </Button>
        </div>
      </Card>
    </div>
  );
};
export default NotFound;
