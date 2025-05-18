// src/hooks/useErrorHandler.ts
import { useState, useCallback } from 'react';

type ErrorSeverity = 'info' | 'warning' | 'error';

interface ErrorState {
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
}

export const useErrorHandler = () => {
  const [errors, setErrors] = useState<ErrorState[]>([]);
  
  const addError = useCallback((message: string, severity: ErrorSeverity = 'error') => {
    setErrors(prev => [
      ...prev, 
      { message, severity, timestamp: Date.now() }
    ].slice(-5)); // Keep only the 5 most recent errors
  }, []);
  
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);
  
  const dismissError = useCallback((timestamp: number) => {
    setErrors(prev => prev.filter(error => error.timestamp !== timestamp));
  }, []);
  
  return {
    errors,
    addError,
    clearErrors,
    dismissError
  };
};