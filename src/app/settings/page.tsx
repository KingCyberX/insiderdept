// src/app/settings/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// We'll use local type definition temporarily
type Exchange = 'Binance' | 'OKX' | 'Bybit' | 'MEXC';
type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

// Define types for our stub services
interface UserPreferences {
  defaultSymbol: string;
  defaultInterval: string;
  defaultExchange: string;
  darkMode: boolean;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading?: boolean;
  user?: { 
    id: string; 
    email: string;
  };
}

// Create stub service objects if the imports aren't working yet
const userPreferencesService = {
  subscribe: (callback: (prefs: UserPreferences) => void) => {
    callback({
      defaultSymbol: 'BTCUSDT',
      defaultInterval: '1m',
      defaultExchange: 'Binance',
      darkMode: true
    });
    return () => {};
  },
  updatePreferences: () => {}
};

const authService = {
  getState: () => ({ 
    user: { id: '1', email: 'user@example.com' } 
  } as AuthState),
  logout: () => {},
  subscribe: (callback: (state: AuthState) => void) => {
    callback({ 
      isAuthenticated: true, 
      user: { id: '1', email: 'user@example.com' }
    });
    return () => {};
  }
};

// Empty component as placeholder
const ExchangeFeatures = () => <div></div>;

export default function SettingsPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultSymbol, setDefaultSymbol] = useState('BTCUSDT');
  const [defaultInterval, setDefaultInterval] = useState<TimeInterval>('1m');
  const [defaultExchange, setDefaultExchange] = useState<Exchange>('Binance');
  const [darkMode, setDarkMode] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  // Available time intervals
  const intervals: TimeInterval[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
  
  // Available exchanges
  const exchanges: Exchange[] = ['Binance', 'OKX', 'Bybit', 'MEXC'];
  
  useEffect(() => {
    const unsubAuth = authService.subscribe(state => {
      setIsAuthenticated(state.isAuthenticated);
      
      if (!state.isAuthenticated && !state.isLoading) {
        router.push('/chart');
      }
    });
    
    const unsubPrefs = userPreferencesService.subscribe(prefs => {
      setDefaultSymbol(prefs.defaultSymbol || 'BTCUSDT');
      setDefaultInterval(prefs.defaultInterval as TimeInterval || '1m');
      setDefaultExchange(prefs.defaultExchange as Exchange || 'Binance');
      setDarkMode(prefs.darkMode);
      setIsLoading(false);
    });
    
    return () => {
      unsubAuth();
      unsubPrefs();
    };
  }, [router]);
  
  const handleSavePreferences = () => {
    setSaveStatus('saving');
    
    // Call updatePreferences without arguments since our stub doesn't use them
    userPreferencesService.updatePreferences();
    
    setTimeout(() => {
      setSaveStatus('saved');
      
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    }, 500);
  };
  
  if (!isAuthenticated || isLoading) {
    return (
      <div className="container mx-auto p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-r-2 border-[#2962ff]"></div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="bg-[#131722] border border-[#2a2e39] rounded-lg overflow-hidden shadow-lg p-6">
            <h1 className="text-2xl font-semibold text-white mb-6">Settings</h1>
            
            <div className="space-y-6">
              <div>
                <h2 className="text-xl text-white mb-4">Default Preferences</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-[#afb5c4] mb-2">Default Symbol</label>
                    <input
                      type="text"
                      value={defaultSymbol}
                      onChange={(e) => setDefaultSymbol(e.target.value)}
                      className="w-full max-w-md p-3 bg-[#1c2030] border border-[#2a2e39] rounded-md text-white focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff]"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[#afb5c4] mb-2">Default Exchange</label>
                    <select
                      value={defaultExchange}
                      onChange={(e) => setDefaultExchange(e.target.value as Exchange)}
                      className="w-full max-w-md p-3 bg-[#1c2030] border border-[#2a2e39] rounded-md text-white focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff]"
                    >
                      {exchanges.map(exchange => (
                        <option key={exchange} value={exchange}>{exchange}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-[#afb5c4] mb-2">Default Interval</label>
                    <select
                      value={defaultInterval}
                      onChange={(e) => setDefaultInterval(e.target.value as TimeInterval)}
                      className="w-full max-w-md p-3 bg-[#1c2030] border border-[#2a2e39] rounded-md text-white focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff]"
                    >
                      {intervals.map(interval => (
                        <option key={interval} value={interval}>{interval}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="darkMode"
                      checked={darkMode}
                      onChange={(e) => setDarkMode(e.target.checked)}
                      className="h-4 w-4 text-[#2962ff] focus:ring-[#2962ff] border-[#2a2e39] rounded"
                    />
                    <label htmlFor="darkMode" className="ml-2 text-[#afb5c4]">
                      Dark Mode
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center">
                <button
                  onClick={handleSavePreferences}
                  disabled={saveStatus === 'saving'}
                  className="bg-[#2962ff] hover:bg-[#1e53e5] text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
                >
                  {saveStatus === 'saving' ? (
                    <span className="flex items-center">
                      <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-r-2 border-white mr-2"></span>
                      Saving...
                    </span>
                  ) : saveStatus === 'saved' ? (
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Saved!
                    </span>
                  ) : (
                    'Save Preferences'
                  )}
                </button>
                
                <button
                  onClick={() => authService.logout()}
                  className="ml-4 bg-[#262b3c] hover:bg-[#1c2030] text-white px-4 py-2 rounded transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-span-1">
          <div className="bg-[#131722] border border-[#2a2e39] rounded-lg overflow-hidden shadow-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Account Information</h2>
            
            {/* Display user information */}
            <div className="mb-6">
              <div className="text-[#afb5c4] mb-1">Email</div>
              <div className="text-white">{authService.getState().user?.email}</div>
            </div>
            
            <div>
              <h3 className="text-md font-medium text-white mb-2">Account Settings</h3>
              <div className="divide-y divide-[#2a2e39]">
                <button
                  onClick={() => router.push('/mylist')}
                  className="w-full py-3 text-left text-[#afb5c4] hover:text-white transition-colors flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  My Watchlist
                </button>
                <button
                  onClick={() => router.push('/alerts')}
                  className="w-full py-3 text-left text-[#afb5c4] hover:text-white transition-colors flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  Manage Alerts
                </button>
                <button
                  onClick={() => router.push('/exchanges')}
                  className="w-full py-3 text-left text-[#afb5c4] hover:text-white transition-colors flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Exchange Status
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Exchange feature comparison */}
      <div className="mt-6">
        <ExchangeFeatures />
      </div>
    </div>
  );
}