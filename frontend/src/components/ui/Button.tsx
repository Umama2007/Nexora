import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  isLoading = false,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  const buttonClass = [
    styles.btn,
    styles[variant],
    fullWidth ? styles.fullWidth : '',
    isLoading ? styles.loading : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={buttonClass}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className={styles.spinner} aria-hidden="true"></span>
      ) : null}
      <span className={isLoading ? styles.loadingText : ''}>{children}</span>
    </button>
  );
};
