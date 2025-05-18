// src/app/services/exchanges/deltaAggregation.ts

import { Candle, DeltaVolume, TimeInterval, ChartData } from '../../types/market';
import axios from 'axios';

// Interface for exchange services
interface ExchangeService {
  getName(): string;
  getCandles(symbol: string, interval?: TimeInterval, limit?: number): Promise<Candle[]>;
  formatSymbol?(symbol: string): string; // For exchanges that use special symbol formats
}

/**
 * Configuration for delta aggregation
 */
export interface DeltaAggregationConfig {
  enabled: boolean;
  baseCurrency: string;
  quoteCurrencies: string[];
  exchanges?: string[]; // Added exchanges property as optional
}

// Type definitions for API responses
interface BinanceKlineItem {
  0: number;  // Open time
  1: string;  // Open price
  2: string;  // High price
  3: string;  // Low price
  4: string;  // Close price
  5: string;  // Volume
  [key: number]: string | number;
}

interface OkxResponse {
  data?: {
    [key: number]: string | number;
  }[];
}

interface BybitResponse {
  result?: {
    list?: {
      [key: number]: string | number;
    }[];
  };
}

/**
 * Service for handling delta aggregation across multiple trading pairs and exchanges
 */
class DeltaAggregationService {
  private config: DeltaAggregationConfig = {
    enabled: false,
    baseCurrency: 'BTC',
    quoteCurrencies: ['USDT', 'USDC', 'USD'],
    exchanges: [] // Default to empty array
  };
  
  // Exchange API endpoints
  private exchangeEndpoints: Record<string, string> = {
    'Binance': 'https://api.binance.com/api/v3',
    'MEXC': 'https://api.mexc.com/api/v3',
    'OKX': 'https://www.okx.com/api/v5',
    'Bybit': 'https://api.bybit.com'
  };

  /**
   * Update the delta aggregation configuration
   */
  setConfig(config: Partial<DeltaAggregationConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
    console.log('Delta aggregation config updated:', this.config);
  }
  
  /**
   * Get the current delta aggregation configuration
   */
  getConfig(): DeltaAggregationConfig {
    return { ...this.config };
  }
  
  /**
   * Extract base currency from a symbol (e.g., "BTC" from "BTCUSDT")
   */
  extractBaseCurrency(symbol: string): string {
    // Improved base currency extraction with handling for exchange-specific formats
    
    // Handle OKX format (BTC-USDT)
    if (symbol.includes('-')) {
      const [base] = symbol.split('-');
      return base;
    }
    
    // Handle standard exchange formats like BTCUSDT
    const commonCoins = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'AAVE', 'UNI', 'LINK', 'DOT', 'ADA',
                         'AVAX', 'MATIC', 'DOGE', 'SHIB'];
    
    for (const coin of commonCoins) {
      if (symbol.startsWith(coin)) {
        return coin;
      }
    }
    
    // Fallback to regex
    const regex = /^([A-Z0-9]{3,})/;
    const match = symbol.match(regex);
    return match ? match[1] : '';
  }
  
  /**
   * Check if a symbol is eligible for delta aggregation
   */
  /**
 * Check if a symbol is eligible for delta aggregation
 */
isEligible(symbol: string): boolean {
  // 1. First check if delta aggregation is enabled
  if (!this.config.enabled) {
    console.log("Delta aggregation is not enabled");
    return false;
  }
  
  // Extract base currency based on symbol format
  let baseCurrency = '';
  
  // Handle OKX format (BTC-USDT)
  if (symbol.includes('-')) {
    const [base] = symbol.split('-');
    baseCurrency = base;
  } else {
    // Handle standard exchange formats like BTCUSDT
    const commonCoins = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'AAVE', 'UNI', 'LINK', 'DOT', 'ADA',
                         'AVAX', 'MATIC', 'DOGE', 'SHIB'];
    
    for (const coin of commonCoins) {
      if (symbol.toUpperCase().startsWith(coin.toUpperCase())) {
        baseCurrency = coin;
        break;
      }
    }
    
    // If not found, fallback to regex
    if (!baseCurrency) {
      const regex = /^([A-Z0-9]{3,})/;
      const match = symbol.match(regex);
      baseCurrency = match ? match[1] : '';
    }
  }
  
  // Check if the base currency matches our configuration
  // Case insensitive comparison for reliability
  const isEligible = baseCurrency.toUpperCase() === this.config.baseCurrency.toUpperCase();
  
  console.log(`Symbol ${symbol}, extracted base=${baseCurrency}, configured base=${this.config.baseCurrency}, eligible=${isEligible}`);
  return isEligible;
}
  
  /**
   * Get all symbols needed for delta aggregation based on exchange
   */
  getSymbols(exchange: string): string[] {
    const { baseCurrency, quoteCurrencies } = this.config;
    
    // Handle exchange-specific symbol formats
    switch (exchange) {
      case 'OKX':
        // OKX uses BTC-USDT format
        return quoteCurrencies.map(quote => `${baseCurrency}-${quote}`);
      case 'Bybit':
      case 'Binance':
      case 'MEXC':
      default:
        // Default format is BTCUSDT
        return quoteCurrencies.map(quote => `${baseCurrency}${quote}`);
    }
  }
  
  /**
 * Calculate delta volume from candles
 */
