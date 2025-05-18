// src/app/services/apiService.ts
import axios from 'axios';
import { Candle, TimeInterval, MarketSymbol, Exchange } from '../types/market';

// Define extended candle type with source and mock information
interface ExtendedCandle extends Candle {
  source?: 'real' | 'mock' | 'historical' | 'unknown';
  isMock?: boolean;
}

// Define open interest interface
interface OpenInterest {
  time: number;
  openInterest: number;
}

// Define symbol metrics for screener
export interface SymbolMetrics {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  volumeChange24h: number;
  high24h: number;
  low24h: number;
  exchanges?: Exchange[];
  primaryExchange?: Exchange;
  volatility?: number;
  lastUpdated?: number;
}

// Define response interface
interface ApiResponse<T> {
  success: boolean;
  candles?: Candle[];
  symbols?: MarketSymbol[];
  data?: T;
  error?: string;
}

interface SymbolsResponse {
  success: boolean;
  symbols: MarketSymbol[];
  error?: string;
}

/**
 * API service for historical market data
 */
class ApiService {
  private baseUrl: string = '/api'; // Default API server URL
  private mockMode: boolean = false;
  private debugMode: boolean = true; // Enable for more detailed logging
  
  constructor() {
    console.log('Environment variables in ApiService:', {
      API_URL: process.env.NEXT_PUBLIC_API_SERVER_URL,
      WS_URL: process.env.NEXT_PUBLIC_WS_SERVER_URL
    });
    if (process.env.NEXT_PUBLIC_API_SERVER_URL) {
      this.baseUrl = process.env.NEXT_PUBLIC_API_SERVER_URL;
      this.mockMode = false;
      console.log(`ApiService: Using API server URL: ${this.baseUrl}`);
    } else {
      this.mockMode = true;
      console.log('ApiService initialized in mock mode – no API URL provided');
    }
  }
  
