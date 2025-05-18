// src/app/services/exchanges/bybitExchange.ts
console.log('bybitExchange.ts module loading');

import axios from 'axios';
import { Candle, MarketSymbol, OpenInterest, TimeInterval } from '../../types/market';
import { ExchangeService, WebSocketStreamHandlers } from './baseExchange';
// Replace old WebSocket imports with services
import socketService from '../socketService';
import apiService from '../apiService';

interface BybitCandleResponse {
  retCode: number;
  retMsg: string;
  result: {
    list: Array<Array<string>>;
  };
}

interface BybitSymbolsResponse {
  retCode: number;
  retMsg: string;
  result: {
    list: Array<{
      symbol: string;
      baseCoin: string;
      quoteCoin: string;
      status: string;
    }>;
  };
}

// Keep track of current live candles with a map
const liveCandles: Map<string, Candle> = new Map();

// Simple cache implementation
const symbolsCache: { data: MarketSymbol[] | null, timestamp: number } = {
  data: null,
  timestamp: 0
};

const candleCache: { [key: string]: { data: Candle[], timestamp: number } } = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Helper function for implementing retry logic
const retryOperation = async <T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 2000,
  backoff = 2
): Promise<T> => {
  try {
    return await operation();
  } catch (error: unknown) {
    if (retries <= 0) {
      throw error;
    }
    
    console.log(`Retrying operation in ${delay}ms... (${retries} attempts left)`);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return retryOperation(operation, retries - 1, delay * backoff, backoff);
  }
};

// Create API client for direct Bybit API
const directApi = axios.create({
  baseURL: 'https://api.bybit.com',
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Create API client for Bybit API via proxy for handling CORS issues
const proxyApi = axios.create({
  baseURL: '/api/proxy', // Path to your universalProxy.ts API route
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
}); 

// Add response interceptor for better error handling
directApi.interceptors.response.use(
  response => response,
  error => {
    console.error(`Bybit API error: ${error.message || 'Unknown error'}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}, Data:`, error.response.data);
    }
    return Promise.reject(error);
  }
);

// Helper function to convert interval to Bybit format
const convertIntervalToBybit = (interval: TimeInterval): string => {
  const mapping: Record<string, string> = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D',
    '1w': 'W',
    '1M': 'M'
  };
  
  return mapping[interval] || '1';
};

