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
  
  useEffect(() => {
    const fetchSymbols = async () => {
      const dummyData: SymbolData[] = Array(20).fill(0).map((_, i) => ({
        symbol: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'][i % 5],
        price: 942217 + (Math.random() * 1000 - 500),
        delay: 4
      }));
      
      setSymbols(dummyData);
      setLoading(false);
    };
    
    fetchSymbols();
    
    const interval = setInterval(() => {
      setSymbols(prev => 
        prev.map(symbol => ({
          ...symbol,
          previousPrice: symbol.price,
          price: symbol.price * (1 + (Math.random() * 0.001 - 0.0005)),
        }))
      );
    }, 4000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Format price parts to show price and subprice like "942217 $105.1..."
  const formatPriceDisplay = (price: number) => {
    // e.g. price = 942217.1051 => integer part + decimal part formatted
    const integerPart = Math.floor(price);
    const decimalPart = price - integerPart;
    // show decimal part as $xxx.x
    const decimalFormatted = `$${(decimalPart * 1000).toFixed(1)}`;
    return { integerPart, decimalFormatted };
  };
  
  // Determine direction: up, down, neutral
  const getPriceDirection = (symbol: SymbolData) => {
    if (!symbol.previousPrice) return 'neutral';
    return symbol.price > symbol.previousPrice ? 'up' : 'down';
  };

  // Arrow icons
  const ArrowUp = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 5L15 12H5L10 5Z" fill="#3B82F6" />
    </svg>
  );

  const ArrowDown = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 15L15 8H5L10 15Z" fill="#EF4444" />
    </svg>
  );

  const Circle = ({ color }: { color: string }) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="8" fill={color} />
    </svg>
  );

  return (
    <div className="h-full bg-[#131722] overflow-hidden flex flex-col text-xs font-sans select-none" style={{fontFamily: 'Arial, sans-serif'}}>
      {/* Search Bar */}
      <div className="p-2 border-b border-[#2a2e39]">
        <input
          type="text"
          placeholder="Search..."
          className="w-full bg-[#1e222d] border border-[#2a2e39] rounded-md px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          <div className="overflow-y-auto flex-grow">
            {symbols.map((symbol, index) => {
              const direction = getPriceDirection(symbol);
              const bgColor = index % 2 === 0 ? '#131722' : '#1c2030';

              const { integerPart, decimalFormatted } = formatPriceDisplay(symbol.price);

              // Icon selection and color
              let icon;
              if (direction === 'up') icon = <ArrowUp />;
              else if (direction === 'down') icon = <ArrowDown />;
              else icon = <Circle color="#FBBF24" />; // gold circle

              return (
                <div
                  key={index}
                  className="flex items-center p-2 cursor-pointer hover:bg-[#1c2030]"
                  style={{ backgroundColor: bgColor }}
                  onClick={() => onSymbolSelect(symbol.symbol)}
                >
                  <div className="flex items-center justify-center w-5 h-5 mr-1">
                    {icon}
                  </div>

                  {/* Symbol and Price */}
                  <div className="flex-1 flex justify-between items-center">
                    <div className="flex flex-col leading-tight">
                      <span className="text-white font-semibold">{symbol.symbol}</span>
                      <span className="text-gray-400">{integerPart} {decimalFormatted}...</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={
                        direction === 'up' ? 'text-blue-400 font-semibold' :
                        direction === 'down' ? 'text-red-400 font-semibold' :
                        'text-yellow-400 font-semibold'
                      }>
                        {integerPart}
                      </span>
                      <span className="text-gray-400">{symbol.delay}s</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom stats */}
          <div className="p-2 border-t border-[#2a2e39] text-white text-xs font-semibold">
            <div className="flex justify-between">
              <span>Trades/m</span>
              <span>790</span>
            </div>
            <div className="flex justify-between">
              <span>Volume/m</span>
              <span>458.2K</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SymbolSidebar;
