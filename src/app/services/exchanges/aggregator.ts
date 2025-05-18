// src/app/services/exchanges/aggregator.ts
console.log('====== AGGREGATOR MODULE LOADING ======');

import { Candle, MarketSymbol, OpenInterest, TimeInterval, Exchange, ChartData, DeltaVolume } from '../../types/market';
import binanceExchange from './binanceExchange';
import okxExchange from './okxExchange';
import bybitExchange from './bybitExchange';
import mexcExchange from './mexcExchange';

console.log('binanceExchange import completed in aggregator');
// Add near the top of the aggregator file after imports
console.log('======= AGGREGATOR IMPORTS CHECK =======');
console.log('Checking binanceExchange:', binanceExchange ? 'Loaded' : 'Not loaded');
console.log('Checking okxExchange:', typeof okxExchange !== 'undefined' ? 'Loaded' : 'Not loaded');
console.log('Checking bybitExchange:', typeof bybitExchange !== 'undefined' ? 'Loaded' : 'Not loaded');
console.log('Checking mexcExchange:', typeof mexcExchange !== 'undefined' ? 'Loaded' : 'Not loaded');
console.log('======= END AGGREGATOR IMPORTS CHECK =======');

// Define the exchange service interface
interface ExchangeService {
  getName(): string;
  getCandles(symbol: string, interval?: TimeInterval, limit?: number): Promise<Candle[]>;
  getFuturesCandles?(symbol: string, interval?: TimeInterval, limit?: number): Promise<Candle[]>;
  getSymbols(): Promise<MarketSymbol[]>;
  getOpenInterest?(symbol: string, interval?: TimeInterval, limit?: number): Promise<OpenInterest[]>;
  validateSymbol(symbol: string): Promise<boolean>;
  getWebSocketUrl(symbol: string, stream: string): string;
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

/**
 * Service for handling delta aggregation across multiple trading pairs
 */
class DeltaAggregationService {
  private config: DeltaAggregationConfig = {
    enabled: false,
    baseCurrency: 'BTC',
    quoteCurrencies: ['USDT', 'USDC', 'USD'],
    exchanges: [] // Default to empty array
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
    if (symbol.startsWith('BTC')) return 'BTC';
    
    // Fallback to regex
    const regex = /^([A-Z0-9]{3,})/;
    const match = symbol.match(regex);
    return match ? match[1] : '';
  }
  
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
    // Simple check to handle BTC pairs reliably
    if (symbol.startsWith('BTC')) {
      baseCurrency = 'BTC';
    } else {
      // Fallback to regex for other symbols
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
      const delta = (candle.close - candle.open) * candle.volume / 100;
      return {
        time: candle.time,
        value: Math.abs(delta),
        color: delta >= 0 ? '#0099FF' : '#FF4444',
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
      if (!this.config.exchanges.includes(exchangeName)) {
        console.log(`Exchange ${exchangeName} is not included in delta aggregation`);
        throw new Error(`Exchange ${exchangeName} is not included in delta aggregation`);
      }
    }
    
    // Get exchange-specific symbols
    const exchangeName = exchange.getName();
    const symbols = this.getSymbols(exchangeName);
    console.log(`Will fetch these symbols for ${exchangeName}: ${symbols.join(', ')}`);
    
    // Fetch candles for each symbol
    const candlesPromises = symbols.map(async sym => {
      try {
        // Format symbol for this specific exchange if needed
        const formattedSymbol = exchange.formatSymbol ? 
          exchange.formatSymbol(sym) : sym;
        
        console.log(`Fetching ${formattedSymbol} for delta aggregation...`);
        
        // Direct call to getCandles method which should now use proxy for CORS-safe calls
        const candles = await exchange.getCandles(formattedSymbol, interval, limit);
        return { symbol: formattedSymbol, candles, success: candles.length > 0 };
      } catch (error) {
        console.error(`Failed to get candles for ${sym}:`, error);
        return { symbol: sym, candles: [], success: false };
      }
    });
    
    const allCandlesResults = await Promise.all(candlesPromises);
    
    // Filter out empty results
    const validCandlesResults = allCandlesResults.filter(result => result.success);
    
    if (validCandlesResults.length === 0) {
      throw new Error('No valid data found for any symbols');
    }
    
    console.log(`Successfully fetched data for ${validCandlesResults.length} symbols from ${exchangeName}`);
    
    // Create a time-indexed map for all candles
    const timeMap = new Map<number, { 
      volumes: number[],
      deltas: number[],
      candle: Candle
    }>();
    
    // Process all candles into the time map
    for (const { candles } of validCandlesResults) {
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
        value: Math.abs(totalDelta / 100), // Same scaling as in calculateDeltaVolume
        color: totalDelta >= 0 ? '#0099FF' : '#FF4444',
      };
    }).sort((a, b) => a.time - b.time);
    
