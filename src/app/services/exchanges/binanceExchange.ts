// src/app/services/exchanges/binanceExchange.ts
console.log('binanceExchange.ts module loading');

import axios from 'axios';
import { Candle, MarketSymbol, OpenInterest, TimeInterval } from '../../types/market';
import { ExchangeService } from './baseExchange';
import type { WebSocketStreamHandlers } from './baseExchange';
import socketService from '../socketService';
import apiService from '../apiService';

// Extended Candle interface for source tracking
interface ExtendedCandle extends Candle {
  source?: 'real' | 'mock' | 'historical' | 'unknown';
  isMock?: boolean;
}

// Keep track of current live candles with a map
const liveCandles: Map<string, ExtendedCandle> = new Map();

// Simple cache implementation
const symbolsCache: { data: MarketSymbol[] | null, timestamp: number } = {
  data: null,
  timestamp: 0
};

const candleCache: { [key: string]: { data: ExtendedCandle[], timestamp: number } } = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Helper function for implementing retry logic
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// Create API client for proxy
const proxyApi = axios.create({
  baseURL: '/api', // Changed to use our new proxy
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add response interceptor for better error handling
proxyApi.interceptors.response.use(
  response => response,
  error => {
    console.error(`API error: ${error.message || 'Unknown error'}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}, Data:`, error.response.data);
    }
    return Promise.reject(error);
  }
);

// Helper function to ensure timestamps are in seconds format
const ensureSecondsTimestamp = (time: number): number => {
  return time > 10000000000 ? Math.floor(time / 1000) : time;
};

// Helper function to align timestamps to interval boundaries
const alignTimeToInterval = (time: number, interval: TimeInterval): number => {
  const timeInSeconds = ensureSecondsTimestamp(time);
  const intervalSeconds = getIntervalInSeconds(interval);
  return Math.floor(timeInSeconds / intervalSeconds) * intervalSeconds;
};

// Helper function to convert interval to seconds
const getIntervalInSeconds = (interval: TimeInterval): number => {
  switch (interval) {
    case '1m': return 60;
    case '5m': return 300;
    case '15m': return 900;
    case '30m': return 1800;
    case '1h': return 3600;
    case '4h': return 14400;
    case '1d': return 86400;
    default: return 60; // Default to 1 minute
  }
};

// Helper function to generate mock candle data
function generateMockCandleData(symbol: string, count: number, interval: TimeInterval = '1m'): ExtendedCandle[] {
  // Calculate aligned end time (current time aligned to interval)
  const now = Math.floor(Date.now() / 1000);
  const intervalSeconds = getIntervalInSeconds(interval);
  const alignedNow = Math.floor(now / intervalSeconds) * intervalSeconds;
  
  const candles: ExtendedCandle[] = [];
  
  // Determine base price based on symbol
  let basePrice = 0;
  if (symbol.includes('BTC')) {
    basePrice = 65000;
  } else if (symbol.includes('ETH')) {
    basePrice = 3500;
  } else if (symbol.includes('BNB')) {
    basePrice = 450;
  } else if (symbol.includes('SOL')) {
    basePrice = 150;
  } else if (symbol.includes('DOGE')) {
    basePrice = 0.15;
  } else if (symbol.includes('XRP')) {
    basePrice = 0.55;
  } else {
    basePrice = 100; // Default price for unknown symbols
  }
  
  console.log(`Generating mock data for ${symbol} with base price ${basePrice}`);
  
  // Generate mock data based on a realistic price movement
  let price = basePrice;
  const trend = Math.random() > 0.5 ? 1 : -1; // Random trend direction
  
  for (let i = 0; i < count; i++) {
    // Calculate aligned timestamp for each candle going back from now
    const time = alignedNow - (count - i - 1) * intervalSeconds;
    
    // Generate a random price movement (with some trend)
    const trendFactor = trend * 0.0002; // Consistent trend direction
    const randomFactor = (Math.random() - 0.5) * 0.004; // Random noise
    price = price * (1 + trendFactor + randomFactor);
    
    // Keep price within reasonable bounds
    const maxPrice = basePrice * 1.05;
    const minPrice = basePrice * 0.95;
    if (price > maxPrice) price = maxPrice;
    if (price < minPrice) price = minPrice;
    
    // Calculate candle values
    const open = price;
    const close = price * (1 + (Math.random() - 0.5) * 0.002); // ±0.1% from open
    const high = Math.max(open, close) * (1 + Math.random() * 0.001); // Up to 0.1% above max
    const low = Math.min(open, close) * (1 - Math.random() * 0.001); // Up to 0.1% below min
    const volume = Math.random() * 100 + 10; // Random volume
    
    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume,
      source: 'historical', // Mark as historical source
      isMock: true // But flag it as mock data
    });
  }
  
  return candles;
}

