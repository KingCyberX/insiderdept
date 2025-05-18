// src/components/controls/AssetSearch.tsx
import React, { useState, useEffect, useRef } from 'react';
import aggregatorService from '../../services/exchanges/aggregator';

import { Exchange } from '../../types/market';

interface AssetSearchProps {
  onSelect: (symbol: string) => void;
  currentExchange?: Exchange;
}

interface Symbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

const AssetSearch: React.FC<AssetSearchProps> = ({ 
  onSelect, 
  currentExchange = 'Binance' as Exchange 
}) => {
  const [query, setQuery] = useState('');
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [filteredSymbols, setFilteredSymbols] = useState<Symbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Fetch symbols from the exchange
  useEffect(() => {
    const fetchSymbols = async () => {
      setLoading(true);
      try {
        // Get exchange service for the current exchange
        const exchangeService = aggregatorService.getExchangeByName(currentExchange);
        
        if (exchangeService) {
          const symbolsData = await exchangeService.getSymbols();
          setSymbols(symbolsData);
        } else {
          // Fallback to mock data if exchange service is not available
          const mockSymbols = [
            { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
            { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
            { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT' },
            { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT' },
            { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT' },
            { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT' },
          ];
          setSymbols(mockSymbols);
        }
      } catch (error) {
        console.error('Failed to fetch symbols:', error);
        // Fallback to mock data
        const mockSymbols = [
          { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
          { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
          { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT' },
          { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT' },
          { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT' },
          { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT' },
        ];
        setSymbols(mockSymbols);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSymbols();
    
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [currentExchange]);
  
  // Filter symbols based on query
  useEffect(() => {
    if (query) {
      const filtered = symbols.filter(s => 
        s.symbol.toLowerCase().includes(query.toLowerCase()) ||
        s.baseAsset.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredSymbols(filtered.slice(0, 20)); // Limit results to 20
      setShowDropdown(true);
    } else {
      setFilteredSymbols([]);
      setShowDropdown(false);
    }
  }, [query, symbols]);
  
  const handleSelect = (symbol: string) => {
    onSelect(symbol);
    setQuery('');
    setShowDropdown(false);
  };
  
  // Quick select commonly used symbols
  const renderPopularSymbols = () => {
    const popularSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    
    return (
      <div className="mt-2 flex flex-wrap gap-1">
        {popularSymbols.map(sym => (
          <button
            key={sym}
            onClick={() => handleSelect(sym)}
            className="text-xs bg-[#262b3c] text-[#a3adb8] px-2 py-1 rounded hover:bg-[#2962ff] hover:text-white transition-colors"
          >
            {sym}
          </button>
        ))}
      </div>
    );
  };
  
  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative shadow-sm">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query && setShowDropdown(true)}
          placeholder="Search for a crypto asset..."
          className="w-full p-4 pl-12 bg-[#1c2030] border border-[#2a2e39] rounded-md text-white focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff] transition-all"
        />
        <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
          <svg className="w-5 h-5 text-[#757c8a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
      
      {/* Show popular symbols for quick access */}
      {!showDropdown && !query && symbols.length > 0 && renderPopularSymbols()}
      
      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-[#1c2030] border border-[#2a2e39] rounded-md shadow-2xl max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-t-2 border-r-2 border-[#2962ff]"></div>
              <span className="ml-2 text-[#a3adb8]">Loading assets...</span>
            </div>
          ) : filteredSymbols.length > 0 ? (
            <div className="divide-y divide-[#2a2e39]">
              {filteredSymbols.map((symbol) => (
                <div
                  key={symbol.symbol}
                  onClick={() => handleSelect(symbol.symbol)}
                  className="flex items-center justify-between p-3 hover:bg-[#262b3c] cursor-pointer transition-colors"
                >
                  <div>
                    <div className="font-medium text-white">{symbol.symbol}</div>
                    <div className="text-xs text-[#a3adb8] mt-1">{symbol.baseAsset}/{symbol.quoteAsset}</div>
                  </div>
                  <div className="bg-[#262b3c] px-2 py-1 rounded text-xs text-[#a3adb8]">
                    {symbol.quoteAsset}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-[#a3adb8]">
              No assets found matching &quot;{query}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AssetSearch;