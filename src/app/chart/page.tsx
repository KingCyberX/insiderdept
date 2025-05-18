// src/app/chart/page.tsx
"use client";

import React from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import '../styles/chart.css';

// Import types from the ChartController
type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
type Exchange = 'Binance' | 'OKX' | 'Bybit' | 'MEXC';

// Dynamically import ChartController with the correct path 
const ChartController = dynamic(() => import('../components/ChartController'), { 
  ssr: false 
});

export default function ChartPage() {
  const searchParams = useSearchParams();
  const symbol = searchParams.get('symbol') || 'BTCUSDT';
  
  // Get interval parameter and validate it
  const intervalParam = searchParams.get('interval') || '1m';
  const validIntervals: TimeInterval[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
  const interval: TimeInterval = validIntervals.includes(intervalParam as TimeInterval) 
    ? intervalParam as TimeInterval 
    : '1m';
  
  // Get exchange parameter and validate it
  const exchangeParam = searchParams.get('exchange') || 'Binance';
  const validExchanges: Exchange[] = ['Binance', 'OKX', 'Bybit', 'MEXC'];
  const exchange: Exchange = validExchanges.includes(exchangeParam as Exchange)
    ? exchangeParam as Exchange
    : 'Binance';

  return (
    <div className="min-h-screen bg-[#0b0e11]">
      <div className="container mx-auto p-0">
        <ChartController 
          initialSymbol={symbol} 
          initialInterval={interval} 
          initialExchange={exchange} 
        />
      </div>
    </div>
  );
}