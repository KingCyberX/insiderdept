// src/components/mylist/MyListPage.tsx
import React, { useState, useEffect } from 'react';
import AssetSearch from '../controls/AssetSearch';
import WatchlistItem from './WatchlistItem';
import userPreferencesService from '../../services/userPreferencesService';
import exchangeService from '../../services/exchanges/binanceExchange';
import { MarketSymbol } from '../../types/market';

const MyListPage: React.FC = () => {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<MarketSymbol[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Get watchlist from user preferences
    const userWatchlist = userPreferencesService.getWatchlist();
    setWatchlist(userWatchlist);
    
    // Subscribe to watchlist changes
    const unsubscribe = userPreferencesService.subscribe(prefs => {
      setWatchlist(prefs.watchlist);
    });
    
    // Load symbol details
    const loadSymbols = async () => {
      setIsLoading(true);
      try {
        const allSymbols = await exchangeService.getSymbols();
        setSymbols(allSymbols);
      } catch (error) {
        console.error('Failed to load symbols:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSymbols();
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  const handleAddToWatchlist = (symbol: string) => {
    userPreferencesService.addToWatchlist(symbol);
  };
  
  const handleRemoveFromWatchlist = (symbol: string) => {
    userPreferencesService.removeFromWatchlist(symbol);
  };
  
  // Filter symbols to get details for watchlist items
  const watchlistSymbols = symbols.filter(s => 
    watchlist.includes(s.symbol)
  );
  
  return (
    <div className="container mx-auto p-4">
      <div className="bg-[#131722] border border-[#2a2e39] rounded-lg overflow-hidden shadow-lg p-6">
        <h1 className="text-2xl font-semibold text-white mb-6">My Watchlist</h1>
        
        <div className="mb-8 max-w-md">
          <AssetSearch onSelect={handleAddToWatchlist} />
        </div>
        
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-r-2 border-[#2962ff]"></div>
          </div>
        ) : watchlistSymbols.length === 0 ? (
          <div className="bg-[#1c2030] rounded-md p-8 text-center">
            <p className="text-[#afb5c4] text-lg mb-4">Your watchlist is empty</p>
            <p className="text-[#7f8596]">Use the search box above to find and add assets to your watchlist</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {watchlistSymbols.map(symbol => (
              <WatchlistItem
                key={symbol.symbol}
                symbol={symbol}
                onRemove={handleRemoveFromWatchlist}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyListPage;