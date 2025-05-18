"use client";

import React from 'react';
import { Exchange } from '../../types/market';
import aggregatorService from '../../services/exchanges/aggregator';

interface ExchangeSelectorProps {
  currentExchange: Exchange;
  onExchangeChange: (exchange: Exchange) => void;
}

const ExchangeSelector: React.FC<ExchangeSelectorProps> = ({
  currentExchange,
  onExchangeChange
}) => {
  const exchanges = aggregatorService.getExchanges();
  
  return (
    <div className="flex flex-wrap gap-1">
      {exchanges.map((exchange) => (
        <button
          key={exchange}
          onClick={() => onExchangeChange(exchange)}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            currentExchange === exchange
              ? 'bg-[#2962ff] text-white'
              : 'bg-[#1c2030] text-[#afb5c4] hover:bg-[#262b3c]'
          }`}
        >
          {exchange}
        </button>
      ))}
    </div>
  );
};

// Make sure to export the component as default
export default ExchangeSelector;