"use client";

import React from 'react';
import SymbolScreener from '../components/screener/SymbolScreener';
import { ScreenerFilters, Exchange } from '../services/screenerService';
import { useSearchParams } from 'next/navigation';

export default function ScreenerPage() {
  const searchParams = useSearchParams();
  
  // Parse filter parameters from URL
  const parseFilters = (): ScreenerFilters => {
    const filters: ScreenerFilters = {};
    
    // Parse exchanges
    const exchangesParam = searchParams.get('exchanges');
    if (exchangesParam) {
      // Cast the string[] as Exchange[] since we know these are valid exchange names
      filters.exchanges = exchangesParam.split(',').map(e => e.trim()) as Exchange[];
    }
    
    // Parse sort
    const sortBy = searchParams.get('sortBy');
    if (sortBy) {
      filters.sortBy = sortBy as 'volume' | 'price' | 'priceChange' | 'volatility';
    }
    
    const sortDirection = searchParams.get('sortDirection');
    if (sortDirection) {
      filters.sortDirection = sortDirection as 'asc' | 'desc';
    }
    
    // Parse numeric filters
    const minVolume = searchParams.get('minVolume');
    if (minVolume) {
      filters.minVolume = Number(minVolume);
    }
    
    const maxVolume = searchParams.get('maxVolume');
    if (maxVolume) {
      filters.maxVolume = Number(maxVolume);
    }
    
    // Parse asset filters
    const baseAssets = searchParams.get('baseAssets');
    if (baseAssets) {
      filters.baseAssets = baseAssets.split(',').map(a => a.trim());
    }
    
    const quoteAssets = searchParams.get('quoteAssets');
    if (quoteAssets) {
      filters.quoteAssets = quoteAssets.split(',').map(a => a.trim());
    }
    
    return filters;
  };
  
  const initialFilters = parseFilters();
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-6">
        Cryptocurrency Market Scanner
      </h1>
      
      <div className="mb-8 text-[#9fa9bc]">
        <p>
          Discover trading opportunities across multiple exchanges. 
          Filter by volume, price, and more to find the perfect assets for your strategy.
        </p>
      </div>
      
      <SymbolScreener initialFilters={initialFilters} />
    </div>
  );
}