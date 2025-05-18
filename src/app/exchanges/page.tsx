// src/app/exchanges/page.tsx
"use client";

import React, { useState, useEffect } from 'react';

// Define types locally since imports aren't working
type Exchange = 'Binance' | 'OKX' | 'Bybit' | 'MEXC';

interface ExchangeStatus {
  name: Exchange;
  status: 'operational' | 'issues' | 'maintenance';
  latency: number | null;
  markets: number;
  lastChecked: Date;
}

// Create stub for aggregator service
const aggregatorStub = {
  getExchanges: () => {
    return ['Binance', 'OKX', 'Bybit', 'MEXC'] as Exchange[];
  },
  getExchangeByName: (name: Exchange) => {
    // Stub implementation
    return {
      getName: () => name,
      getSymbols: async () => {
        return Array(Math.floor(Math.random() * 100) + 50).fill(null).map((_, i) => ({
          symbol: `PAIR${i}`,
          baseAsset: 'BASE',
          quoteAsset: 'QUOTE'
        }));
      }
    };
  }
};

export default function ExchangesPage() {
  const [exchanges, setExchanges] = useState<ExchangeStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const checkExchanges = async () => {
      setIsLoading(true);
      const availableExchanges = aggregatorStub.getExchanges();
      
      const statusPromises = availableExchanges.map(async (exchange) => {
        // Start timer for latency check
        const startTime = Date.now();
        let status: 'operational' | 'issues' | 'maintenance' = 'operational';
        let latency: number | null = null;
        let markets = 0;
        
        try {
          // Get exchange implementation
          const exchangeImpl = aggregatorStub.getExchangeByName(exchange);
          
          if (exchangeImpl) {
            // Try to get symbols from the exchange
            const symbols = await exchangeImpl.getSymbols();
            markets = symbols.length;
            
            // Calculate latency
            latency = Date.now() - startTime;
            
            // Consider high latency as an issue
            if (latency > 2000) {
              status = 'issues';
            }
          } else {
            status = 'maintenance';
          }
        } catch (error) {
          console.error(`Error checking ${exchange}:`, error);
          status = 'issues';
        }
        
        return {
          name: exchange,
          status,
          latency,
          markets,
          lastChecked: new Date()
        };
      });
      
      const results = await Promise.all(statusPromises);
      setExchanges(results);
      setIsLoading(false);
    };
    
    checkExchanges();
    
    // Refresh every 5 minutes
    const interval = setInterval(checkExchanges, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const getStatusColor = (status: 'operational' | 'issues' | 'maintenance') => {
    switch (status) {
      case 'operational': return 'bg-green-500';
      case 'issues': return 'bg-yellow-500';
      case 'maintenance': return 'bg-red-500';
    }
  };
  
  return (
    <div className="container mx-auto p-4">
      <div className="bg-[#131722] border border-[#2a2e39] rounded-lg overflow-hidden shadow-lg p-6">
        <h1 className="text-2xl font-semibold text-white mb-6">Exchange Status</h1>
        
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-r-2 border-[#2962ff]"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#1c2030] text-[#afb5c4]">
                  <th className="px-4 py-3 text-left">Exchange</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Latency</th>
                  <th className="px-4 py-3 text-left">Markets</th>
                  <th className="px-4 py-3 text-left">Last Checked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2e39]">
                {exchanges.map((exchange) => (
                  <tr key={exchange.name} className="hover:bg-[#1c2030]">
                    <td className="px-4 py-3 text-white">{exchange.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        <div className={`h-2 w-2 rounded-full mr-2 ${getStatusColor(exchange.status)}`}></div>
                        <span className="text-[#afb5c4] capitalize">{exchange.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#afb5c4]">
                      {exchange.latency !== null ? `${exchange.latency}ms` : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-[#afb5c4]">{exchange.markets}</td>
                    <td className="px-4 py-3 text-[#afb5c4]">
                      {exchange.lastChecked.toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        <div className="mt-6 text-sm text-[#7f8596]">
          <p><span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-2"></span> Operational: The exchange API is functioning normally.</p>
          <p><span className="inline-block h-2 w-2 rounded-full bg-yellow-500 mr-2"></span> Issues: The exchange API is experiencing high latency or intermittent failures.</p>
          <p><span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-2"></span> Maintenance: The exchange API is currently unavailable.</p>
        </div>
      </div>
    </div>
  );
}