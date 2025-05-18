// src/app/debug.tsx
"use client";
import React, { useState, useEffect } from 'react';
import binanceExchange from './services/exchanges/binanceExchange';

export default function DebugPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
 
  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const data = await binanceExchange.getSymbols();
        setSymbols(data.map(s => s.symbol));
      } catch (err) {
        console.error('Error fetching symbols:', err);
      }
    };
   
    fetchSymbols();
  }, []);
 
  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };
 
  const testSymbol = async () => {
    if (!selectedSymbol) return;
   
    addLog(`Testing ${selectedSymbol}...`);
   
    try {
      addLog('Fetching candles...');
      const candles = await binanceExchange.getCandles(selectedSymbol);
      addLog(`Got ${candles.length} candles.`);
     
      addLog('Testing WebSocket...');
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${selectedSymbol.toLowerCase()}@trade`);
     
      ws.onopen = () => addLog('WebSocket connected');
      ws.onmessage = () => addLog('WebSocket message received');
      ws.onerror = () => addLog('WebSocket error');
      ws.onclose = () => addLog('WebSocket closed');
     
      setTimeout(() => {
        ws.close();
        addLog('Test completed');
      }, 5000);
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
 
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Debug Tool</h1>
     
      <div className="mb-4">
        <select
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          className="p-2 border border-gray-300 rounded mr-2"
        >
          <option value="">Select symbol...</option>
          {symbols.map(symbol => (
            <option key={symbol} value={symbol}>{symbol}</option>
          ))}
        </select>
       
        <button
          onClick={testSymbol}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Test Symbol
        </button>
      </div>
     
      <div className="border border-gray-300 rounded p-2 h-80 overflow-y-auto bg-gray-100">
        {logs.map((log, i) => (
          <div key={i} className="text-sm font-mono">{log}</div>
        ))}
      </div>
    </div>
  );
}