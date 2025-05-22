"use client";

import React from "react";
import { Exchange } from "../../types/market";
import aggregatorService from "../../services/exchanges/aggregator";

interface ExchangeSelectorProps {
  currentExchange: Exchange;
  onExchangeChange: (exchange: Exchange) => void;
}

const ExchangeSelector: React.FC<ExchangeSelectorProps> = ({
  currentExchange,
  onExchangeChange,
}) => {
  const exchanges = aggregatorService.getExchanges();

  return (
    <>
      <div className="container">
        {exchanges.map((exchange) => {
          const isActive = currentExchange === exchange;
          return (
            <button
              key={exchange}
              type="button"
              aria-pressed={isActive}
              onClick={() => onExchangeChange(exchange)}
              className={`button ${isActive ? "active" : ""}`}
            >
              {exchange}
            </button>
          );
        })}
      </div>

      <style jsx>{`
        .container {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content:start;
        }
        .button {
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 500;
          background-color: #1c2030;
          color: #afb5c4;
          border: none;
          cursor: pointer;
          transition: background-color 0.2s ease, color 0.2s ease;
          outline-offset: 2px;
        }
        .button:hover,
        .button:focus-visible {
          background-color: #262b3c;
          color: white;
          outline: none;
          box-shadow: 0 0 0 3px rgba(41, 98, 255, 0.5);
        }
        .active {
          background-color: #2962ff;
          color: white;
        }
        .active:hover,
        .active:focus-visible {
          background-color: #2962ff;
          color: white;
          box-shadow: 0 0 0 3px rgba(41, 98, 255, 0.7);
        }
      `}</style>
    </>
  );
};

export default ExchangeSelector;
