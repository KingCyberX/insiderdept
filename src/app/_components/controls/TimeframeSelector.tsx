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

  return (
    <>
      <div className="container">
        {timeframes.map((tf) => {
          const isActive = currentInterval === tf;
          return (
            <button
              key={tf}
              type="button"
              aria-pressed={isActive}
              onClick={() => onIntervalChange(tf)}
              className={`btn ${isActive ? 'active' : ''}`}
            >
              {tf}
            </button>
          );
        })}

        {showDeltaButton && (
          <button
            type="button"
            onClick={onDeltaToggle}
            className={`btn delta-btn ${deltaEnabled ? 'active' : ''}`}
            aria-pressed={deltaEnabled}
          >
            Δ {deltaEnabled ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      <style jsx>{`
        .container {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .btn {
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 500;
          background-color: #1c2030;
          color: #afb5c4;
          border: none;
          cursor: pointer;
          transition: background-color 0.2s ease, color 0.2s ease;
          outline-offset: 2px;
          user-select: none;
        }

        .btn:hover,
        .btn:focus-visible {
          background-color: #262b3c;
          color: white;
          outline: none;
          box-shadow: 0 0 0 3px rgba(41, 98, 255, 0.5);
        }

        .active {
          background-color: #2962ff;
          color: white;
          font-weight: 600;
        }

        .active:hover,
        .active:focus-visible {
          background-color: #2962ff;
          box-shadow: 0 0 0 3px rgba(41, 98, 255, 0.7);
        }

        .delta-btn {
          padding-top: 0.375rem; /* py-1.5 */
          padding-bottom: 0.375rem;
          padding-left: 0.75rem;
          padding-right: 0.75rem;
          margin-left: 0.5rem;
          font-weight: 600;
        }

        .delta-btn.active {
          background-color: #1e40af; /* slightly darker blue */
          font-weight: 700;
        }
      `}</style>
    </>
  );
};

export default TimeframeSelector;