// Helper function to generate mock candle data
function generateMockCandleData(count: number): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  const candles: Candle[] = [];
  
  // Generate mock data based on a realistic price movement
  let price = 20000 + Math.random() * 10000; 
  
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
const bybitExchange: ExchangeService = {
  getName(): string {
    return 'Bybit';
  },
  
  async getCandles(symbol: string, interval: TimeInterval = '1m', limit = 100): Promise<Candle[]> {
    // Check cache first
    const cacheKey = `${symbol}-${interval}-${limit}`;
    const now = Date.now();
    
    if (candleCache[cacheKey] && now - candleCache[cacheKey].timestamp < CACHE_TTL) {
      console.log(`Using cached candle data for ${symbol} (${interval}) from Bybit`);
      return candleCache[cacheKey].data;
    }
    
    try {
      console.log(`Fetching candles for ${symbol}, interval=${interval}, limit=${limit}`);
      
      // Try using apiService first
      try {
        // This will use our backend proxy/service
        const candles = await apiService.getHistoricalCandles('Bybit', symbol, interval, limit);
        
        // Update cache
        candleCache[cacheKey] = {
          data: candles,
          timestamp: now
        };
        
        return candles;
      } catch (apiError) {
        console.error(`Failed to fetch candles via apiService: ${apiError}`);
        console.log('Falling back to existing implementation...');
        
        // If apiService fails, continue with the original implementation
        // Check if this is for delta aggregation (non-standard symbol)
        if (symbol.includes('USD') && symbol.length > 10) {
          console.log(`Detected aggregate symbol request: ${symbol}, will fetch individual pairs`);
          
          // Extract the base currency (e.g., BTC from BTCUSDTUSD)
          const baseRegex = /^([A-Z0-9]{3,})/;
          const match = symbol.match(baseRegex);
          const baseCurrency = match ? match[1] : 'BTC';
          
          // Common quote currencies for Bybit
          const possibleQuotes = ['USDT', 'USDC', 'USD'];
          
          // Create valid pairs
          const validPairs = possibleQuotes.map(quote => `${baseCurrency}${quote}`);
          
          console.log(`Will fetch data for these pairs: ${validPairs.join(', ')}`);
          
          // Fetch data for each valid pair
          const fetchPromises = validPairs.map(async (pair) => {
            try {
              // Use proxy API for delta aggregation to avoid CORS issues
              const response = await proxyApi.get('', {
                params: {
                  exchange: 'bybit',
                  endpoint: 'v5/market/kline',
                  category: 'spot',
                  symbol: pair.toUpperCase(),
                  interval: convertIntervalToBybit(interval),
                  limit
                }
              });
              
              const data = response.data as BybitCandleResponse;
              
              if (data.retCode !== 0) {
                console.error(`Bybit API error for ${pair}: ${data.retMsg}`);
                return { pair, candles: [], success: false };
              }
              
              const candles = data.result.list.map(candle => ({
                time: parseInt(candle[0]) / 1000,
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
              })).reverse(); // Bybit returns newest first, so reverse
              
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
        
        // For standard symbols, use direct API calls with retry and fallback to proxy
        const fetchCandles = async () => {
          try {
            // Try direct API first
            const response = await directApi.get('/v5/market/kline', {
              params: {
                category: 'spot',
                symbol: symbol.toUpperCase(),
                interval: convertIntervalToBybit(interval),
                limit
              }
            });
            
            const data = response.data as BybitCandleResponse;
            
            if (data.retCode !== 0) {
              throw new Error(`Bybit API error: ${data.retMsg}`);
            }
            
            return data.result.list.map(candle => ({
              time: parseInt(candle[0]) / 1000,
              open: parseFloat(candle[1]),
              high: parseFloat(candle[2]),
              low: parseFloat(candle[3]),
              close: parseFloat(candle[4]),
              volume: parseFloat(candle[5])
            })).reverse(); // Bybit returns newest first, so reverse
          } catch (err) {
            console.error('Direct Bybit API request failed, trying via proxy:', err);
            
            // If direct API fails (e.g., CORS), try via proxy
            const proxyResponse = await proxyApi.get('', {
              params: {
                exchange: 'bybit',
                endpoint: 'v5/market/kline',
                category: 'spot',
                symbol: symbol.toUpperCase(),
                interval: convertIntervalToBybit(interval),
                limit
              }
            });
            
            const proxyData = proxyResponse.data as BybitCandleResponse;
            
            if (proxyData.retCode !== 0) {
              throw new Error(`Bybit API error via proxy: ${proxyData.retMsg}`);
            }
            
            return proxyData.result.list.map(candle => ({
              time: parseInt(candle[0]) / 1000,
              open: parseFloat(candle[1]),
              high: parseFloat(candle[2]),
              low: parseFloat(candle[3]),
              close: parseFloat(candle[4]),
              volume: parseFloat(candle[5])
            })).reverse(); // Bybit returns newest first, so reverse
          }
        };
        
        // Use retry logic for fetching candles
        const candles = await retryOperation(fetchCandles, 3, 2000, 2);
        
        // Sort candles by time to ensure they are in ascending order
        const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
        
        // Update cache
        candleCache[cacheKey] = {
          data: sortedCandles,
          timestamp: now
        };
        
        return sortedCandles;
      }
    } catch (error) {
      console.error(`Failed to fetch candles from Bybit for ${symbol}:`, error);
      
      // If we have cached data (even if expired), use it as a last resort
      if (candleCache[cacheKey]) {
        console.log(`Falling back to stale cached data for ${symbol} from Bybit`);
        return candleCache[cacheKey].data;
      }
      
      console.log('No cached data available, falling back to mock data');
      // Return mock data as a fallback to prevent app crash
      return generateMockCandleData(limit);
    }
  },
  
  // Method to subscribe to WebSocket for real-time updates - UPDATED to use socketService
  subscribeToRealTimeUpdates(
    symbol: string,
    interval: TimeInterval,
    handlers: WebSocketStreamHandlers = {}
  ): void {
    try {
      console.log(`Subscribing to real-time updates for ${symbol} (${interval}) on Bybit`);
      
      // Use socketService to subscribe
      socketService.subscribe('Bybit', symbol, interval);
      
      // Set up handler for updates
      socketService.setHandlers({
        onUpdate: (exchange, updatedSymbol, candle) => {
          // Only handle updates for this subscription
          if (exchange === 'Bybit' && updatedSymbol === symbol) {
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
          if (connected === true) {
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
        handlers.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  },
  
  // Method to unsubscribe from WebSocket - UPDATED to use socketService
  unsubscribeFromRealTimeUpdates(symbol: string, interval: TimeInterval): void {
    try {
      console.log(`Unsubscribing from ${symbol} (${interval}) on Bybit`);
      
      // Use socketService to unsubscribe
      socketService.unsubscribe('Bybit', symbol, interval);
      
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
      console.log('Using cached symbols data from Bybit');
      return symbolsCache.data;
    }
    
    try {
      let response;
      try {
        // Try direct API first
        response = await directApi.get('/v5/market/instruments-info', {
          params: {
            category: 'spot'
          }
        });
      } catch (err) {
        console.error('Direct Bybit API request for symbols failed, trying via proxy:', err);
        
        // If direct API fails (e.g., CORS), try via proxy
        response = await proxyApi.get('', {
          params: {
            exchange: 'bybit',
            endpoint: 'v5/market/instruments-info',
            category: 'spot'
          }
        });
      }
      
      const data = response.data as BybitSymbolsResponse;
      
      if (data.retCode !== 0) {
        throw new Error(`Bybit API error: ${data.retMsg}`);
      }
      
      const symbols = data.result.list
        .filter(item => item.status === 'Trading')
        .map(item => ({
          symbol: item.symbol,
          baseAsset: item.baseCoin,
          quoteAsset: item.quoteCoin,
          status: item.status
        }));
      
      // Update cache
      symbolsCache.data = symbols;
      symbolsCache.timestamp = now;
      
      return symbols;
    } catch (error) {
      console.error('Failed to fetch symbols from Bybit:', error);
      
      // If we have cached data (even if expired), use it as a last resort
      if (symbolsCache.data) {
        console.log('Falling back to stale cached symbols data from Bybit');
        return symbolsCache.data;
      }
      
      // Return default symbols as a fallback
      return [
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'Trading' },
        { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'Trading' },
        { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', status: 'Trading' },
        { symbol: 'BTCUSDC', baseAsset: 'BTC', quoteAsset: 'USDC', status: 'Trading' },
      ];
    }
  },
  
  async validateSymbol(symbol: string): Promise<boolean> {
    try {
      const symbols = await this.getSymbols();
      return symbols.some((s: MarketSymbol) => s.symbol === symbol.toUpperCase());
    } catch {
      // For popular symbols, return true even if API fails
      const commonSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'BTCUSDC'];
      return commonSymbols.includes(symbol.toUpperCase());
    }
  },
  
  // Optional method - returns empty array instead of throwing errors
  // Optional method - returns empty array instead of throwing errors
async getOpenInterest(symbol: string, interval: TimeInterval = '1m', limit = 100): Promise<OpenInterest[]> {
  console.log(`Fetching open interest for ${symbol}, interval=${interval}, limit=${limit}`);
  
  try {
    // Use our backend API endpoint instead of direct API calls
    const response = await axios.get('http://localhost:5000/api/open-interest', {
      params: {
        exchange: 'Bybit',
        symbol: symbol,
        interval: interval,
        limit: limit
      }
    });
    
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    
    // If backend fails, fall back to proxy API
    try {
      const proxyResponse = await proxyApi.get('', {
        params: {
          exchange: 'bybit',
          endpoint: 'v5/market/open-interest',
          category: 'linear',
          symbol: symbol,
          intervalTime: convertIntervalToBybit(interval),
          limit: limit
        }
      });
      
      if (proxyResponse.data && proxyResponse.data.result && proxyResponse.data.result.list) {
        interface BybitOpenInterestResponse {
          timestamp: number;
          openInterest: string;
        }
        
        return proxyResponse.data.result.list.map((item: BybitOpenInterestResponse) => ({
          time: Math.floor(item.timestamp / 1000),
          openInterest: parseFloat(item.openInterest)
        }));
      }
    } catch (proxyError) {
      console.error('Proxy API fallback failed:', proxyError);
    }
    
    console.warn(`Could not fetch open interest data for ${symbol}, returning empty array`);
    return [];
  } catch (error) {
    console.error(`Failed to fetch open interest for ${symbol}:`, error);
    return []; // Return empty array for graceful failure
  }
},
  
// eslint-disable-next-line @typescript-eslint/no-unused-vars
getWebSocketUrl(symbol: string, stream: string): string {
  return 'wss://stream.bybit.com/v5/public/spot';
}
};

// Export the exchange service
export default bybitExchange;
console.log('bybitExchange.ts module loaded');