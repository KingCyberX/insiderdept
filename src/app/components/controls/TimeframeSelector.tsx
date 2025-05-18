"use client";

import React from 'react';

type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

interface TimeframeSelectorProps {
  currentInterval: TimeInterval;
  onIntervalChange: (interval: TimeInterval) => void;
  showDeltaButton?: boolean;
  deltaEnabled?: boolean;
  onDeltaToggle?: () => void;
}

const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({
  currentInterval,
  onIntervalChange,
  showDeltaButton = false,
  deltaEnabled = false,
  onDeltaToggle = () => {}
}) => {
  const timeframes: TimeInterval[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
  
  // Removed the debug logging to avoid console pollution
  
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {timeframes.map((tf) => (
        <button
  key={tf}
  onClick={() => onIntervalChange(tf)}
  className={`px-3 py-2 rounded-md text-sm transition-colors ${
    currentInterval === tf
      ? 'bg-[#2962ff] text-white font-medium'
      : 'bg-[#1c2030] text-[#afb5c4] hover:bg-[#262b3c]'
  }`}
>
  {tf}
</button>
      ))}
      
      {/* Removed the debug indicator that was always visible */}
      
      {/* Delta Aggregation Button - only show if showDeltaButton is true */}
      {showDeltaButton && (
  <button
    onClick={onDeltaToggle}
    className={`px-3 py-1.5 rounded text-sm transition-colors ml-2 ${
      deltaEnabled
        ? 'bg-blue-600 text-white font-bold' // Make it stand out more when enabled
        : 'bg-[#1c2030] text-[#afb5c4] hover:bg-[#262b3c]'
    }`}
  >
    Δ {deltaEnabled ? 'ON' : 'OFF'}
  </button>
)}
    </div>
  );
};

export default TimeframeSelector;