// Create the exchange service implementation
const binanceExchange: ExchangeService = {
  getName(): string {
    return 'Binance';
  },
  
  async getCandles(symbol: string, interval: TimeInterval = '1m', limit = 100): Promise<Candle[]> {
    // Check cache first
    const cacheKey = `${symbol}-${interval}-${limit}`;
    const now = Date.now();
    
    if (candleCache[cacheKey] && now - candleCache[cacheKey].timestamp < CACHE_TTL) {
      console.log(`Using cached candle data for ${symbol} (${interval}) from Binance`);
      return candleCache[cacheKey].data;
    }
    
    try {
      console.log(`Fetching candles for ${symbol}, interval=${interval}, limit=${limit}`);
      
      try {
        // Try using apiService first
        const candles = await apiService.getHistoricalCandles('Binance', symbol, interval, limit);
        
        // Ensure all timestamps are normalized to seconds and aligned to interval
        const normalizedCandles: ExtendedCandle[] = candles.map(candle => {
          // Convert timestamp to seconds and align to interval
          const alignedTime = alignTimeToInterval(candle.time, interval);
          
          return {
            ...candle,
            time: alignedTime,
            source: 'historical'
          };
        });
        
        // Update cache
        candleCache[cacheKey] = {
          data: normalizedCandles,
          timestamp: now
        };
        
        return normalizedCandles;
      } catch (apiError) {
        console.error(`Failed to fetch candles via apiService: ${apiError}`);
        console.log('Falling back to proxy API...');
        
        // Try using proxy API as fallback
        const response = await proxyApi.get('/historical', {
          params: {
            exchange: 'Binance',
            symbol: symbol,
            interval: interval,
            limit: limit
          }
        });
        
        if (response.data && response.data.candles) {
          const candles = response.data.candles;
          
          // Normalize timestamps to seconds and align to interval
const normalizedCandles: ExtendedCandle[] = candles.map((candle: Candle) => {
  const alignedTime = alignTimeToInterval(candle.time, interval);
  
  return {
    ...candle,
    time: alignedTime,
    source: 'historical'
  };
});
          
          // Update cache
          candleCache[cacheKey] = {
            data: normalizedCandles,
            timestamp: now
          };
          
          return normalizedCandles;
        }
        
        throw new Error('Failed to fetch candles from all sources');
      }
    } catch (error) {
      console.error(`Failed to fetch candles from Binance for ${symbol}:`, error);
      
      // If we have cached data (even if expired), use it as a last resort
      if (candleCache[cacheKey]) {
        console.log(`Falling back to stale cached data for ${symbol} from Binance`);
        return candleCache[cacheKey].data;
      }
      
      console.log('No cached data available, falling back to mock data');
      // Return mock data as a fallback to prevent app crash
      return generateMockCandleData(symbol, limit, interval);
    }
  },
  
  // Method to subscribe to WebSocket for real-time updates with improved error handling
  subscribeToRealTimeUpdates(
    symbol: string,
    interval: TimeInterval,
    handlers: WebSocketStreamHandlers = {}
  ): void {
    try {
      console.log(`Subscribing to real-time updates for ${symbol} (${interval}) on Binance`);
      
      // Create subscription handlers that specifically handle this symbol
      const subscriptionHandlers = {
        onUpdate: (exchange: string, updatedSymbol: string, candle: ExtendedCandle) => {
          // Only handle updates for this subscription
          if (exchange === 'Binance' && updatedSymbol === symbol) {
            // Ensure timestamp is normalized and aligned
            const alignedTime = alignTimeToInterval(candle.time, interval);
            
            // Apply source tag based on the candle data
            const sourceType = candle.isMock ? 'mock' : 'real';
            
            // Create a normalized candle with aligned timestamp
            const normalizedCandle: ExtendedCandle = {
              ...candle,
              time: alignedTime,
              source: sourceType
            };
            
            // Store live candle
            const liveKey = `${symbol}-${interval}`;
            liveCandles.set(liveKey, normalizedCandle);
            
            // If we have an onKline handler, call it with the normalized candle
            if (handlers.onKline) {
              handlers.onKline(normalizedCandle);
            }
          }
        },
        onError: (message: string) => {
          console.error(`WebSocket error for ${symbol}:`, message);
          if (handlers.onError) {
            handlers.onError(new Error(message));
          }
        },
        onStatus: (connected: boolean) => {
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
      };
      
      // Subscribe with these specific handlers
      socketService.subscribe('Binance', symbol, interval, 'kline', subscriptionHandlers);
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
      console.log(`Unsubscribing from ${symbol} (${interval}) on Binance`);
      
      // Use socketService to unsubscribe
      socketService.unsubscribe('Binance', symbol, interval);
      
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
      // Get historical data
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
      
      // Normalize both timestamps to ensure consistent comparison
      const normalizedLiveTime = alignTimeToInterval(liveCandle.time, interval);
      const normalizedHistoricalTime = alignTimeToInterval(lastHistoricalCandle.time, interval);
      
      if (normalizedLiveTime > normalizedHistoricalTime) {
        // The live candle is for a newer time period, append it
        return [...historicalCandles, liveCandle];
      } else if (normalizedLiveTime === normalizedHistoricalTime) {
        // The live candle is updating the last historical candle, replace it
        // But only if the source prioritization allows it:
        // real > historical > mock
        const updatedCandles = [...historicalCandles];
        const lastIndex = updatedCandles.length - 1;
        
        const lastCandle = updatedCandles[lastIndex] as ExtendedCandle;
        const lastSource = lastCandle.source || 'unknown';
        const liveSource = liveCandle.source || 'unknown';
        
        // Only update if live data source has higher priority
        if (
          (liveSource === 'real') || 
          (liveSource === 'historical' && lastSource !== 'real') ||
          (liveSource === 'mock' && lastSource === 'mock')
        ) {
          updatedCandles[lastIndex] = liveCandle;
        }
        
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
      console.log('Using cached symbols data from Binance');
      return symbolsCache.data;
    }
    
    try {
      try {
        // Try using apiService first
        const symbols = await apiService.getExchangeSymbols('Binance');
        
        // Update cache
        symbolsCache.data = symbols;
        symbolsCache.timestamp = now;
        
        return symbols;
      } catch (apiError) {
        console.error(`Failed to fetch symbols via apiService: ${apiError}`);
        console.log('Falling back to proxy API...');
        
        // FIXED: Change endpoint to use the correct path that server expects
        const response = await proxyApi.get('/exchange-info', {
          params: {
            exchange: 'Binance'
          }
        });
        
        // Parse symbols from response
        if (!response.data || !response.data.symbols) {
          throw new Error('Invalid response format from exchange info endpoint');
        }
        
        const symbols = response.data.symbols
          .filter((item: Record<string, unknown>) => item.status === 'TRADING')
          .map((item: Record<string, unknown>) => ({
            symbol: item.symbol as string,
            baseAsset: item.baseAsset as string,
            quoteAsset: item.quoteAsset as string,
            status: item.status as string
          }));
        
        // Update cache
        symbolsCache.data = symbols;
        symbolsCache.timestamp = now;
        
        return symbols;
      }
    } catch (error) {
      console.error('Failed to fetch symbols from Binance:', error);
      
      // If we have cached data (even if expired), use it as a last resort
      if (symbolsCache.data) {
        console.log('Falling back to stale cached symbols data from Binance');
        return symbolsCache.data;
      }
      
      // Return default symbols as a fallback
      return [
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'DOTUSDT', baseAsset: 'DOT', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'MATICUSDT', baseAsset: 'MATIC', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'BTCBUSD', baseAsset: 'BTC', quoteAsset: 'BUSD', status: 'TRADING' },
        { symbol: 'ETHBUSD', baseAsset: 'ETH', quoteAsset: 'BUSD', status: 'TRADING' },
      ];
    }
  },
  
  async validateSymbol(symbol: string): Promise<boolean> {
    try {
      const symbols = await this.getSymbols();
      return symbols.some((s: MarketSymbol) => s.symbol === symbol.toUpperCase());
    } catch {
      // For popular symbols, return true even if API fails
      const commonSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'BTCBUSD'];
      return commonSymbols.includes(symbol.toUpperCase());
    }
  },
  
  // Optional method - returns empty array instead of throwing errors
async getOpenInterest(symbol: string, interval: TimeInterval = '1m', limit = 100): Promise<OpenInterest[]> {
  console.log(`Fetching open interest for ${symbol}, interval=${interval}, limit=${limit}`);
  
  try {
    // Use our backend API endpoint instead of direct API calls
    const response = await axios.get('http://localhost:5000/api/open-interest', {
      params: {
        exchange: 'Binance',
        symbol: symbol,
        interval: interval,
        limit: limit
      }
    });
    
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    
    console.warn(`Could not fetch open interest data for ${symbol}, returning empty array`);
    return [];
  } catch (error) {
    console.error(`Failed to fetch open interest for ${symbol}:`, error);
    return []; // Return empty array on error for graceful failure
  }
},
  
getWebSocketUrl(symbol: string, stream: string): string {
  // No longer needed as we use socketService, but kept for backward compatibility
  if (stream === 'kline') {
    const formattedSymbol = symbol.toLowerCase();
    return `wss://stream.binance.com:9443/ws/${formattedSymbol}@kline_1m`;
  }
  
  return 'wss://stream.binance.com:9443/ws';
}
};

// Export the exchange service
export default binanceExchange;
console.log('binanceExchange.ts module loaded');