    return { spotCandles, deltaVolume };
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
    
    // Filter exchanges based on configuration
    let selectedExchanges = exchanges;
    if (this.config.exchanges && this.config.exchanges.length > 0) {
      selectedExchanges = exchanges.filter(exchange => 
        this.config.exchanges!.includes(exchange.getName())
      );
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
          
          // Direct call to getCandles method which should now use proxy for CORS
          const candles = await exchange.getCandles(formattedSymbol, interval, limit);
          
          if (candles.length > 0) {
            console.log(`Successfully fetched ${candles.length} candles for ${formattedSymbol} from ${exchangeName}`);
            allValidCandles.push({ 
              exchange: exchangeName, 
              symbol: formattedSymbol, 
              candles 
            });
          } else {
            console.warn(`No candles returned for ${formattedSymbol} from ${exchangeName}`);
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
        value: Math.abs(totalDelta / 100), // Same scaling as in calculateDeltaVolume
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
      // Aggregate data
      const { spotCandles, deltaVolume } = await this.aggregateData(
        exchange,
        symbol,
        interval,
        limit
      );
      
      // Return aggregated data
      return {
        ...chartData,
        spotCandles,
        deltaVolume,
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

// Create a singleton instance of DeltaAggregationService
const deltaAggregationService = new DeltaAggregationService();

// Add this debugging function
function debugObject(obj: unknown, label: string) {
  console.log(`${label} debug info:`);
  console.log('  Type:', typeof obj);
  console.log('  Is null:', obj === null);
  console.log('  Is undefined:', obj === undefined);
  if (obj) {
    console.log('  Constructor name:', obj.constructor ? obj.constructor.name : 'No constructor');
    console.log('  Properties:', Object.keys(obj || {}));
    if (typeof obj === 'object') {
      console.log('  Methods:', Object.getOwnPropertyNames(obj).filter(
        prop => typeof (obj as Record<string, unknown>)[prop] === 'function'
      ));
      
      const objWithGetName = obj as { getName?: () => string };
      console.log('  Has getName:', typeof objWithGetName.getName === 'function');
      
      if (typeof objWithGetName.getName === 'function') {
        try {
          console.log('  getName() result:', objWithGetName.getName());
        } catch (error) {
          console.log('  Error calling getName():', error);
        }
      }
    }
    console.log('  toString():', obj.toString?.());
  }
}

class AggregatorService {
  private exchanges: ExchangeService[];
  private deltaService: DeltaAggregationService;
  
  // Update the constructor method in your aggregator.ts file
  constructor() {
    console.log('******************************************');
    console.log('AggregatorService constructor starting');
    console.log('binanceExchange import value:', binanceExchange);
    
    // Debug the binanceExchange object
    debugObject(binanceExchange, 'binanceExchange');
    
    // Start with an empty array
    this.exchanges = [];
    
    // Try to add each exchange with proper error handling
    const addExchange = (exchange: unknown, name: string) => {
      try {
        if (exchange && 
            typeof exchange === 'object' && 
            'getName' in exchange && 
            typeof (exchange as ExchangeService).getName === 'function') {
          
          const exchangeService = exchange as ExchangeService;
          const exchangeName = exchangeService.getName();
          console.log(`Testing ${name}.getName()...`);
          console.log(`${name}.getName() returned: ${exchangeName}`);
          
          this.exchanges.push(exchangeService);
          console.log(`Added ${exchangeName} exchange`);
          return true;
        } else {
          console.error(`${name} is not a valid exchange implementation`);
          return false;
        }
      } catch (error) {
        console.error(`Error adding ${name}:`, error);
        return false;
      }
    };
    
    // Add all exchanges
    addExchange(binanceExchange, 'binanceExchange');
    addExchange(okxExchange, 'okxExchange');
    addExchange(bybitExchange, 'bybitExchange');
    addExchange(mexcExchange, 'mexcExchange');
    
    if (this.exchanges.length === 0) {
      console.error('No exchanges were successfully initialized!');
      
      // Create a fallback exchange if needed
      console.log('Creating a fallback test exchange');
      const testExchange: ExchangeService = {
        getName: () => 'Test Exchange',
        getCandles: async (symbol) => {
          console.log(`Test exchange getCandles called for ${symbol}`);
          // Generate mock data that looks realistic
          const now = Math.floor(Date.now() / 1000);
          const candles: Candle[] = [];
          let price = 50000 + Math.random() * 1000;
          
          for (let i = 0; i < 100; i++) {
            const time = now - (100 - i) * 60;
            const change = (Math.random() - 0.5) * 100;
            const open = price;
            price += change;
            const close = price;
            const high = Math.max(open, close) + Math.random() * 50;
            const low = Math.min(open, close) - Math.random() * 50;
            const volume = 1000 + Math.random() * 5000;
            
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
        },
        getSymbols: async () => {
          return [
            { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
            { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
          ];
        },
        validateSymbol: async () => true,
        getWebSocketUrl: () => 'wss://test'
      };
      this.exchanges.push(testExchange);
      console.log('Added test exchange');
    }
    
    // Safely log exchange names
    try {
      console.log('Available exchanges:', this.exchanges.map(e => e.getName()));
    } catch (error) {
      console.error('Error getting exchange names:', error);
    }
    
    // Initialize delta aggregation service
    this.deltaService = deltaAggregationService;
    console.log('AggregatorService constructor completed');
    console.log('******************************************');
  }
  
  // Get all available exchanges
  getExchanges(): Exchange[] {
    return this.exchanges.map(e => e.getName() as Exchange);
  }
  
  // Find exchange implementation by name
  getExchangeByName(name: Exchange): ExchangeService | undefined {
    // Safe implementation to avoid runtime errors
    try {
      return this.exchanges.find(e => e && typeof e.getName === 'function' && e.getName() === name);
    } catch (error) {
      console.error(`Error finding exchange ${name}:`, error);
      return undefined;
    }
  }
  
  // Configure delta aggregation - delegates to the deltaAggregationService
  setDeltaAggregationConfig(config: Partial<DeltaAggregationConfig>): void {
    console.log("Setting delta aggregation config:", config);
    this.deltaService.setConfig(config);
  }
  
  // Get delta aggregation config - delegates to the deltaAggregationService
  getDeltaAggregationConfig(): DeltaAggregationConfig {
    return this.deltaService.getConfig();
  }
  
  /**
   * Get aggregated data for a symbol, interval, and exchange
   */
  async getAggregatedData(symbol: string, interval: TimeInterval, limit = 100, preferredExchange?: Exchange): Promise<ChartData> {
    try {
      // Use the preferred exchange if specified, otherwise start with Binance
      let primaryExchange = preferredExchange 
        ? this.getExchangeByName(preferredExchange) 
        : this.exchanges[0];
      
      // If the preferred exchange isn't available, fall back to the first one
      if (!primaryExchange && this.exchanges.length > 0) {
        primaryExchange = this.exchanges[0];
      }
      
      if (!primaryExchange) {
        throw new Error('No exchanges available');
      }
      
      const exchangeName = primaryExchange.getName();
      console.log(`Using primary exchange: ${exchangeName}`);
      
      // Format the symbol for the specific exchange if needed
      const formattedSymbol = primaryExchange.formatSymbol ? 
        primaryExchange.formatSymbol(symbol) : symbol;
      
      // Extract base currency
      const baseCurrency = this.deltaService.extractBaseCurrency(formattedSymbol);
      console.log(`Symbol: ${formattedSymbol}, Extracted Base Currency: ${baseCurrency}`);
      

// Get the config directly for debugging
const deltaConfig = this.deltaService.getConfig();
const isDeltaAggregationEligible = this.deltaService.isEligible(formattedSymbol);
const isDeltaEnabled = deltaConfig.enabled;
console.log(`Delta aggregation state: eligible=${isDeltaAggregationEligible}, enabled=${isDeltaEnabled}, config=`, deltaConfig);
      
      // Get spot candles - this is the primary data
      let spotCandles: Candle[] = [];
      let futuresCandles: Candle[] = [];
      let openInterest: OpenInterest[] = [];
      
      try {
        spotCandles = await primaryExchange.getCandles(formattedSymbol, interval, limit);
        console.log(`Successfully fetched ${spotCandles.length} candles for ${formattedSymbol} from ${exchangeName}`);
      } catch (error) {
        console.error(`Error fetching spot candles from ${exchangeName} for ${formattedSymbol}:`, error);
        console.log(`Trying alternative exchanges for ${formattedSymbol}...`);
        
        // Try other exchanges if primary fails
        let alternativeFound = false;
        
        for (const exchange of this.exchanges) {
          if (exchange !== primaryExchange) {
            try {
              // Format symbol for this specific exchange if needed
              const altFormattedSymbol = exchange.formatSymbol ? 
                exchange.formatSymbol(symbol) : symbol;
              
              spotCandles = await exchange.getCandles(altFormattedSymbol, interval, limit);
              console.log(`Successfully fetched ${spotCandles.length} candles for ${altFormattedSymbol} from alternative exchange ${exchange.getName()}`);
              alternativeFound = true;
              break;
            } catch (altError) {
              console.error(`Alternative exchange ${exchange.getName()} also failed for ${symbol}:`, altError);
            }
          }
        }
        
        if (!alternativeFound) {
          throw new Error(`Failed to fetch candles for ${symbol} from any exchange`);
        }
      }
      
      // Get futures candles (optional)
      try {
        futuresCandles = await this.getAggregatedFuturesCandles(symbol, interval, limit);
        console.log(`Successfully fetched ${futuresCandles.length} futures candles for ${symbol}`);
      } catch (error) {
        console.error(`Error fetching futures candles for ${symbol}:`, error);
        futuresCandles = []; // Empty array for non-critical component
      }
      
      // Get open interest data (optional)
      try {
        openInterest = await this.getAggregatedOpenInterest(symbol, interval, limit);
        console.log(`Successfully fetched ${openInterest.length} open interest entries for ${symbol}`);
      } catch (error) {
        console.error(`Error fetching open interest for ${symbol}:`, error);
        openInterest = []; // Empty array for non-critical component
      }
      
      // Calculate delta volume from candles
      const deltaVolume = this.deltaService.calculateDeltaVolume(spotCandles);
      
      const chartData: ChartData = {
  spotCandles,
  deltaVolume,
  futuresCandles: [], // Add this line to fix the missing property error
  openInterest: [] as OpenInterest[], // Fix the implicit any[] type
  isAggregated: false
};
      
      // If delta aggregation is enabled, process the data regardless of eligibility
      if (isDeltaEnabled) {
        try {
          const config = this.deltaService.getConfig();
          console.log(`Processing chart data with delta aggregation. Config:`, config);
          
          // Override the original deltaAggregation service's config to force eligibility
          const originalConfig = {...this.deltaService.getConfig()};
          
          // Temporarily modify the config to extract the proper base currency from the symbol
          const baseRegex = /^([A-Z0-9]{3,})/;
          let extractedBase = '';
          
          // Handle OKX format (BTC-USDT)
          if (formattedSymbol.includes('-')) {
            const [base] = formattedSymbol.split('-');
            extractedBase = base;
          } else if (formattedSymbol.startsWith('BTC')) {
            extractedBase = 'BTC';
          } else {
            // Try to match with common cryptocurrencies first
            const commonCoins = ['ETH', 'SOL', 'BNB', 'XRP', 'AAVE', 'UNI', 'LINK', 'DOT', 'ADA',
                               'AVAX', 'MATIC', 'DOGE', 'SHIB'];
            for (const coin of commonCoins) {
              if (formattedSymbol.toUpperCase().startsWith(coin.toUpperCase())) {
                extractedBase = coin;
                break;
              }
            }
            
            // If not found, use regex
            if (!extractedBase) {
              const match = formattedSymbol.match(baseRegex);
              extractedBase = match ? match[1] : 'BTC'; // Default to BTC if extraction fails
            }
          }
          
          console.log(`Extracted base currency: ${extractedBase} from symbol: ${formattedSymbol}`);
          
          // Update the config to match the current symbol
          this.deltaService.setConfig({
            ...config,
            baseCurrency: extractedBase,
            enabled: true
          });
          
          // If multiple exchanges are specified in the config, use them all
          if (config.exchanges && config.exchanges.length > 1) {
            const selectedExchanges = this.exchanges.filter(e => 
              config.exchanges!.includes(e.getName())
            );
            
            if (selectedExchanges.length > 1) {
              console.log(`Using ${selectedExchanges.length} exchanges for delta aggregation`);
              const result = await this.deltaService.processChartDataWithMultipleExchanges(
                chartData,
                selectedExchanges,
                symbol,
                interval,
                limit
              );
              
              // Restore the original config
              this.deltaService.setConfig(originalConfig);
              return result;
            }
          }
          
          // Otherwise use just the primary exchange
          console.log(`Using single exchange ${primaryExchange.getName()} for delta aggregation`);
          const result = await this.deltaService.processChartData(
            chartData,
            primaryExchange,
            symbol,
            interval,
            limit
          );
          
          // Restore the original config
          this.deltaService.setConfig(originalConfig);
          return result;
        } catch (error) {
          console.error('Delta aggregation failed:', error);
          // Return original data in case of error
          return chartData;
        }
      }
      
      return chartData;
    } catch (error) {
      console.error('Critical error in aggregator service:', error);
      throw error; // Propagate the error instead of using mock data
    }
  }
  
  // Aggregates futures candles from all supported exchanges
  private async getAggregatedFuturesCandles(symbol: string, interval: TimeInterval, limit = 100): Promise<Candle[]> {
    const futuresData: { exchange: string, candles: Candle[] }[] = [];
    
    // Try to get futures data from each exchange
    for (const exchange of this.exchanges) {
      if (exchange.getFuturesCandles) {
        try {
          // Format symbol for this specific exchange if needed
          const formattedSymbol = exchange.formatSymbol ? 
            exchange.formatSymbol(symbol) : symbol;
            
          const candles = await exchange.getFuturesCandles(formattedSymbol, interval, limit);
          if (candles.length > 0) {
            futuresData.push({
              exchange: exchange.getName(),
              candles
            });
          }
        } catch (error) {
          console.error(`Failed to get futures candles from ${exchange.getName()} for ${symbol}:`, error);
          // Continue to next exchange
        }
      }
    }
    
    // If no exchange provided futures data, return empty array
    if (futuresData.length === 0) {
      return [];
    }
    
    // For now, just use the first exchange with valid data
    // Future enhancement: Weighted average or selection based on reliability
    return futuresData[0].candles;
  }
  
  // Gets aggregated open interest data from all supported exchanges
  async getAggregatedOpenInterest(symbol: string, interval: TimeInterval, limit = 100): Promise<OpenInterest[]> {
  const openInterestData: { exchange: string, data: OpenInterest[] }[] = [];
  let sucessfulFetches = 0;
  
  // Try to get open interest from all exchanges that support it
  for (const exchange of this.exchanges) {
    if (exchange.getOpenInterest) {
      try {
        // Format symbol for this specific exchange if needed
        const formattedSymbol = exchange.formatSymbol ? 
          exchange.formatSymbol(symbol) : symbol;
          
        const data = await exchange.getOpenInterest(formattedSymbol, interval, limit);
        if (data && data.length > 0) {
          openInterestData.push({
            exchange: exchange.getName(),
            data
          });
          sucessfulFetches++;
          
          // Break after first successful fetch to avoid multiple redundant calls
          // This prevents unnecessary API calls and potential rate limiting
          break;
        }
      } catch (error) {
        console.error(`Failed to get open interest from ${exchange.getName()} for ${symbol}:`, error);
        // Continue to next exchange
      }
    }
  }
  
  // If no exchange provided open interest data, return empty array
  if (openInterestData.length === 0) {
    console.log(`No open interest data available for ${symbol} from any exchange`);
    return [];
  }
  
  // If we have data from multiple exchanges, merge it
  if (openInterestData.length > 1) {
    return this.mergeOpenInterestData(openInterestData);
  }
  
  // Otherwise just return data from the first exchange
  return openInterestData[0].data;
}
  
  // Merges open interest data from multiple exchanges
  private mergeOpenInterestData(data: { exchange: string, data: OpenInterest[] }[]): OpenInterest[] {
    // Create a map of timestamps to aggregate open interest values
    const openInterestMap = new Map<number, number>();
    
    // Process data from each exchange
    data.forEach(exchangeData => {
      exchangeData.data.forEach(oi => {
        // If we have an entry for this timestamp, add to it
        if (openInterestMap.has(oi.time)) {
          openInterestMap.set(oi.time, openInterestMap.get(oi.time)! + oi.openInterest);
        } else {
          openInterestMap.set(oi.time, oi.openInterest);
        }
      });
    });
    
    // Convert map back to array and sort by time
    const mergedData = Array.from(openInterestMap.entries()).map(([time, openInterest]) => ({
      time,
      openInterest
    }));
    
    return mergedData.sort((a, b) => a.time - b.time);
  }
  
  /**
   * Check if a symbol is eligible for delta aggregation
   */
  isSymbolEligibleForDeltaAggregation(symbol: string): boolean {
    return this.deltaService.isEligible(symbol);
  }
  
  /**
   * Get data for a symbol from all available exchanges
   */
  async getMultiExchangeData(
    symbol: string,
    interval: TimeInterval = '1m',
    limit: number = 100
  ): Promise<Record<string, ChartData>> {
    const results: Record<string, ChartData> = {};
    
    // Get data from each exchange
    for (const exchange of this.exchanges) {
      try {
        // Format symbol for this specific exchange if needed
        const formattedSymbol = exchange.formatSymbol ? 
          exchange.formatSymbol(symbol) : symbol;
        
        const spotCandles = await exchange.getCandles(formattedSymbol, interval, limit);
        
        // Calculate delta volume
        const deltaVolume = spotCandles.map(candle => {
          const delta = (candle.close - candle.open) * candle.volume / 100;
          return {
            time: candle.time,
            value: Math.abs(delta),
            color: delta >= 0 ? '#0099FF' : '#FF4444',
          };
        });
        
        let openInterest: OpenInterest[] = [];
if (exchange.getOpenInterest) {
  try {
    openInterest = await exchange.getOpenInterest(formattedSymbol, interval, limit);
  } catch (error) {
    console.warn(`Failed to get open interest data for ${formattedSymbol} on ${exchange.getName()}:`, error);
    openInterest = [];
  }
}

results[exchange.getName()] = {
  spotCandles,
  deltaVolume,
  openInterest,
  futuresCandles: [], // Add this missing property
  isAggregated: false
};
      } catch (error) {
        console.error(`Failed to get data for ${symbol} on ${exchange.getName()}:`, error);
        // Skip this exchange and continue with others
      }
    }
    
    return results;
  }
  
  /**
   * Get aggregated data across multiple exchanges
   */
  async getMultiExchangeAggregatedData(
    symbol: string,
    interval: TimeInterval = '1m',
    limit: number = 100,
    exchangeNames: Exchange[] = ['Binance', 'OKX', 'Bybit', 'MEXC']
  ): Promise<ChartData> {
    try {
      // Filter to only include available exchanges
      const exchanges = exchangeNames
        .map(name => this.getExchangeByName(name))
        .filter((exchange): exchange is ExchangeService => !!exchange);
      
      if (exchanges.length === 0) {
        throw new Error('No valid exchanges found');
      }
      
      // Get a base chart data structure from the first exchange
      const firstExchange = exchanges[0];
      const formattedSymbol = firstExchange.formatSymbol ? 
        firstExchange.formatSymbol(symbol) : symbol;
      
      const spotCandles = await firstExchange.getCandles(formattedSymbol, interval, limit);
      
      // Calculate delta volume
      const deltaVolume = spotCandles.map(candle => {
        const delta = (candle.close - candle.open) * candle.volume / 100;
        return {
          time: candle.time,
          value: Math.abs(delta),
          color: delta >= 0 ? '#0099FF' : '#FF4444',
        };
      });
      
      // Create base chart data
const chartData: ChartData = {
  spotCandles,
  deltaVolume,
  futuresCandles: [], // Add this line to fix the missing property error
  openInterest: [] as OpenInterest[], // Fix the implicit any[] type
  isAggregated: false
};
      
      // Apply delta aggregation if enabled
      if (this.deltaService.getConfig().enabled) {
        console.log(`Delta aggregation is enabled, processing multi-exchange data for ${symbol}`);
        try {
          return await this.deltaService.processChartDataWithMultipleExchanges(
            chartData,
            exchanges,
            symbol,
            interval,
            limit
          );
        } catch (error) {
          console.error(`Multi-exchange delta aggregation failed:`, error);
          return chartData;
        }
      }
      
      return chartData;
    } catch (error) {
      console.error(`Failed to get multi-exchange aggregated data:`, error);
      throw error;
    }
  }
}

// Create and export an instance of the aggregator service
const aggregatorService = new AggregatorService();
export default aggregatorService;

console.log('====== AGGREGATOR MODULE LOADED ======');