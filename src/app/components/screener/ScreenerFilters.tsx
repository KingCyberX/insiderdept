// src/app/components/screener/ScreenerFilters.tsx

import React, { useState } from 'react';
import { Exchange } from '../../types/market';
import { ScreenerFilters as Filters } from '../../services/screenerService';

interface ScreenerFiltersProps {
  currentFilters: Filters;
  onFilterChange: (filters: Filters) => void;
}

const ScreenerFilters: React.FC<ScreenerFiltersProps> = ({
  currentFilters,
  onFilterChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Available exchanges
  const exchanges: Exchange[] = ['Binance', 'OKX', 'Bybit', 'MEXC'];
  
  // Common quote assets
  const quoteAssets = ['USDT', 'USDC', 'USD', 'BUSD'];
  
  // Common base assets
  const baseAssets = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA'];
  
  // Apply a single exchange filter
  const toggleExchange = (exchange: Exchange) => {
    const currentExchanges = currentFilters.exchanges || [];
    
    if (currentExchanges.includes(exchange)) {
      // Remove exchange
      onFilterChange({
        exchanges: currentExchanges.filter(e => e !== exchange)
      });
    } else {
      // Add exchange
      onFilterChange({
        exchanges: [...currentExchanges, exchange]
      });
    }
  };
  
  // Toggle a base asset filter
  const toggleBaseAsset = (asset: string) => {
    const currentAssets = currentFilters.baseAssets || [];
    
    if (currentAssets.includes(asset)) {
      // Remove asset
      onFilterChange({
        baseAssets: currentAssets.filter(a => a !== asset)
      });
    } else {
      // Add asset
      onFilterChange({
        baseAssets: [...currentAssets, asset]
      });
    }
  };
  
  // Toggle a quote asset filter
  const toggleQuoteAsset = (asset: string) => {
    const currentAssets = currentFilters.quoteAssets || [];
    
    if (currentAssets.includes(asset)) {
      // Remove asset
      onFilterChange({
        quoteAssets: currentAssets.filter(a => a !== asset)
      });
    } else {
      // Add asset
      onFilterChange({
        quoteAssets: [...currentAssets, asset]
      });
    }
  };
  
  // Change the sort order
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    
    if (value === 'volume_desc') {
      onFilterChange({ sortBy: 'volume', sortDirection: 'desc' });
    } else if (value === 'volume_asc') {
      onFilterChange({ sortBy: 'volume', sortDirection: 'asc' });
    } else if (value === 'price_desc') {
      onFilterChange({ sortBy: 'price', sortDirection: 'desc' });
    } else if (value === 'price_asc') {
      onFilterChange({ sortBy: 'price', sortDirection: 'asc' });
    } else if (value === 'change_desc') {
      onFilterChange({ sortBy: 'priceChange', sortDirection: 'desc' });
    } else if (value === 'change_asc') {
      onFilterChange({ sortBy: 'priceChange', sortDirection: 'asc' });
    } else if (value === 'volatility_desc') {
      onFilterChange({ sortBy: 'volatility', sortDirection: 'desc' });
    }
  };
  
  // Clear all filters
  const clearFilters = () => {
    onFilterChange({
      exchanges: undefined,
      minVolume: undefined,
      maxVolume: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      minPriceChange: undefined,
      maxPriceChange: undefined,
      baseAssets: undefined,
      quoteAssets: undefined,
      sortBy: 'volume',
      sortDirection: 'desc',
    });
  };
  
  // Get current sort value
  const getCurrentSortValue = (): string => {
    const { sortBy, sortDirection } = currentFilters;
    
    if (!sortBy) return 'volume_desc';
    
    return `${sortBy}_${sortDirection || 'desc'}`;
  };
  
  return (
    <div className="border-b border-[#2a2e39]">
      {/* Basic filters - always visible */}
      <div className="p-4 flex flex-wrap items-center gap-4">
        {/* Sort control */}
        <div>
          <label className="block text-sm text-[#9fa9bc] mb-1">Sort by</label>
          <select
            value={getCurrentSortValue()}
            onChange={handleSortChange}
            className="bg-[#1e222d] border border-[#2a2e39] rounded px-3 py-2 text-white"
          >
            <option value="volume_desc">Highest Volume</option>
            <option value="volume_asc">Lowest Volume</option>
            <option value="price_desc">Highest Price</option>
            <option value="price_asc">Lowest Price</option>
            <option value="change_desc">Biggest Gainers</option>
            <option value="change_asc">Biggest Losers</option>
            <option value="volatility_desc">Most Volatile</option>
          </select>
        </div>
        
        {/* Exchange quick filters */}
        <div>
          <label className="block text-sm text-[#9fa9bc] mb-1">Exchanges</label>
          <div className="flex flex-wrap gap-2">
            {exchanges.map(exchange => (
              <button
                key={exchange}
                onClick={() => toggleExchange(exchange)}
                className={`px-3 py-1 text-sm rounded ${
                  currentFilters.exchanges?.includes(exchange)
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#1e222d] text-[#9fa9bc]'
                }`}
              >
                {exchange}
              </button>
            ))}
          </div>
        </div>
        
        {/* Toggle advanced filters */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="ml-auto text-sm text-blue-400 hover:text-blue-300"
        >
          {isExpanded ? 'Hide Filters' : 'More Filters'}
        </button>
      </div>
      
      {/* Advanced filters - toggleable */}
      {isExpanded && (
        <div className="p-4 bg-[#1a1e2d] border-t border-[#2a2e39]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Base asset filters */}
            <div>
              <label className="block text-sm text-[#9fa9bc] mb-2">Base Assets</label>
              <div className="flex flex-wrap gap-2">
                {baseAssets.map(asset => (
                  <button
                    key={asset}
                    onClick={() => toggleBaseAsset(asset)}
                    className={`px-3 py-1 text-sm rounded ${
                      currentFilters.baseAssets?.includes(asset)
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#1e222d] text-[#9fa9bc]'
                    }`}
                  >
                    {asset}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Quote asset filters */}
            <div>
              <label className="block text-sm text-[#9fa9bc] mb-2">Quote Assets</label>
              <div className="flex flex-wrap gap-2">
                {quoteAssets.map(asset => (
                  <button
                    key={asset}
                    onClick={() => toggleQuoteAsset(asset)}
                    className={`px-3 py-1 text-sm rounded ${
                      currentFilters.quoteAssets?.includes(asset)
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#1e222d] text-[#9fa9bc]'
                    }`}
                  >
                    {asset}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Volume range filters */}
            <div>
              <label className="block text-sm text-[#9fa9bc] mb-2">Volume Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={currentFilters.minVolume || ''}
                  onChange={(e) => onFilterChange({ minVolume: Number(e.target.value) || undefined })}
                  className="bg-[#1e222d] border border-[#2a2e39] rounded px-3 py-2 text-white w-28"
                />
                <span className="text-[#9fa9bc]">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={currentFilters.maxVolume || ''}
                  onChange={(e) => onFilterChange({ maxVolume: Number(e.target.value) || undefined })}
                  className="bg-[#1e222d] border border-[#2a2e39] rounded px-3 py-2 text-white w-28"
                />
              </div>
            </div>
          </div>
          
          {/* Clear filters button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-red-600/30 text-red-200 rounded hover:bg-red-600/50"
            >
              Clear All Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenerFilters;
