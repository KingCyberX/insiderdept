// src/app/components/sidebar/SymbolSidebar.tsx

import React, { useState, useEffect } from 'react';

interface SymbolData {
  symbol: string;
  price: number;
  previousPrice?: number;
  delay: number;
}

interface SymbolSidebarProps {
  onSymbolSelect: (symbol: string) => void;
}

const SymbolSidebar: React.FC<SymbolSidebarProps> = ({ onSymbolSelect }) => {
  const [symbols, setSymbols] = useState<SymbolData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Fetch symbols and update prices
  useEffect(() => {
    const fetchSymbols = async () => {
      // For now, we'll use dummy data that matches the screenshot
      const dummyData: SymbolData[] = Array(20).fill(0).map((_, i) => ({
        symbol: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'][i % 5],
        price: 65400 + (Math.random() * 1000 - 500),
        delay: 4
      }));
      
      setSymbols(dummyData);
      setLoading(false);
    };
    
    fetchSymbols();
    
    // Update prices periodically
    const interval = setInterval(() => {
      setSymbols(prev => 
        prev.map(symbol => ({
          ...symbol,
          previousPrice: symbol.price,
          price: symbol.price * (1 + (Math.random() * 0.01 - 0.005)),
        }))
      );
    }, 4000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Format price number
  const formatPrice = (price: number) => {
    return price.toFixed(0);
  };
  
  // Determine if price is up or down
  const getPriceDirection = (symbol: SymbolData) => {
    if (!symbol.previousPrice) return 'neutral';
    return symbol.price > symbol.previousPrice ? 'up' : 'down';
  };
  
  return (
    <div className="h-full bg-[#131722] overflow-hidden flex flex-col">
      <div className="p-2 border-b border-[#2a2e39]">
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-[#1e222d] border border-[#2a2e39] rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="overflow-y-auto flex-grow">
          {symbols.map((symbol, index) => {
            const direction = getPriceDirection(symbol);
            const directionColor = direction === 'up' ? 'text-green-400' : direction === 'down' ? 'text-red-400' : '';
            const bgColor = index % 2 === 0 ? 'bg-[#131722]' : 'bg-[#1c2030]';
            const randomId = Math.floor(Math.random() * 999999);
            
            return (
              <div
                key={index}
                className={`flex items-center p-2 hover:bg-[#1c2030] cursor-pointer ${bgColor}`}
                onClick={() => onSymbolSelect(symbol.symbol)}
              >
                <div className="flex items-center w-full">
                  <div className="w-5 h-5 flex items-center justify-center rounded-full mr-1">
                    <span className={`text-xs ${directionColor}`}>
                      {direction === 'up' ? '●' : direction === 'down' ? '●' : '○'}
                    </span>
                  </div>
                  <div className="flex-1 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-sm text-white">{symbol.symbol}</span>
                      <span className="text-xs text-gray-400">{randomId}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-xs ${directionColor}`}>
                        {formatPrice(symbol.price)}
                      </span>
                      <span className="text-xs text-gray-400">{symbol.delay}s</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SymbolSidebar;