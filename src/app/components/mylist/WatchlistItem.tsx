// src/components/mylist/WatchlistItem.tsx
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MarketSymbol } from '../../types/market';
import exchangeService from '../../services/exchanges/binanceExchange';

interface WatchlistItemProps {
  symbol: MarketSymbol;
  onRemove: (symbol: string) => void;
}

const WatchlistItem: React.FC<WatchlistItemProps> = ({ symbol, onRemove }) => {
  const [price, setPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    let ws: WebSocket | null = null;
    
    const connectWebSocket = () => {
      const wsUrl = exchangeService.getWebSocketUrl(symbol.symbol, 'ticker');
      ws = new WebSocket(wsUrl);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.c) { // Current price
            setPrice(parseFloat(data.c));
          }
          if (data.p) { // Price change
            setPriceChange(parseFloat(data.p));
          }
          setIsLoading(false);
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };
      
      ws.onerror = () => {
        console.error('WebSocket error');
        setIsLoading(false);
      };
      
      ws.onclose = () => {
        setTimeout(connectWebSocket, 5000);
      };
    };
    
    connectWebSocket();
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [symbol.symbol]);
  
  const formattedPrice = price !== null ? price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  }) : '--';
  
  const priceChangePercent = priceChange.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  const isPriceUp = priceChange >= 0;
  
  return (
    <div className="bg-[#1c2030] border border-[#2a2e39] rounded-md p-4 hover:border-[#2962ff] transition-colors">
      <div className="flex justify-between items-center mb-2">
        <Link 
          href={`/chart?symbol=${symbol.symbol}`}
          className="text-white font-medium hover:text-[#2962ff] transition-colors"
        >
          {symbol.symbol}
        </Link>
        
        <button
          onClick={() => onRemove(symbol.symbol)}
          className="text-[#7f8596] hover:text-[#ff5370] transition-colors"
          aria-label="Remove from watchlist"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="text-xs text-[#7f8596] mb-3">
        {symbol.baseAsset}/{symbol.quoteAsset}
      </div>
      
      <div className="flex justify-between items-end">
        <div className="text-xl font-semibold text-white">
          {isLoading ? (
            <div className="h-6 w-20 bg-[#262b3c] rounded animate-pulse"></div>
          ) : (
            formattedPrice
          )}
        </div>
        
        {isLoading ? (
          <div className="h-5 w-16 bg-[#262b3c] rounded animate-pulse"></div>
        ) : (
          <div className={`text-sm ${isPriceUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
            {isPriceUp ? '+' : ''}{priceChangePercent}%
          </div>
        )}
      </div>
    </div>
  );
};

export default WatchlistItem;