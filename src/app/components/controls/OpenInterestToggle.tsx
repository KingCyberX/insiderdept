import React from 'react';

interface OpenInterestToggleProps {
  isEnabled: boolean;
  onToggle: () => void;
  className?: string;
}

const OpenInterestToggle: React.FC<OpenInterestToggleProps> = ({ 
  isEnabled, 
  onToggle,
  className = ''
}) => {
  return (
    <div className={`flex items-center ${className}`}>
      <button
        onClick={onToggle}
        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
          isEnabled 
            ? 'bg-amber-500 hover:bg-amber-600 text-white' 
            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
        }`}
        title={isEnabled ? "Hide Open Interest" : "Show Open Interest"}
      >
        OI {isEnabled ? 'ON' : 'OFF'}
      </button>
    </div>
  );
};

export default OpenInterestToggle;