"use client";

import React, { useMemo } from 'react';

interface Error {
  message: string;
  severity?: 'info' | 'warning' | 'error';
  timestamp?: number;
}

interface ErrorDisplayProps {
  errors: Error[];
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ errors }) => {
  // Use useMemo to generate unique keys only when errors change
  const errorsWithUniqueKeys = useMemo(() => {
    return errors.map((error, index) => ({
      ...error,
      uniqueKey: `error-${index}-${Math.random().toString(36).substring(2, 9)}`
    }));
  }, [errors]);
  
  if (errors.length === 0) return null;
  
  return (
    <div className="mx-4 mb-4">
      {errorsWithUniqueKeys.map((error) => (
        <div 
          key={error.uniqueKey}
          className={`mb-2 p-3 rounded-md text-sm ${
            error.severity === 'error' || !error.severity
              ? 'bg-[#331c1f] text-[#ff5370] border border-[#582a34]' 
              : error.severity === 'warning'
                ? 'bg-[#332a1c] text-[#ffaa33] border border-[#584a2a]'
                : 'bg-[#1c2733] text-[#33aaff] border border-[#2a3e58]'
          }`}
        >
          {error.message}
        </div>
      ))}
    </div>
  );
};

export default ErrorDisplay;