// src/app/services/exchanges/okxExchange.ts
console.log('okxExchange.ts module loading');

import axios from 'axios';
import { Candle, MarketSymbol, OpenInterest, TimeInterval } from '../../types/market';
import { ExchangeService, WebSocketStreamHandlers } from './baseExchange';
import socketService from '../socketService';
import apiService from '../apiService';

// Keep track of current live candles with a map
const liveCandles: Map<string, Candle> = new Map();

// Simple cache implementation
const symbolsCache: { data: MarketSymbol[] | null, timestamp: number } = {
  data: null,
  timestamp: 0
};

const candleCache: { [key: string]: { data: Candle[], timestamp: number } } = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Create API client for proxy
const proxyApi = axios.create({
  baseURL: '/api', // Changed to use our new proxy
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Helper function to convert interval to OKX format
const convertIntervalToOKX = (interval: TimeInterval): string => {
  const mapping: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1H',
    '2h': '2H',
    '4h': '4H',
    '6h': '6H',
    '12h': '12H',
    '1d': '1D',
    '3d': '3D',
    '1w': '1W',
    '1M': '1M',
  };
  
  return mapping[interval] || '1m';
};

// Helper function to format symbol for OKX
const formatSymbol = (symbol: string): string => {
  // If already in OKX format (BTC-USDT), return as is
  if (symbol.includes('-')) {
    return symbol;
  }
  
  // Common quote currencies to check
  const quoteCurrencies = ['USDT', 'USDC', 'BTC', 'ETH'];
  
  for (const quote of quoteCurrencies) {
    if (symbol.endsWith(quote)) {
      const base = symbol.substring(0, symbol.length - quote.length);
      return `${base}-${quote}`;
    }
  }
  
  // Fallback: try to split at 3-4 characters from the end
  const base = symbol.slice(0, -4);
  const quote = symbol.slice(-4);
  return `${base}-${quote}`;
};

// Helper function to generate mock candle data (as fallback)
function generateMockCandleData(count: number): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  const candles: Candle[] = [];
  
  // Generate mock data based on a realistic price movement
  let price = 20000 + Math.random() * 10000; // Start around $20,000-$30,000 for BTC-like asset
  
  for (let i = 0; i < count; i++) {
    // Calculate time (going back in time from now)
    const time = now - (count - i) * 60; // 1-minute intervals
    
    // Generate a random price movement (with some trend)
    const movement = (Math.random() - 0.5) * (price * 0.02); // Up to 2% movement
    price += movement;
    
    // Calculate candle values
    const open = price;
    const close = price + (Math.random() - 0.5) * (price * 0.01);
    const high = Math.max(open, close) + Math.random() * (price * 0.005);
    const low = Math.min(open, close) - Math.random() * (price * 0.005);
    const volume = Math.random() * 100 + 10; // Random volume
    
    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume
    });
  }
  
  return candles;
}