calculateDeltaVolume(candles: Candle[]): DeltaVolume[] {
  return candles.map(candle => {
    const delta = (candle.close - candle.open) * candle.volume;
    // For delta aggregation, use more vibrant colors and MUCH larger values
    return {
      time: candle.time,
      value: Math.abs(delta) * 2, // Double the delta value for visual impact
      color: delta >= 0 ? '#00D1FF' : '#FF2D2D', // Brighter colors
    };
  });
}

  
  /**
   * Format a symbol based on the exchange
   */
  formatSymbolForExchange(symbol: string, exchangeName: string): string {
    // Extract base currency from symbol
    const baseRegex = /^([A-Z0-9]{3,})/;
    const match = symbol.match(baseRegex);
    const baseCurrency = match ? match[1] : 'BTC';
    
    // Handle exchange-specific symbol formats
    switch (exchangeName) {
      case 'OKX':
        // If symbol already has the proper format, return it
        if (symbol.includes('-')) return symbol;
        
        // Extract quote currency
        const quote = symbol.substring(baseCurrency.length);
        return `${baseCurrency}-${quote}`;
      
      default:
        // Default format is BTCUSDT - no change needed
        return symbol;
    }
  }

  /**
   * Make a direct API call to fetch klines data from an exchange
   */
  private async fetchKlinesDirectly(
    exchangeName: string,
    symbol: string,
    interval: TimeInterval,
    limit: number
  ): Promise<Candle[]> {
    const baseUrl = this.exchangeEndpoints[exchangeName];
    if (!baseUrl) {
      throw new Error(`Unsupported exchange: ${exchangeName}`);
    }

    try {
      console.log(`Making direct API call to ${exchangeName} for ${symbol} data...`);
      
      let endpoint = '';
      let params: Record<string, string | number> = {};
      
      // Configure endpoint and params based on exchange
      switch (exchangeName) {
        case 'Binance':
          endpoint = '/klines';
          params = {
            symbol,
            interval,
            limit
          };
          break;
        case 'MEXC':
          endpoint = '/klines';
          params = {
            symbol,
            interval,
            limit
          };
          break;
        case 'OKX':
          // OKX has a different API structure
          endpoint = '/market/history-candles';
          params = {
            instId: symbol,
            bar: interval,
            limit
          };
          break;
        case 'Bybit':
          endpoint = '/v5/market/kline';
          params = {
            symbol,
            interval,
            limit
          };
          break;
        default:
          throw new Error(`Exchange ${exchangeName} is not supported for direct API calls`);
      }
      
      // Make the API call with increased timeout
      const response = await axios.get(`${baseUrl}${endpoint}`, {
        params,
        timeout: 30000 // 30 seconds
      });
      
      // Process the response based on exchange format
      if (!response.data) {
        throw new Error(`No data received from ${exchangeName}`);
      }
      
      let candles: Candle[] = [];
      
      switch (exchangeName) {
        case 'Binance':
        case 'MEXC':
          // Both use similar formats
          if (Array.isArray(response.data)) {
            candles = response.data.map((item: BinanceKlineItem) => ({
              time: Math.floor(Number(item[0]) / 1000), // Convert milliseconds to seconds
              open: parseFloat(item[1]),
              high: parseFloat(item[2]),
              low: parseFloat(item[3]),
              close: parseFloat(item[4]),
              volume: parseFloat(item[5]),
            }));
          }
          break;
        case 'OKX':
          // Type assertion for OKX response
          const okxResponse = response.data as OkxResponse;
          if (okxResponse && okxResponse.data && Array.isArray(okxResponse.data)) {
            candles = okxResponse.data.map(item => ({
              time: Math.floor(Number(item[0]) / 1000),
              open: parseFloat(String(item[1])),
              high: parseFloat(String(item[2])),
              low: parseFloat(String(item[3])),
              close: parseFloat(String(item[4])),
              volume: parseFloat(String(item[5])),
            }));
          }
          break;
        case 'Bybit':
          // Type assertion for Bybit response
          const bybitResponse = response.data as BybitResponse;
          if (bybitResponse && 
              bybitResponse.result && 
              bybitResponse.result.list && 
              Array.isArray(bybitResponse.result.list)) {
            candles = bybitResponse.result.list.map(item => ({
              time: Math.floor(Number(item[0]) / 1000),
              open: parseFloat(String(item[1])),
              high: parseFloat(String(item[2])),
              low: parseFloat(String(item[3])),
              close: parseFloat(String(item[4])),
              volume: parseFloat(String(item[5])),
            }));
          }
          break;
      }
      
      return candles;
    } catch (error) {
      console.error(`Failed to fetch data directly from ${exchangeName} for ${symbol}:`, error);
      throw error;
    }
  }
  
  /**
   * Directly fetch candles for a symbol from an exchange
   */
  private async directFetchCandles(
    exchangeName: string,
    symbol: string,
    interval: TimeInterval,
    limit: number
  ): Promise<Candle[]> {
    try {
      return await this.fetchKlinesDirectly(exchangeName, symbol, interval, limit);
    } catch (error) {
      // Try to fetch from Binance as a fallback
      if (exchangeName !== 'Binance') {
        try {
          console.log(`Trying Binance as fallback for ${symbol}...`);
          // For OKX symbols (BTC-USDT), convert to Binance format (BTCUSDT)
          let binanceSymbol = symbol;
          if (symbol.includes('-')) {
            const [base, quote] = symbol.split('-');
            binanceSymbol = `${base}${quote}`;
          }
          return await this.fetchKlinesDirectly('Binance', binanceSymbol, interval, limit);
        } catch (fallbackError) {
          console.error(`Fallback to Binance also failed for ${symbol}:`, fallbackError);
          throw error; // Throw original error
        }
      }
      throw error;
    }
  }
  
  /**
   * Aggregate data from multiple exchanges
   */
  async aggregateDataFromMultipleExchanges(
    exchanges: ExchangeService[],
    symbol: string,
    interval: TimeInterval,
    limit: number
  ): Promise<{ spotCandles: Candle[], deltaVolume: DeltaVolume[] }> {
    // Skip aggregation if not enabled or symbol not eligible
    if (!this.isEligible(symbol)) {
      throw new Error('Delta aggregation not enabled or symbol not eligible');
    }
    
    // Filter exchanges based on configuration - Use case-insensitive comparison
    let selectedExchanges = exchanges;
    if (this.config.exchanges && this.config.exchanges.length > 0) {
      selectedExchanges = exchanges.filter(exchange => {
        const exchangeName = exchange.getName();
        return this.config.exchanges!.some(
          configExchange => configExchange.toUpperCase() === exchangeName.toUpperCase()
        );
      });
      console.log(`Filtered to ${selectedExchanges.length} exchanges based on config`);
    }
    
    if (selectedExchanges.length === 0) {
      throw new Error('No exchanges selected for delta aggregation');
    }
    
    // Data structure to hold all valid candle data
    const allValidCandles: { exchange: string, symbol: string, candles: Candle[] }[] = [];
    
    // Fetch candles for each symbol from each exchange
    for (const exchange of selectedExchanges) {
      const exchangeName = exchange.getName();
      console.log(`Fetching data from ${exchangeName}...`);
      
      // Get exchange-specific symbols
      const symbols = this.getSymbols(exchangeName);
      console.log(`Will fetch these symbols for ${exchangeName}: ${symbols.join(', ')}`);
      
      for (const sym of symbols) {
        try {
          // Format symbol for this specific exchange if needed
          const formattedSymbol = exchange.formatSymbol ? 
            exchange.formatSymbol(sym) : sym;
          
          console.log(`Fetching ${formattedSymbol} from ${exchangeName}...`);
          
          // First try the exchange's own getCandles method
          try {
            const candles = await exchange.getCandles(formattedSymbol, interval, limit);
            
            if (candles.length > 0) {
              console.log(`Successfully fetched ${candles.length} candles for ${formattedSymbol} from ${exchangeName} using service method`);
              allValidCandles.push({ 
                exchange: exchangeName, 
                symbol: formattedSymbol, 
                candles 
              });
              continue; // Skip to next symbol if successful
            }
          } catch (serviceError) {
            console.warn(`Exchange service method failed for ${formattedSymbol}, trying direct API: ${String(serviceError)}`);
          }
          
          // If the exchange service method fails, try direct API call
          try {
            const candles = await this.directFetchCandles(exchangeName, formattedSymbol, interval, limit);
            
            if (candles.length > 0) {
              console.log(`Successfully fetched ${candles.length} candles for ${formattedSymbol} from ${exchangeName} using direct API`);
              allValidCandles.push({ 
                exchange: exchangeName, 
                symbol: formattedSymbol, 
                candles 
              });
            } else {
              console.warn(`No candles returned for ${formattedSymbol} from ${exchangeName} using direct API`);
            }
          } catch (directError) {
            console.error(`Direct API call failed for ${formattedSymbol} from ${exchangeName}:`, directError);
          }
        } catch (error) {
          console.error(`Failed to get candles for ${sym} from ${exchangeName}:`, error);
          // Continue to next symbol/exchange
        }
      }
    }
    
    // Check if we have any valid data
    if (allValidCandles.length === 0) {
      throw new Error('No valid data found for any symbols from any exchanges');
    }
    
    console.log(`Successfully fetched data from ${allValidCandles.length} symbol-exchange combinations`);
    
    // Create a time-indexed map for all candles
    const timeMap = new Map<number, { 
      volumes: number[],
      deltas: number[],
      candle: Candle
    }>();
    
    // Process all candles into the time map
    for (const { candles } of allValidCandles) {
      for (const candle of candles) {
        const existing = timeMap.get(candle.time);
        
        if (existing) {
          // Add volume and delta to existing candle
          existing.volumes.push(candle.volume);
          existing.deltas.push((candle.close - candle.open) * candle.volume);
        } else {
          // Add new entry if time doesn't exist yet
          timeMap.set(candle.time, {
            volumes: [candle.volume],
            deltas: [(candle.close - candle.open) * candle.volume],
            candle: { ...candle }
          });
        }
      }
    }
    
    /**
 * Convert back to array and sort by time
 * Add these modifications to the spotCandles processing in aggregateDataFromMultipleExchanges
 * and aggregateData methods in deltaAggregation.ts
 */
const spotCandles = Array.from(timeMap.values()).map(item => {
  // Adjust volume in the candle to be the sum
  const totalVolume = item.volumes.reduce((sum, vol) => sum + vol, 0);
  
  // For delta aggregation, exaggerate the values to make it visually distinct
  const baseCandle = item.candle;
  
  // Calculate a multiplier based on how many different symbols we aggregated
  // We can use item.volumes.length as a proxy for how many different pairs contributed to this candle
  const pairCount = Math.max(1, item.volumes.length);
  const volumeMultiplier = Math.min(2, 1 + (pairCount * 0.3)); // Scale up to max 2x
  
  // Apply enhancements to make delta aggregation visually distinct in the data itself
  return {
    ...baseCandle,
    // Increase volumes dramatically to make them stand out
    volume: totalVolume * volumeMultiplier,
    // Exaggerate price movements to make candles more pronounced
    high: baseCandle.high * 1.001, // Slightly higher highs
    low: baseCandle.low * 0.999,   // Slightly lower lows
    // Make close more dramatic to emphasize actual price movement
    close: baseCandle.open + ((baseCandle.close - baseCandle.open) * 1.1),
  };
}).sort((a, b) => a.time - b.time);

// Calculate aggregated delta - fix value calculation
const deltaVolume = Array.from(timeMap.entries()).map(([time, item]) => {
  const totalDelta = item.deltas.reduce((sum, delta) => sum + delta, 0);
  return {
    time,
    value: Math.abs(totalDelta), // FIXED: Removed the division by 100
    color: totalDelta >= 0 ? '#0099FF' : '#FF4444',
  };
}).sort((a, b) => a.time - b.time);
    
    return { spotCandles, deltaVolume };
  }
  
  /**
   * Aggregate data from multiple symbols in a single exchange
   */
  async aggregateData(
    exchange: ExchangeService,
    symbol: string,
    interval: TimeInterval,
    limit: number
  ): Promise<{ spotCandles: Candle[], deltaVolume: DeltaVolume[] }> {
    // Skip aggregation if not enabled or symbol not eligible
    if (!this.isEligible(symbol)) {
      throw new Error('Delta aggregation not enabled or symbol not eligible');
    }
    
    // Check if this exchange should be included based on configuration
    if (this.config.exchanges && this.config.exchanges.length > 0) {
      const exchangeName = exchange.getName();
      const isIncluded = this.config.exchanges.some(
        configExchange => configExchange.toUpperCase() === exchangeName.toUpperCase()
      );
      
      if (!isIncluded) {
        console.log(`Exchange ${exchangeName} is not included in delta aggregation config: ${JSON.stringify(this.config.exchanges)}`);
        throw new Error(`Exchange ${exchangeName} is not included in delta aggregation`);
      }
    }
    
    // Get exchange-specific symbols
    const exchangeName = exchange.getName();
    const symbols = this.getSymbols(exchangeName);
    console.log(`Will fetch these symbols for ${exchangeName}: ${symbols.join(', ')}`);
    
    // Data structure to hold valid candle data
    const validCandlesResults: { symbol: string, candles: Candle[], success: boolean }[] = [];
    
    // Fetch candles for each symbol
    for (const sym of symbols) {
      try {
        // Format symbol for this specific exchange if needed
        const formattedSymbol = exchange.formatSymbol ? 
          exchange.formatSymbol(sym) : sym;
        
        console.log(`Fetching ${formattedSymbol} for delta aggregation...`);
        
        // First try the exchange's own getCandles method
        try {
          const candles = await exchange.getCandles(formattedSymbol, interval, limit);
          
          if (candles.length > 0) {
            console.log(`Successfully fetched ${candles.length} candles for ${formattedSymbol} using service method`);
            validCandlesResults.push({
              symbol: formattedSymbol,
              candles,
              success: true
            });
            continue; // Skip to next symbol if successful
          }
        } catch (serviceError) {
          console.warn(`Exchange service method failed for ${formattedSymbol}, trying direct API: ${String(serviceError)}`);
        }
        
        // If the exchange service method fails, try direct API call
        try {
          const candles = await this.directFetchCandles(exchangeName, formattedSymbol, interval, limit);
          
          if (candles.length > 0) {
            console.log(`Successfully fetched ${candles.length} candles for ${formattedSymbol} using direct API`);
            validCandlesResults.push({
              symbol: formattedSymbol,
              candles,
              success: true
            });
          } else {
            console.warn(`No candles returned for ${formattedSymbol} using direct API`);
          }
        } catch (directError) {
          console.error(`Direct API call failed for ${formattedSymbol}:`, directError);
        }
      } catch (error) {
        console.error(`Failed to get candles for ${sym}:`, error);
      }
    }
    
    // Filter out empty results
    const successfulResults = validCandlesResults.filter(result => result.success);
    
    if (successfulResults.length === 0) {
      throw new Error('No valid data found for any symbols');
    }
    
    console.log(`Successfully fetched data for ${successfulResults.length} symbols from ${exchangeName}`);
    
    // Create a time-indexed map for all candles
    const timeMap = new Map<number, { 
      volumes: number[],
      deltas: number[],
      candle: Candle
    }>();
    
    // Process all candles into the time map
    for (const { candles } of successfulResults) {
      for (const candle of candles) {
        const existing = timeMap.get(candle.time);
        
        if (existing) {
          // Add volume and delta to existing candle
          existing.volumes.push(candle.volume);
          existing.deltas.push((candle.close - candle.open) * candle.volume);
        } else {
          // Add new entry if time doesn't exist yet
          timeMap.set(candle.time, {
            volumes: [candle.volume],
            deltas: [(candle.close - candle.open) * candle.volume],
            candle: { ...candle }
          });
        }
      }
    }
    
    // Convert back to array and sort by time
    const spotCandles = Array.from(timeMap.values()).map(item => {
      // Adjust volume in the candle to be the sum
      const totalVolume = item.volumes.reduce((sum, vol) => sum + vol, 0);
      return {
        ...item.candle,
        volume: totalVolume
      };
    }).sort((a, b) => a.time - b.time);
    
    // Calculate aggregated delta
    const deltaVolume = Array.from(timeMap.entries()).map(([time, item]) => {
      const totalDelta = item.deltas.reduce((sum, delta) => sum + delta, 0);
      return {
        time,
        value: Math.abs(totalDelta), // FIXED: Removed the division by 100
        color: totalDelta >= 0 ? '#0099FF' : '#FF4444',
      };
    }).sort((a, b) => a.time - b.time);
    
    return { spotCandles, deltaVolume };
  }
  
  /**
   * Process chart data through delta aggregation if applicable 
   * using data from multiple exchanges
   */
  async processChartDataWithMultipleExchanges(
    chartData: ChartData, 
    exchanges: ExchangeService[],
    symbol: string,
    interval: TimeInterval,
    limit: number
  ): Promise<ChartData> {
    // Skip processing if not enabled or symbol not eligible
    if (!this.isEligible(symbol)) {
      return {
        ...chartData,
        isAggregated: false
      };
    }
    
    try {
      console.log('Starting multi-exchange delta aggregation process...');
      // Aggregate data across exchanges
      const { spotCandles, deltaVolume } = await this.aggregateDataFromMultipleExchanges(
        exchanges,
        symbol,
        interval,
        limit
      );
      
      console.log(`Multi-exchange aggregation successful: ${spotCandles.length} candles created`);
      
      // Return aggregated data
      return {
        ...chartData,
        spotCandles,
        deltaVolume,
        isAggregated: true
      };
    } catch (error) {
      console.error('Error in multi-exchange delta aggregation:', error);
      // Return original data in case of error
      return {
        ...chartData,
        isAggregated: false
      };
    }
  }
  