  /**
   * Fetch historical candles for a symbol
   */
  async getHistoricalCandles(
    exchange: string,
    symbol: string,
    interval: TimeInterval = '1m',
    limit = 100
  ): Promise<ExtendedCandle[]> {
    if (this.mockMode) {
      console.log(`Mock mode: Generating mock candles for ${exchange} ${symbol} (${interval})`);
      return this.generateMockCandles(symbol, limit, interval);
    }
    
    try {
      console.log(`Fetching historical candles for ${exchange} ${symbol} from ${this.baseUrl}/historical`);
      const response = await axios.get<ApiResponse<Candle[]>>(`${this.baseUrl}/historical`, {
        params: {
          exchange,
          symbol,
          interval,
          limit
        }
      });
      
      if (response.data && response.data.success) {
        const candles = response.data.candles || [];
        console.log(`Successfully fetched ${candles.length} historical candles`);
        
        // Ensure all timestamps are normalized to seconds format and aligned to interval
        return this.normalizeCandles(candles, interval);
      } else {
        throw new Error(response.data.error || 'Failed to fetch historical candles');
      }
    } catch (error) {
      console.error('Error fetching historical candles:', error);
      
      // Log more details about the error
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            params: error.config?.params
          }
        });
      }
      
      // In case of error, generate mock data
      console.log('Falling back to mock candle data');
      return this.generateMockCandles(symbol, limit, interval);
    }
  }
  
  /**
   * Normalize candle timestamps to ensure consistency
   */
  private normalizeCandles(candles: Candle[], interval: TimeInterval): ExtendedCandle[] {
    return candles.map(candle => {
      // Convert to seconds if in milliseconds
      const timeInSeconds = candle.time > 10000000000 ? Math.floor(candle.time / 1000) : candle.time;
      
      // Align to interval boundary
      const intervalSeconds = this.getIntervalInSeconds(interval);
      const alignedTime = Math.floor(timeInSeconds / intervalSeconds) * intervalSeconds;
      
      if (this.debugMode && timeInSeconds !== alignedTime) {
        console.log(`Normalized timestamp: ${timeInSeconds} -> ${alignedTime} (${new Date(alignedTime * 1000).toISOString()})`);
      }
      
      return {
        ...candle,
        time: alignedTime,
        source: 'historical'
      } as ExtendedCandle;
    });
  }
  
  /**
   * Get interval in seconds
   */
  private getIntervalInSeconds(interval: TimeInterval): number {
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
  }
  
  /**
   * Generate mock candle data based on the symbol with more realistic price levels
   * that align with current market prices
   */
  private generateMockCandles(symbol: string, count: number, interval: TimeInterval): ExtendedCandle[] {
    const intervalSeconds = this.getIntervalInSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    // Align "now" to interval boundary
    const alignedNow = Math.floor(now / intervalSeconds) * intervalSeconds;
    
    const candles: ExtendedCandle[] = [];
    
    // Updated prices to match current market levels
    const basePriceMap: Record<string, number> = {
      'BTC': 65000,     // Updated to match the current ~65,000 level shown in real-time data
      'ETH': 3500,
      'SOL': 150,
      'BNB': 450,
      'DOGE': 0.15,
      'XRP': 0.55,
      'ADA': 0.45,
      'AVAX': 35,
      'DOT': 6.5,
      'MATIC': 0.70
    };
    
    // Determine base price based on symbol
    let basePrice = 0;
    
    // Check if symbol contains any of the known assets
    for (const [asset, price] of Object.entries(basePriceMap)) {
      if (symbol.includes(asset)) {
        basePrice = price;
        break;
      }
    }
    
    // Default fallback if no match found
    if (basePrice === 0) {
      basePrice = 100;
    }
    
    console.log(`Using base price ${basePrice} for ${symbol}`);
    
    // Generate mock data with a trend
    let price = basePrice;
    const trend = Math.random() > 0.5 ? 1 : -1; // Random up or down trend
    
    // Smaller trend and random factors to prevent extreme divergence from base price
    const trendStrength = 0.0003; // 0.03% per candle trend
    const randomStrength = 0.005; // ±0.25% random movement
    const volatility = 0.002; // ±0.1% for high/low range
    
    for (let i = 0; i < count; i++) {
      // Calculate time (going back in time from now)
      // Ensure all timestamps are properly aligned to interval boundaries
      const time = alignedNow - (count - i) * intervalSeconds;
      
      // Generate a random price movement with trend bias
      const trendFactor = trend * (trendStrength); // Apply trend
      const randomFactor = (Math.random() - 0.5) * randomStrength; // Random noise
      const movementFactor = trendFactor + randomFactor;
      
      // Apply movement to price, ensuring price stays within a realistic range
      price = price * (1 + movementFactor);
      
      // Keep price within 5% of the base price to prevent extreme divergence
      const maxPrice = basePrice * 1.05;
      const minPrice = basePrice * 0.95;
      
      if (price > maxPrice) price = maxPrice;
      if (price < minPrice) price = minPrice;
      
      // Calculate candle values
      const open = price;
      const close = price * (1 + (Math.random() - 0.5) * 0.002); // ±0.1% from open
      const high = Math.max(open, close) * (1 + Math.random() * volatility); // Up to 0.1% above max
      const low = Math.min(open, close) * (1 - Math.random() * volatility); // Up to 0.1% below min
      const volume = Math.random() * 100 + 10;
      
      candles.push({
        time,
        open,
        high,
        low,
        close,
        volume,
        source: 'historical', // Mark as historical source
        isMock: true // But flag as mock data for visual distinction
      });
    }
    
    // Debug logging
    if (this.debugMode && candles.length > 0) {
      console.log('Generated mock candles with times:');
      candles.slice(0, 3).forEach((c, i) => {
        console.log(`Candle ${i}: time=${c.time}, date=${new Date(c.time * 1000).toISOString()}`);
      });
      
      // Log last candle as well
      const lastCandle = candles[candles.length - 1];
      console.log(`Last candle: time=${lastCandle.time}, date=${new Date(lastCandle.time * 1000).toISOString()}`);
      
      // Calculate time range
      const firstTime = candles[0].time;
      const lastTime = lastCandle.time;
      const timeRangeSeconds = lastTime - firstTime;
      const timeRangeHours = timeRangeSeconds / 3600;
      
      console.log(`Mock candles time range: ${timeRangeSeconds} seconds (${timeRangeHours.toFixed(2)} hours)`);
    }
    
    return candles;
  }
  
  /**
   * Get symbols for an exchange
   */
  async getExchangeSymbols(exchange: string): Promise<MarketSymbol[]> {
    console.log(`Attempting to fetch symbols for ${exchange} from ${this.baseUrl}/symbols`);
    
    // Force disable mock mode for this specific call
    const wasMockMode = this.mockMode;
    this.mockMode = false;
    
    try {
      const url = `${this.baseUrl}/symbols`;
      console.log(`Making API request to: ${url} with params: { exchange: ${exchange} }`);
      
      const response = await axios.get<ApiResponse<MarketSymbol[]>>(url, {
        params: { exchange }
      });
      
      // Restore original mock mode setting
      this.mockMode = wasMockMode;
      
      console.log(`API response for ${exchange} symbols:`, response.data);
      
      if (response.data && response.data.success) {
        console.log(`Successfully fetched ${response.data.symbols?.length || 0} symbols for ${exchange}`);
        return response.data.symbols || [];
      } else {
        throw new Error(response.data.error || 'Failed to fetch exchange symbols');
      }
    } catch (error) {
      // Restore original mock mode setting
      this.mockMode = wasMockMode;
      
      console.error('Error fetching exchange symbols:', error);
      
      // Log more details about the error
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            params: error.config?.params
          }
        });
      }
      
      // In case of error, generate mock data
      console.log('Falling back to mock symbol data');
      return this.generateMockSymbols(exchange);
    }
  }
  
  /**
   * Generate mock symbol data
   */
  private generateMockSymbols(exchange: string): MarketSymbol[] {
    console.log(`Generating mock symbols for ${exchange}`);
    const commonSymbols = [
      { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
      { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
      { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', status: 'TRADING' },
      { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', status: 'TRADING' },
      { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', status: 'TRADING' },
      { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', status: 'TRADING' },
      { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', status: 'TRADING' },
      { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', status: 'TRADING' },
      { symbol: 'DOTUSDT', baseAsset: 'DOT', quoteAsset: 'USDT', status: 'TRADING' },
      { symbol: 'MATICUSDT', baseAsset: 'MATIC', quoteAsset: 'USDT', status: 'TRADING' }
    ];
    
    // Add some exchange-specific symbols
    if (exchange === 'Binance') {
      return [
        ...commonSymbols,
        { symbol: 'BTCBUSD', baseAsset: 'BTC', quoteAsset: 'BUSD', status: 'TRADING' },
        { symbol: 'ETHBUSD', baseAsset: 'ETH', quoteAsset: 'BUSD', status: 'TRADING' }
      ];
    } else if (exchange === 'Bybit') {
      return [
        ...commonSymbols,
        { symbol: 'BTCUSDC', baseAsset: 'BTC', quoteAsset: 'USDC', status: 'Trading' },
        { symbol: 'ETHUSDC', baseAsset: 'ETH', quoteAsset: 'USDC', status: 'Trading' }
      ];
    } else if (exchange === 'OKX') {
      return commonSymbols.map(s => ({
        symbol: `${s.baseAsset}-${s.quoteAsset}`, // OKX uses format like BTC-USDT
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        status: 'live'
      }));
    } else if (exchange === 'MEXC') {
      return [
        ...commonSymbols,
        { symbol: 'LTCBTC', baseAsset: 'LTC', quoteAsset: 'BTC', status: 'TRADING' }
      ];
    }
    
    return commonSymbols;
  }

  // Method to test the symbols endpoint directly
  async testSymbolsEndpoint(exchange: string = 'Binance'): Promise<SymbolsResponse> {
    try {
      console.log(`Testing symbols endpoint for ${exchange}...`);
      const url = `${this.baseUrl}/symbols?exchange=${exchange}`;
      console.log(`Making direct fetch to: ${url}`);
      
      const response = await fetch(url);
      const data = await response.json() as SymbolsResponse;
      
      console.log('Symbols endpoint test response:', data);
      return data;
    } catch (error) {
      console.error('Error testing symbols endpoint:', error);
      return {
        success: false,
        symbols: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Fetch aggregated historical data for multiple symbols with the same base asset
   */
  async getAggregatedCandles(
    baseAsset: string,
    exchange: string,
    interval: TimeInterval = '1m',
    limit = 100
  ): Promise<{ candles: ExtendedCandle[], isAggregated: boolean }> {
    if (this.mockMode) {
      console.log(`Mock mode: Generating mock aggregated candles for ${baseAsset} on ${exchange} (${interval})`);
      
      // Generate mock candles for the base asset with USDT
      const symbol = `${baseAsset}USDT`;
      const candles = await this.generateMockCandles(symbol, limit, interval);
      
      return {
        candles,
        isAggregated: true
      };
    }
    
    try {
      console.log(`Fetching aggregated candles for ${baseAsset} on ${exchange} from ${this.baseUrl}/aggregated`);
      const response = await axios.get<ApiResponse<{ candles: Candle[], isAggregated: boolean }>>(`${this.baseUrl}/aggregated`, {
        params: {
          baseAsset,
          exchange,
          interval,
          limit
        }
      });
      
      if (response.data && response.data.success) {
        const result = response.data.data || { candles: [], isAggregated: false };
        const candles = result.candles || [];
        console.log(`Successfully fetched ${candles.length} aggregated candles for ${baseAsset}`);
        
        // Ensure all timestamps are normalized and aligned
        const normalizedCandles = this.normalizeCandles(candles, interval);
        
        return {
          candles: normalizedCandles,
          isAggregated: result.isAggregated
        };
      } else {
        throw new Error(response.data.error || 'Failed to fetch aggregated candles');
      }
    } catch (error) {
      console.error('Error fetching aggregated candles:', error);
      
      // Log more details about the error
      if (axios.isAxiosError(error)) {
        console.error('Axios error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            params: error.config?.params
          }
        });
      }
      
      // In case of error, generate mock data
      console.log('Falling back to mock aggregated candle data');
      const symbol = `${baseAsset}USDT`;
      const candles = await this.generateMockCandles(symbol, limit, interval);
      
      return {
        candles,
        isAggregated: true
      };
    }
  }

  /**
   * Fetch open interest data for a symbol
   */
  async getOpenInterest(
    exchange: string,
    symbol: string,
    interval: TimeInterval = '1m',
    limit: number = 100
  ): Promise<OpenInterest[]> {
    console.log(`Fetching open interest for ${exchange} ${symbol} from ${this.baseUrl}/open-interest`);
    
    // If in mock mode, generate mock open interest data
    if (this.mockMode) {
      return this.generateMockOpenInterest(symbol, limit, interval);
    }
    
    try {
      const response = await axios.get<ApiResponse<OpenInterest[]>>(`${this.baseUrl}/open-interest`, {
        params: {
          exchange,
          symbol,
          interval,
          limit
        }
      });
      
      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      
      console.warn(`Invalid response format from open interest API: ${JSON.stringify(response.data)}`);
      return this.generateMockOpenInterest(symbol, limit, interval); // Fallback to mock data
    } catch (error) {
      console.error(`Error fetching open interest data:`, error);
      return this.generateMockOpenInterest(symbol, limit, interval); // Return mock data for graceful failure
    }
  }

  /**
   * Generate mock open interest data
   */
  private generateMockOpenInterest(
    symbol: string, 
    count: number, 
    interval: TimeInterval
  ): OpenInterest[] {
    const intervalSeconds = this.getIntervalInSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    // Align "now" to interval boundary
    const alignedNow = Math.floor(now / intervalSeconds) * intervalSeconds;
    
    // Determine base open interest value based on symbol
    let baseOI = 1000000; // Default base value
    
    // Adjust base OI by symbol to make it more realistic
    if (symbol.includes('BTC')) {
      baseOI = 10000000;
    } else if (symbol.includes('ETH')) {
      baseOI = 5000000;
    } else if (symbol.includes('SOL')) {
      baseOI = 2000000;
    }
    
    const result: OpenInterest[] = [];
    let currentOI = baseOI;
    
    // Create a trend similar to price movement
    const trend = Math.random() > 0.5 ? 1 : -1;
    const trendStrength = 0.0002; // 0.02% per candle trend
    const randomStrength = 0.004; // ±0.2% random movement
    
    for (let i = 0; i < count; i++) {
      // Calculate time (going back in time from now)
      const time = alignedNow - (count - i) * intervalSeconds;
      
      // Generate a random OI movement with trend bias
      const trendFactor = trend * trendStrength;
      const randomFactor = (Math.random() - 0.5) * randomStrength;
      const movementFactor = trendFactor + randomFactor;
      
      // Apply movement to OI
      currentOI = currentOI * (1 + movementFactor);
      
      // Keep OI within reasonable bounds
      const maxOI = baseOI * 1.1;
      const minOI = baseOI * 0.9;
      
      if (currentOI > maxOI) currentOI = maxOI;
      if (currentOI < minOI) currentOI = minOI;
      
      result.push({
        time,
        openInterest: Math.round(currentOI)
      });
    }
    
    // Debug logging
    if (this.debugMode) {
      console.log(`Generated ${result.length} mock open interest data points for ${symbol}`);
    }
    
    return result;
  }

  /**
   * Get market data for an exchange
   */
  async getExchangeMarketData(exchange: string): Promise<SymbolMetrics[]> {
    try {
      console.log(`Fetching market data for ${exchange}`);
      
      const response = await axios.get<ApiResponse<SymbolMetrics[]>>(`${this.baseUrl}/market-data`, {
        params: { exchange }
      });
      
      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      
      throw new Error(`Invalid response from market data endpoint for ${exchange}`);
    } catch (error) {
      console.error(`Error fetching market data for ${exchange}:`, error);
      
      // Generate mock market data as fallback
      const symbols = await this.getExchangeSymbols(exchange);
      const mockMarketData = symbols.map(symbol => this.generateMockMarketData(symbol, exchange as Exchange));
      
      return mockMarketData;
    }
  }

  /**
   * Generate mock market data for a symbol
   */
  private generateMockMarketData(symbol: MarketSymbol, exchange: Exchange): SymbolMetrics {
    // Base price determined by asset
    const basePrice = 
      symbol.baseAsset === 'BTC' ? 65000 :
      symbol.baseAsset === 'ETH' ? 3500 :
      symbol.baseAsset === 'SOL' ? 150 :
      symbol.baseAsset === 'BNB' ? 450 :
      symbol.baseAsset === 'ADA' ? 0.45 :
      symbol.baseAsset === 'DOGE' ? 0.15 :
      symbol.baseAsset === 'XRP' ? 0.55 :
      symbol.baseAsset === 'AVAX' ? 35 :
      symbol.baseAsset === 'DOT' ? 6.5 :
      symbol.baseAsset === 'MATIC' ? 0.70 : 
      10; // Default price
    
    // Add some random variation
    const price = basePrice * (1 + (Math.random() * 0.02 - 0.01)); // ±1%
    
    // Generate price change
    const priceChange = (Math.random() * 10 - 5); // -5% to +5%
    
    // Generate volume based on price
    const volume = price * (1000 + Math.random() * 5000);
    
    return {
      symbol: symbol.symbol,
      baseAsset: symbol.baseAsset,
      quoteAsset: symbol.quoteAsset,
      price,
      priceChange24h: priceChange,
      volume24h: volume,
      volumeChange24h: Math.random() * 20 - 10, // -10% to +10%
      high24h: price * (1 + Math.random() * 0.05), // Up to 5% higher
      low24h: price * (1 - Math.random() * 0.05), // Up to 5% lower
      exchanges: [exchange],
      primaryExchange: exchange,
      volatility: Math.random() * 5, // 0-5% volatility
      lastUpdated: Date.now()
    };
  }

  /**
   * Get top symbols by various metrics
   */
  async getTopSymbols(
    metric: 'volume' | 'price_change' | 'volatility' = 'volume',
    limit: number = 20,
    exchanges?: string[]
  ): Promise<SymbolMetrics[]> {
    try {
      const params: Record<string, any> = { 
        metric, 
        limit 
      };
      
      if (exchanges && exchanges.length > 0) {
        params.exchanges = exchanges.join(',');
      }
      
      const response = await axios.get<ApiResponse<SymbolMetrics[]>>(`${this.baseUrl}/top-symbols`, { params });
      
      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      
      throw new Error('Invalid response from top symbols endpoint');
    } catch (error) {
      console.error('Error fetching top symbols:', error);
      
      // Generate mock top symbols data as fallback
      const allExchanges = exchanges || ['Binance', 'OKX', 'Bybit', 'MEXC'];
      const allSymbols: SymbolMetrics[] = [];
      
      // Get symbols from each exchange
      for (const exchange of allExchanges) {
        try {
          const symbols = await this.getExchangeSymbols(exchange);
          const marketData = symbols.map(symbol => 
            this.generateMockMarketData(symbol, exchange as Exchange)
          );
          allSymbols.push(...marketData);
        } catch (error) {
          console.error(`Error fetching symbols for ${exchange}:`, error);
        }
      }
      
      // Sort based on metric
      let sortedSymbols = [...allSymbols];
      if (metric === 'volume') {
        sortedSymbols.sort((a, b) => b.volume24h - a.volume24h);
      } else if (metric === 'price_change') {
        sortedSymbols.sort((a, b) => b.priceChange24h - a.priceChange24h);
      } else if (metric === 'volatility') {
        sortedSymbols.sort((a, b) => b.volatility! - a.volatility!);
      }
      
      // Apply limit
      return sortedSymbols.slice(0, limit);
    }
  }
}

// Create singleton instance
const apiService = new ApiService();

// Add a global test function
if (typeof window !== 'undefined') {
  // Add type to window object
  interface CustomWindow extends Window {
    testSymbolsEndpoint: (exchange?: string) => Promise<SymbolsResponse>;
    apiService: typeof apiService;
  }
  
  // Set the function with proper typing
  ((window as unknown) as CustomWindow).testSymbolsEndpoint = async (exchange = 'Binance') => {
    return await apiService.testSymbolsEndpoint(exchange);
  };
  
  // Expose apiService for debugging
  ((window as unknown) as CustomWindow).apiService = apiService;
}

export default apiService;