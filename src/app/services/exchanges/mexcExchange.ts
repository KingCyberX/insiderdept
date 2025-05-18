// src/app/services/exchanges/mexcExchange.ts
console.log('mexcExchange.ts module loading');

import axios from 'axios';
import { Candle, MarketSymbol, OpenInterest, TimeInterval } from '../../types/market';
import { ExchangeService, WebSocketStreamHandlers } from './baseExchange';
import socketService from '../socketService';
import apiService from '../apiService';

// Define types for MEXC API responses
interface MexcKlineData {
  0: number;   // Open time
  1: string;   // Open
  2: string;   // High
  3: string;   // Low
  4: string;   // Close
  5: string;   // Volume
  [key: number]: string | number;
}

interface MexcSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

// Define types for Binance API responses too
interface BinanceKlineData {
  0: number;   // Open time
  1: string;   // Open
  2: string;   // High
  3: string;   // Low
  4: string;   // Close
  5: string;   // Volume
  [key: number]: string | number;
}

interface BinanceSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
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

// Default symbols to use when API is unavailable
const DEFAULT_SYMBOLS: MarketSymbol[] = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', status: 'TRADING' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', status: 'TRADING' },
  { symbol: 'LTCBTC', baseAsset: 'LTC', quoteAsset: 'BTC', status: 'TRADING' },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', status: 'TRADING' },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', status: 'TRADING' },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', status: 'TRADING' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', status: 'TRADING' },
];

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

// Helper function to convert interval to MEXC format
const convertIntervalToMexc = (interval: TimeInterval): string => {
  // MEXC uses the standard intervals format
  return interval;
};

