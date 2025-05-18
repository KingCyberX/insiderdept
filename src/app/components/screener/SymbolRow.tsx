import React from 'react';
import { SymbolMetrics } from '../../services/screenerService';

interface SymbolRowProps {
  symbol: SymbolMetrics;
  onSymbolClick: (symbol: string, exchange: string) => void;
}

const SymbolRow: React.FC<SymbolRowProps> = ({ symbol, onSymbolClick }) => {
  // Format price based on magnitude
  const formatPrice = (price: number): string => {
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    if (price < 10000) return price.toFixed(1);
    return price.toFixed(0);
  };
  
  // Format volume with K, M, B suffix for readability
  const formatVolume = (volume: number): string => {
    if (volume >= 1000000000) {
      return `$${(volume / 1000000000).toFixed(1)}B`;
    }
    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(1)}M`;
    }
    if (volume >= 1000) {
      return `$${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toFixed(0);
  };

  // Format percentage with +/- sign
  const formatPercentage = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };
  
  // Get color class based on price change
  const getPriceChangeColorClass = (change: number): string => {
    if (change > 0) return 'text-green-400 font-semibold';
    if (change < 0) return 'text-red-400 font-semibold';
    return 'text-gray-400';
  };
  
  // Get gradient backgrounds for exchanges based on their name
  const getExchangeGradient = (exchange: string): string => {
    switch(exchange) {
      case 'Binance':
        return 'bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 text-yellow-300';
      case 'OKX':
        return 'bg-gradient-to-r from-blue-500/20 to-blue-600/20 text-blue-300';
      case 'Bybit':
        return 'bg-gradient-to-r from-purple-500/20 to-purple-600/20 text-purple-300';
      case 'MEXC':
        return 'bg-gradient-to-r from-green-500/20 to-green-600/20 text-green-300';
      default:
        return 'bg-gradient-to-r from-gray-500/20 to-gray-600/20 text-gray-300';
    }
  };
  
  return (
    <tr className="hover:bg-[#1e222d] transition-colors border-b border-[#2a2e39]">
      <td className="px-6 py-4">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/30 to-blue-700/30 text-blue-300 flex items-center justify-center mr-3 text-sm font-medium">
            {symbol.baseAsset.charAt(0)}
          </div>
          <div>
            <div className="font-medium">{symbol.baseAsset}/{symbol.quoteAsset}</div>
            <div className="text-xs text-[#9fa9bc]">{symbol.symbol}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="font-medium">${formatPrice(symbol.price)}</div>
      </td>
      <td className="px-6 py-4">
        <div className={getPriceChangeColorClass(symbol.priceChange24h)}>
          {formatPercentage(symbol.priceChange24h)}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-wrap gap-1">
          {symbol.exchanges.map(exchange => (
            <span
              key={exchange}
              className={`px-2 py-1 text-xs rounded-full ${
                exchange === symbol.primaryExchange
                  ? getExchangeGradient(exchange)
                  : 'bg-[#2a2e39] text-[#9fa9bc]'
              }`}
            >
              {exchange}
            </span>
          ))}
        </div>
      </td>
      <td className="px-6 py-4">
        <button
          onClick={() => onSymbolClick(symbol.symbol, symbol.primaryExchange)}
          className="px-4 py-2 bg-[#2962ff] text-white text-sm font-semibold rounded-md hover:bg-blue-500 transition-colors"
        >
          Chart
        </button>
      </td>
    </tr>
  );
};

export default SymbolRow;