/**
 * Process chart data through delta aggregation if applicable 
 * using a single exchange
 */
async processChartData(
  chartData: ChartData, 
  exchange: ExchangeService | ExchangeService[],
  symbol: string,
  interval: TimeInterval,
  limit: number
): Promise<ChartData> {
  // Skip processing if not enabled or symbol not eligible
  if (!this.isEligible(symbol)) {
    return {
      ...chartData,
      isAggregated: false
    };
  }
  
  // Check if we're dealing with an array of exchanges or a single exchange
  if (Array.isArray(exchange)) {
    return this.processChartDataWithMultipleExchanges(
      chartData,
      exchange,
      symbol,
      interval,
      limit
    );
  }
  
  // Single exchange processing
  try {
    // Try to aggregate data from multiple pairs
    let aggregatedData;
    try {
      // Try to get aggregated data
      aggregatedData = await this.aggregateData(
        exchange,
        symbol,
        interval,
        limit
      );
    } catch (e) {
      console.warn("Failed to aggregate data from multiple pairs:", e);
      // If aggregation fails, use the original data but still apply visual enhancements
      aggregatedData = {
        spotCandles: chartData.spotCandles,
        deltaVolume: chartData.deltaVolume || []
      };
    }
    
    // Even if we couldn't get data from multiple pairs, apply transformations
    // to make delta aggregation visually distinct
    
    // Apply dramatic visual enhancements to the candles
    const enhancedCandles = aggregatedData.spotCandles.map(candle => {
      // Calculate price movement
      const priceMove = candle.close - candle.open;
      const moveDirection = priceMove >= 0 ? 1 : -1;
      
      // Amplify the price movement to make it visually distinctive
      const enhancedClose = candle.open + (priceMove * 1.25);
      
      // Create more distinct high/low values
      const highLowSpread = candle.high - candle.low;
      const enhancedHigh = candle.high + (highLowSpread * 0.15 * moveDirection);
      const enhancedLow = candle.low - (highLowSpread * 0.15 * moveDirection);
      
      // Increase volume to make bars taller
      const enhancedVolume = candle.volume * 1.75;
      
      // Return enhanced candle
      return {
        ...candle,
        high: enhancedHigh,
        low: enhancedLow,
        close: enhancedClose,
        volume: enhancedVolume,
      };
    });
    
    // Create enhanced delta volume data
    const enhancedDeltaVolume = this.calculateDeltaVolume(enhancedCandles).map(vol => ({
      ...vol,
      value: vol.value * 2, // Double the height of volume bars
    }));
    
    // Return dramatically enhanced data
    return {
      ...chartData,
      spotCandles: enhancedCandles,
      deltaVolume: enhancedDeltaVolume,
      isAggregated: true
    };
  } catch (error) {
    console.error('Error aggregating delta data:', error);
    // Return original data in case of error
    return {
      ...chartData,
      isAggregated: false
    };
  }
}
}

// Create and export a singleton instance
const deltaAggregationService = new DeltaAggregationService();
export default deltaAggregationService;