// Create API client for proxy
const proxyApi = axios.create({
  baseURL: '/api', // Changed to use our new proxy
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Create the exchange service implementation
const mexcExchange: ExchangeService = {
  getName(): string {
    return 'MEXC';
  },
  
  async getCandles(symbol: string, interval: TimeInterval = '1m', limit = 100): Promise<Candle[]> {
    // Check cache first
    const cacheKey = `${symbol}-${interval}-${limit}`;
    const now = Date.now();
    
    if (candleCache[cacheKey] && now - candleCache[cacheKey].timestamp < CACHE_TTL) {
      console.log(`Using cached candle data for ${symbol} (${interval}) from MEXC`);
      return candleCache[cacheKey].data;
    }
    
    try {
      console.log(`Fetching candles for ${symbol}, interval=${interval}, limit=${limit}`);
      
      // Try using apiService first
      try {
        // This will use our backend proxy
        const candles = await apiService.getHistoricalCandles('MEXC', symbol, interval, limit);
        
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
          
          // Common quote currencies for MEXC
          const possibleQuotes = ['USDT', 'USDC', 'USD'];
          
          // Create valid pairs
          const validPairs = possibleQuotes.map(quote => `${baseCurrency}${quote}`);
          
          console.log(`Will fetch data for these pairs: ${validPairs.join(', ')}`);
          
          // Fetch data for each valid pair
          const fetchPromises = validPairs.map(async (pair) => {
            try {
              // Try direct API call
              try {
                const response = await axios.get(`https://api.mexc.com/api/v3/klines`, {
                  params: {
                    symbol: pair,
                    interval: convertIntervalToMexc(interval),
                    limit: limit
                  },
                  timeout: 10000
                });
                
                if (!Array.isArray(response.data)) {
                  console.error(`Unexpected response format for ${pair} from MEXC`);
                  return { pair, candles: [], success: false };
                }
                
                const candles = response.data.map((candle: MexcKlineData) => ({
                  time: Math.floor(candle[0] / 1000),
                  open: parseFloat(candle[1]),
                  high: parseFloat(candle[2]),
                  low: parseFloat(candle[3]),
                  close: parseFloat(candle[4]),
                  volume: parseFloat(candle[5]),
                }));
                
                return { pair, candles, success: candles.length > 0 };
              } catch {
                // Try Binance as a fallback for the same pair
                try {
                  console.log(`Falling back to Binance for ${pair}`);
                  const binanceResponse = await axios.get(`https://api.binance.com/api/v3/klines`, {
                    params: {
                      symbol: pair,
                      interval: interval,
                      limit: limit
                    },
                    timeout: 10000
                  });
                  
                  if (Array.isArray(binanceResponse.data)) {
                    const candles = binanceResponse.data.map((candle: BinanceKlineData) => ({
                      time: Math.floor(candle[0] / 1000),
                      open: parseFloat(candle[1]),
                      high: parseFloat(candle[2]),
                      low: parseFloat(candle[3]),
                      close: parseFloat(candle[4]),
                      volume: parseFloat(candle[5]),
                    }));
                    
                    return { pair, candles, success: candles.length > 0 };
                  }
                } catch (binanceError) {
                  console.error(`Binance fallback for ${pair} also failed:`, binanceError);
                }
                
                console.error(`Failed to fetch data for ${pair}`);
                return { pair, candles: [], success: false };
              }
            } catch (finalError) {
              console.error(`All attempts failed for ${pair}:`, finalError);
              return { pair, candles: [], success: false };
            }
          });
          
          const results = await Promise.all(fetchPromises);
          const successfulResults = results.filter(r => r.success && r.candles.length > 0);
          
          if (successfulResults.length === 0) {
            throw new Error(`No data fetched for any pairs for ${symbol}`);
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
        
        // For standard symbols, use direct API calls with fallback
        const fetchCandles = async () => {
          try {
            console.log('Using direct API call for MEXC data...');
            
            // Try direct API call to MEXC
            try {
              const response = await axios.get(`https://api.mexc.com/api/v3/klines`, {
                params: {
                  symbol: symbol.toUpperCase(),
                  interval: convertIntervalToMexc(interval),
                  limit: limit
                },
                timeout: 10000
              });
              
              if (Array.isArray(response.data)) {
                return response.data.map((candle: MexcKlineData) => ({
                  time: Math.floor(candle[0] / 1000),
                  open: parseFloat(candle[1]),
                  high: parseFloat(candle[2]),
                  low: parseFloat(candle[3]),
                  close: parseFloat(candle[4]),
                  volume: parseFloat(candle[5]),
                }));
              }
              
              throw new Error("Invalid response format from MEXC API");
            } catch {
              // If MEXC fails, try Binance for the same symbol if it's a common one
              console.log('MEXC API call failed, trying Binance as fallback...');
              
              const binanceResponse = await axios.get(`https://api.binance.com/api/v3/klines`, {
                params: {
                  symbol: symbol.toUpperCase(),
                  interval: interval, // Binance uses same interval format
                  limit: limit
                },
                timeout: 10000
              });
              
              if (Array.isArray(binanceResponse.data)) {
                console.log('Successfully fetched data from Binance as fallback');
                return binanceResponse.data.map((candle: BinanceKlineData) => ({
                  time: Math.floor(candle[0] / 1000),
                  open: parseFloat(candle[1]),
                  high: parseFloat(candle[2]),
                  low: parseFloat(candle[3]),
                  close: parseFloat(candle[4]),
                  volume: parseFloat(candle[5]),
                }));
              }
              
              throw new Error("Could not fetch data from any source");
            }
          } catch (error) {
            console.error('MEXC data fetch failed:', error);
            throw error; // Let the retry logic handle this
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
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`Failed to fetch candles from MEXC for ${symbol}:`, error);
      
      // If we have cached data (even if expired), use it as a last resort
      if (candleCache[cacheKey]) {
        console.log(`Falling back to stale cached data for ${symbol} from MEXC`);
        return candleCache[cacheKey].data;
      }
      
      throw new Error(`Cannot fetch MEXC data for ${symbol}: ${error.message}`);
    }
  },
  
  // Method to subscribe to WebSocket for real-time updates
  subscribeToRealTimeUpdates(
    symbol: string,
    interval: TimeInterval,
    handlers: WebSocketStreamHandlers = {}
  ): void {
    try {
      console.log(`Subscribing to real-time updates for ${symbol} (${interval}) on MEXC`);
      
      // Use our socketService to subscribe to updates
      socketService.subscribe('MEXC', symbol, interval);
      
      // Set up handler for updates
      socketService.setHandlers({
        onUpdate: (exchange, updatedSymbol, candle) => {
          // Only handle updates for this subscription
          if (exchange === 'MEXC' && updatedSymbol === symbol) {
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
      console.log(`Unsubscribing from ${symbol} (${interval}) on MEXC`);
      
      // Use socketService to unsubscribe
      socketService.unsubscribe('MEXC', symbol, interval);
      
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
      console.log('Using cached symbols data from MEXC');
      return symbolsCache.data;
    }
    
    try {
      // Try using proxy API first
      try {
        const response = await proxyApi.get('/historical', {
          params: {
            exchange: 'MEXC',
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
        console.log('Falling back to direct API...');
        
        // Use direct API call to fetch symbols
        try {
          const response = await axios.get('https://api.mexc.com/api/v3/exchangeInfo');
          
          if (!response.data || !response.data.symbols || !Array.isArray(response.data.symbols)) {
            throw new Error(`Unexpected response format from MEXC exchange info`);
          }
          
          const symbols = response.data.symbols
            .filter((symbol: MexcSymbol) => symbol.status === 'TRADING')
            .map((symbol: MexcSymbol) => ({
              symbol: symbol.symbol,
              baseAsset: symbol.baseAsset,
              quoteAsset: symbol.quoteAsset,
              status: symbol.status
            }));
          
          // Update cache
          symbolsCache.data = symbols;
          symbolsCache.timestamp = now;
          
          return symbols;
        } catch {
          // Try Binance as a fallback
          console.log('MEXC symbols API call failed, trying Binance as fallback...');
          
          const binanceResponse = await axios.get('https://api.binance.com/api/v3/exchangeInfo');
          
          if (!binanceResponse.data || !binanceResponse.data.symbols || !Array.isArray(binanceResponse.data.symbols)) {
            throw new Error(`Unexpected response format from Binance exchange info`);
          }
          
          const symbols = binanceResponse.data.symbols
            .filter((symbol: BinanceSymbol) => symbol.status === 'TRADING')
            .map((symbol: BinanceSymbol) => ({
              symbol: symbol.symbol,
              baseAsset: symbol.baseAsset,
              quoteAsset: symbol.quoteAsset,
              status: symbol.status
            }));
          
          // Update cache
          symbolsCache.data = symbols;
          symbolsCache.timestamp = now;
          
          return symbols;
        }
      }
    } catch (error) {
      console.error('Failed to fetch symbols from any source:', error);
      
      // If we have cached data (even if expired), use it as a last resort
      if (symbolsCache.data) {
        console.log('Falling back to stale cached symbols data');
        return symbolsCache.data;
      }
      
      // Return default symbols as a last resort
      console.log('Using default symbols as fallback');
      return DEFAULT_SYMBOLS;
    }
  },
  
  async validateSymbol(symbol: string): Promise<boolean> {
    try {
      const symbols = await this.getSymbols();
      return symbols.some((s: MarketSymbol) => s.symbol === symbol.toUpperCase());
    } catch {
      // For popular symbols, return true even if API fails
      const commonSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'LTCBTC', 'DOGEUSDT'];
      return commonSymbols.includes(symbol.toUpperCase());
    }
  },
  
  // Optional method - returns empty array
  async getOpenInterest(symbol: string, interval: TimeInterval = '1m', limit = 100): Promise<OpenInterest[]> {
  console.log(`Fetching open interest for ${symbol}, interval=${interval}, limit=${limit}`);
  
  try {
    // Use proxy API to fetch open interest
    const response = await proxyApi.get('/open-interest', {
      params: {
        exchange: 'MEXC',
        symbol: symbol,
        interval: interval,
        limit: limit
      }
    });
    
    if (response.data && response.data.openInterest) {
      interface OpenInterestResponse {
        timestamp: number;
        openInterest: number;
      }
      
      return response.data.openInterest.map((item: OpenInterestResponse) => ({
        time: Math.floor(item.timestamp / 1000),
        openInterest: item.openInterest
      }));
    }
    
    // MEXC doesn't have a direct API for open interest that we can use
    // Try to use Binance as fallback for the same symbol
    console.log('MEXC open interest not available, trying Binance as fallback...');
    
    try {
      const binanceResponse = await axios.get(
        'https://fapi.binance.com/fapi/v1/openInterest/hist',
        {
          params: {
            symbol: symbol,
            period: interval,
            limit: limit
          },
          timeout: 10000
        }
      );
      
      if (Array.isArray(binanceResponse.data)) {
        interface BinanceFuturesResponse {
          timestamp: number;
          sumOpenInterest: string;
        }
        
        return binanceResponse.data.map((item: BinanceFuturesResponse) => ({
          time: Math.floor(item.timestamp / 1000),
          openInterest: parseFloat(item.sumOpenInterest)
        }));
      }
    } catch (binanceError) {
      console.error('Binance fallback for open interest failed:', binanceError);
    }
    
    console.warn(`Could not fetch open interest data for ${symbol}, returning empty array`);
    return [];
  } catch (error) {
    console.error(`Failed to fetch open interest for ${symbol}:`, error);
    return []; // Return empty array for graceful failure
  }
},
  
  getWebSocketUrl(): string {
    // No longer needed as we use socketService, but kept for backward compatibility
    return `wss://stream.mexc.com/ws`;
  }
};

// Export the exchange service
export default mexcExchange;
console.log('mexcExchange.ts module loaded');