// Create the exchange service implementation
const okxExchange: ExchangeService = {
  getName(): string {
    return 'OKX';
  },
  
  async getCandles(symbol: string, interval: TimeInterval = '1m', limit = 100): Promise<Candle[]> {
    // Check cache first
    const cacheKey = `${symbol}-${interval}-${limit}`;
    const now = Date.now();
    
    if (candleCache[cacheKey] && now - candleCache[cacheKey].timestamp < CACHE_TTL) {
      console.log(`Using cached candle data for ${symbol} (${interval})`);
      return candleCache[cacheKey].data;
    }
    
    try {
      // Try using apiService first
      try {
        console.log(`Fetching candles for ${symbol}, interval=${interval}, limit=${limit} via apiService`);
        const candles = await apiService.getHistoricalCandles('OKX', symbol, interval, limit);
        
        // Update cache
        candleCache[cacheKey] = {
          data: candles,
          timestamp: now
        };
        
        return candles;
      } catch (apiError) {
        console.error(`Failed to fetch candles via apiService: ${apiError}`);
        console.log('Falling back to existing implementation...');
        
        // Check if this is for delta aggregation (non-standard symbol)
        if (symbol.includes('USD') && symbol.length > 10) {
          console.log(`Detected aggregate symbol request: ${symbol}, will fetch individual pairs`);
          
          // Extract the base currency (e.g., BTC from BTCUSDTUSD)
          const baseRegex = /^([A-Z0-9]{3,})/;
          const match = symbol.match(baseRegex);
          const baseCurrency = match ? match[1] : 'BTC';
          
          // Common quote currencies for OKX
          const possibleQuotes = ['USDT', 'USDC', 'BTC', 'ETH', 'USD'];
          
          // Create valid OKX pairs (using OKX format)
          const validPairs = possibleQuotes.map(quote => `${baseCurrency}-${quote}`);
          
          console.log(`Will fetch data for these pairs: ${validPairs.join(', ')}`);
          
          // Fetch data for each valid pair
          const fetchPromises = validPairs.map(async (pair) => {
            try {
              // Use our proxy instead of server action
              const response = await proxyApi.get('/historical', {
                params: {
                  exchange: 'OKX',
                  symbol: pair,
                  interval: convertIntervalToOKX(interval),
                  limit
                }
              });
              
              if (!response.data || !response.data.success) {
                console.error(`OKX API error for ${pair}: ${response.data?.error || 'Unknown error'}`);
                return { pair, candles: [], success: false };
              }
              
              const candles = response.data.candles;
              return { pair, candles, success: candles.length > 0 };
            } catch (error) {
              console.error(`Failed to fetch data for ${pair}:`, error);
              return { pair, candles: [], success: false };
            }
          });
          
          const results = await Promise.all(fetchPromises);
          const successfulResults = results.filter(r => r.success && r.candles.length > 0);
          
          if (successfulResults.length === 0) {
            console.warn(`No data fetched for any pairs, using mock data`);
            return generateMockCandleData(limit);
          }
          
          // Create a time-indexed map for all candles
          const timeMap = new Map<number, { 
            volumes: number[],
            opens: number[],
            highs: number[],
            lows: number[],
            closes: number[]
          }>();
          
          // Process all candles into the time map
          for (const { candles } of successfulResults) {
            for (const candle of candles) {
              const existing = timeMap.get(candle.time);
              
              if (existing) {
                // Add data to existing time entry
                existing.volumes.push(candle.volume);
                existing.opens.push(candle.open);
                existing.highs.push(candle.high);
                existing.lows.push(candle.low);
                existing.closes.push(candle.close);
              } else {
                // Add new entry if time doesn't exist yet
                timeMap.set(candle.time, {
                  volumes: [candle.volume],
                  opens: [candle.open],
                  highs: [candle.high],
                  lows: [candle.low],
                  closes: [candle.close]
                });
              }
            }
          }
          
          // Convert back to array and sort by time
          const aggregatedCandles = Array.from(timeMap.entries()).map(([time, data]) => {
            // Calculate volume-weighted averages for price data
            const totalVolume = data.volumes.reduce((sum, vol) => sum + vol, 0);
            
            // Calculate volume-weighted average prices
            let open = 0, high = 0, low = 0, close = 0;
            
            if (totalVolume > 0) {
              // Weight by volume
              open = data.opens.reduce((sum, o, i) => sum + o * data.volumes[i], 0) / totalVolume;
              high = data.highs.reduce((sum, h, i) => sum + h * data.volumes[i], 0) / totalVolume;
              low = data.lows.reduce((sum, l, i) => sum + l * data.volumes[i], 0) / totalVolume;
              close = data.closes.reduce((sum, c, i) => sum + c * data.volumes[i], 0) / totalVolume;
            } else {
              // Simple average if no volume data
              open = data.opens.reduce((sum, o) => sum + o, 0) / data.opens.length;
              high = data.highs.reduce((sum, h) => sum + h, 0) / data.highs.length;
              low = data.lows.reduce((sum, l) => sum + l, 0) / data.lows.length;
              close = data.closes.reduce((sum, c) => sum + c, 0) / data.closes.length;
            }
            
            return {
              time,
              open,
              high,
              low,
              close,
              volume: totalVolume
            };
          }).sort((a, b) => a.time - b.time);
          
          // Update cache
          candleCache[cacheKey] = {
            data: aggregatedCandles,
            timestamp: now
          };
          
          return aggregatedCandles;
        }
        
        // For standard symbols, use proxy API
        try {
          const formattedSymbol = formatSymbol(symbol);
          console.log(`Making proxy API request for candles with params: symbol=${formattedSymbol}, interval=${convertIntervalToOKX(interval)}, limit=${limit}`);
          
          const response = await proxyApi.get('/historical', {
            params: {
              exchange: 'OKX',
              symbol: formattedSymbol,
              interval: convertIntervalToOKX(interval),
              limit
            }
          });
          
          if (!response.data || !response.data.success) {
            throw new Error(`Invalid response from proxy API: ${JSON.stringify(response.data)}`);
          }
          
          const candles = response.data.candles;
          
          // Sort candles by time to ensure they are in ascending order
          const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
          
          // Update cache
          candleCache[cacheKey] = {
            data: sortedCandles,
            timestamp: now
          };
          
          return sortedCandles;
        } catch (proxyError) {
          console.error(`Proxy API failed for candles: ${proxyError}`);
          
          // As a last resort, use mock data
          console.log('All methods failed, using mock data');
          const mockCandles = generateMockCandleData(limit);
          
          // Update cache with mock data
          candleCache[cacheKey] = {
            data: mockCandles,
            timestamp: now
          };
          
          return mockCandles;
        }
      }
    } catch (error) {
      console.error(`Failed to fetch candles from OKX for ${symbol}:`, error);
      
      // If we have cached data (even if expired), use it as a last resort
      if (candleCache[cacheKey]) {
        console.log(`Falling back to stale cached data for ${symbol} from OKX`);
        return candleCache[cacheKey].data;
      }
      
      console.log('No cached data available, falling back to mock data');
      // Return mock data as a fallback to prevent app crash
      return generateMockCandleData(limit);
    }
  },
  
  // Method to subscribe to WebSocket for real-time updates
  subscribeToRealTimeUpdates(
    symbol: string,
    interval: TimeInterval,
    handlers: WebSocketStreamHandlers = {}
  ): void {
    try {
      console.log(`Subscribing to real-time updates for ${symbol} (${interval}) on OKX`);
      
      // Format symbol for OKX WebSocket
      const formattedSymbol = formatSymbol(symbol);
      
      // Use our socketService to subscribe to updates
      socketService.subscribe('OKX', formattedSymbol, interval);
      
      // Set up handler for updates
      socketService.setHandlers({
        onUpdate: (exchange, updatedSymbol, candle) => {
          // Only handle updates for this subscription
          if (exchange === 'OKX' && updatedSymbol === formattedSymbol) {
            // Store live candle
            const liveKey = `${symbol}-${interval}`;
            liveCandles.set(liveKey, candle);
            
            // If we have an onKline handler, call it
            if (handlers.onKline) {
              handlers.onKline(candle);
            }
          }
        },
        onError: (message) => {
          console.error(`WebSocket error for ${symbol}:`, message);
          if (handlers.onError) {
            handlers.onError(new Error(message));
          }
        },
        onStatus: (connected) => {
          if (connected) {
            console.log(`WebSocket connected for ${symbol}`);
            if (handlers.onOpen) {
              handlers.onOpen(new Event('open'));
            }
          } else {
            console.log(`WebSocket disconnected for ${symbol}`);
            if (handlers.onClose) {
              handlers.onClose(new CloseEvent('close'));
            }
          }
        }
      });
    } catch (error) {
      console.error(`Failed to subscribe to real-time updates for ${symbol}:`, error);
      if (handlers.onError) {
        // Cast the error to Error | Event type to satisfy TypeScript
        handlers.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  },
  
  // Method to unsubscribe from WebSocket
  unsubscribeFromRealTimeUpdates(symbol: string, interval: TimeInterval): void {
    try {
      // Format symbol for OKX WebSocket
      const formattedSymbol = formatSymbol(symbol);
      
      console.log(`Unsubscribing from ${formattedSymbol} (${interval}) on OKX`);
      
      // Use socketService to unsubscribe
      socketService.unsubscribe('OKX', formattedSymbol, interval);
      
      // Clear the live candle for this symbol and interval
      const liveKey = `${symbol}-${interval}`;
      liveCandles.delete(liveKey);
    } catch (error) {
      console.error(`Failed to unsubscribe from ${symbol}:`, error);
    }
  },
  
  // Method to merge historical and real-time data
  async mergeHistoricalAndRealtimeData(
    symbol: string,
    interval: TimeInterval,
    limit: number = 100
  ): Promise<Candle[]> {
    try {
      // Get historical data using the standard getCandles method
      const historicalCandles = await this.getCandles(symbol, interval, limit);
      
      // Check if we have any live candle data for this symbol
      const liveKey = `${symbol}-${interval}`;
      const liveCandle = liveCandles.get(liveKey);
      
      if (!liveCandle) {
        // No live data, just return historical data
        return historicalCandles;
      }
      
      // Check if the live candle is for the current time period
      const lastHistoricalCandle = historicalCandles[historicalCandles.length - 1];
      
      if (!lastHistoricalCandle) {
        return liveCandle ? [liveCandle] : [];
      }
      
      if (liveCandle.time > lastHistoricalCandle.time) {
        // The live candle is for a newer time period, append it
        return [...historicalCandles, liveCandle];
      } else if (liveCandle.time === lastHistoricalCandle.time) {
        // The live candle is updating the last historical candle, replace it
        const updatedCandles = [...historicalCandles];
        updatedCandles[updatedCandles.length - 1] = liveCandle;
        return updatedCandles;
      }
      
      // If we get here, the live candle is older than our historical data, which shouldn't happen
      // Just return historical data
      return historicalCandles;
    } catch (error) {
      console.error(`Failed to merge historical and real-time data for ${symbol}:`, error);
      throw error;
    }
  },
  
  async getSymbols(): Promise<MarketSymbol[]> {
    // Check cache first
    const now = Date.now();
    
    if (symbolsCache.data && now - symbolsCache.timestamp < CACHE_TTL) {
      console.log('Using cached symbols data from OKX');
      return symbolsCache.data;
    }
    
    try {
      // Try using proxy API first
      try {
        const response = await proxyApi.get('/symbols', {
  params: {
    exchange: 'OKX'
  }
        });
        
        if (response.data && response.data.success && response.data.symbols) {
          // Update cache
          symbolsCache.data = response.data.symbols;
          symbolsCache.timestamp = now;
          
          return response.data.symbols;
        }
        
        throw new Error('Invalid response from proxy API');
      } catch (proxyError) {
        console.error(`Proxy API failed for symbols: ${proxyError}`);
        
        // Return default symbols as a fallback
        const defaultSymbols = [
          { symbol: 'BTC-USDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'live' },
          { symbol: 'ETH-USDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'live' },
          { symbol: 'BTC-USDC', baseAsset: 'BTC', quoteAsset: 'USDC', status: 'live' },
        ];
        
        // Update cache with default symbols
        symbolsCache.data = defaultSymbols;
        symbolsCache.timestamp = now;
        
        return defaultSymbols;
      }
    } catch (error) {
      console.error('Failed to fetch symbols from OKX:', error);
      
      // If we have cached data (even if expired), use it as a last resort
      if (symbolsCache.data) {
        console.log('Falling back to stale cached symbols data from OKX');
        return symbolsCache.data;
      }
      
      // Return default symbols as a fallback
      return [
        { symbol: 'BTC-USDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'live' },
        { symbol: 'ETH-USDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'live' },
        { symbol: 'BTC-USDC', baseAsset: 'BTC', quoteAsset: 'USDC', status: 'live' },
      ];
    }
  },
  
  async validateSymbol(symbol: string): Promise<boolean> {
    try {
      const symbols = await this.getSymbols();
      return symbols.some(s => s.symbol === formatSymbol(symbol));
    } catch {
      return false;
    }
  },
  
  // Optional method - returns empty array instead of throwing errors
  async getOpenInterest(): Promise<OpenInterest[]> {
    console.log(`Open interest data requested, but returning empty array to avoid API errors`);
    return []; // Return empty array instead of trying to fetch
  },
  
  getWebSocketUrl(): string {
    // No longer needed as we use socketService, but kept for backward compatibility
    return `wss://ws.okx.com:8443/ws/v5/public`;
  },
  
  formatSymbol
};

export default okxExchange;
console.log('okxExchange.ts module loaded');