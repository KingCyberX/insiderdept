// src/app/services/dataManager.ts
import { Candle, TimeInterval, ChartData, MarketSymbol, DeltaVolume, Exchange, OpenInterest } from '../types/market';
import aggregatorService from './exchanges/aggregator';
import socketService from './socketService';
import apiService from './apiService';


/**
 * Extended Candle type with source and mock information
 */
interface ExtendedCandle extends Candle {
  source?: 'real' | 'mock' | 'historical' | 'unknown';
  isMock?: boolean;
}

// Define the handler type for real-time updates
type UpdateHandler = () => void;

/**
 * Data source tracking structure for real vs mock data
 */
interface SymbolDataSourceInfo {
  hasRealTimeData: boolean;       // Whether we've received real-time data
  lastRealTimeUpdate: number;     // Timestamp of last real-time update
  sourceType: 'real' | 'mock' | 'historical'; // Current data source type
}

/**
 * DataManager is a singleton that manages market data
 * and coordinates real-time updates with historical data
 */
class DataManager {
  private static instance: DataManager;
  private updateHandlers: Map<string, Set<UpdateHandler>> = new Map();
  private cachedChartData: Map<string, ChartData> = new Map();
  private CACHE_TTL = 60 * 1000; // 1 minute cache time
  private cacheTimestamps: Map<string, number> = new Map();
  private isInitialized = false;
  private debugMode = process.env.NODE_ENV === 'development';

  // New fields from modified code
  private dataSourceInfo: Map<string, SymbolDataSourceInfo> = new Map();
  private lastGapCheckTime: Map<string, number> = new Map(); // Track last gap check time
  private currentInterval: Map<string, TimeInterval> = new Map(); // Track interval for each symbol
  
  // Configuration constants for enhanced gap handling and data quality
  private readonly MOCK_FALLBACK_DELAY = 60000; // 60 seconds without real data before using mock
  private readonly PREFER_REAL_DATA = true; // Always prefer real data over mock when available
  private readonly MAX_CANDLES = 1000; // Maximum number of candles to store
  private readonly DEBUG_LOG_FREQUENCY = 0.05; // 5% of operations are logged for debugging
  private readonly GAP_CHECK_INTERVAL = 30000; // Check for gaps every 30 seconds
  private readonly GAP_THRESHOLD = 1.2; // Gap is detected if time diff > interval * threshold

  constructor() {
    this.initializeService();
    console.log('DataManager instance created');
  }

  public static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager();
    }
    return DataManager.instance;
  }

  /**
   * Initialize the service and set up event handlers
   */
  private async initializeService(): Promise<void> {
    try {
      // Set up socket connection status handler
      socketService.setHandlers({
        onStatus: (connected: boolean) => {
          if (connected) {
            console.log('DataManager: Socket connected, refreshing data');
            this.refreshActiveSubscriptions();
          }
        },
        onError: (message: string) => {
          console.error('DataManager: Socket error:', message);
        }
      });

      this.isInitialized = true;
      console.log('DataManager: Service initialized');
    } catch (error) {
      console.error('DataManager: Initialization error:', error);
    }
  }

  /**
   * Refresh all active subscriptions when connection is re-established
   */
  private refreshActiveSubscriptions(): void {
    // Re-subscribe to all active subscriptions
    for (const key of this.updateHandlers.keys()) {
      try {
        const [exchange, symbol, interval] = key.split(':');
        
        if (exchange && symbol && interval) {
          console.log(`DataManager: Refreshing subscription for ${key}`);
          socketService.subscribe(exchange, symbol, interval as TimeInterval);
        }
      } catch (error) {
        console.error(`DataManager: Error refreshing subscription for ${key}:`, error);
      }
    }
  }

  /**
   * Register a handler for a specific market data subscription
   */
  public registerUpdateHandler(
  exchange: string,
  symbol: string,
  interval: TimeInterval,
  handler: UpdateHandler
): void {
  if (!handler || typeof handler !== 'function') {
    console.error('Invalid handler provided to registerUpdateHandler');
    return;
  }
  
  const key = this.getKey(exchange, symbol, interval);
  console.log(`DataManager: Registering update handler for ${key}`);
  
  // Create handlers set if it doesn't exist
  if (!this.updateHandlers.has(key)) {
    this.updateHandlers.set(key, new Set());
    
    // Initialize current interval for this key
    this.currentInterval.set(key, interval);
  }
  
  // Add handler to the set
  const handlers = this.updateHandlers.get(key)!;
  
  // Only add if handler isn't already in the set
  if (!Array.from(handlers).some(h => h === handler)) {
    handlers.add(handler);
    console.log(`DataManager: Registered handler for ${key}, total handlers: ${handlers.size}`);
  } else {
    console.log(`DataManager: Handler already registered for ${key}, skipping duplicate`);
    return;
  }

  // Initialize data if not already initialized
  if (!this.cachedChartData.has(key) && handlers.size === 1) {
    this.initialize(exchange, symbol, interval).catch(error => {
      console.error(`DataManager: Failed to initialize data for ${key}:`, error);
    });
  }
    // Subscribe to real-time updates if this is the first handler
    if (handlers.size === 1) {
      try {
        // Use socketService for real-time updates
        socketService.setHandlersForSubscription(exchange, symbol, interval, {
          onUpdate: (updatedExchange: string, updatedSymbol: string, candleData: Candle) => {
            if (updatedExchange === exchange && updatedSymbol === symbol) {
              this.handleCandleUpdate(exchange, symbol, interval, candleData);
            }
          },
          onError: (message: string) => {
            console.error(`DataManager: Error in real-time updates for ${key}:`, message);
          }
        });
        
        // Subscribe via the socket service
        socketService.subscribe(exchange, symbol, interval);
      } catch (error) {
        console.error(`DataManager: Failed to subscribe to updates for ${key}:`, error);
      }
    }
  }

  /**
   * Unregister a handler for a specific market data subscription
   */
  public unregisterUpdateHandler(
    exchange: string,
    symbol: string,
    interval: TimeInterval,
    handler: UpdateHandler
  ): void {
    if (!handler || typeof handler !== 'function') {
      console.error('Invalid handler provided to unregisterUpdateHandler');
      return;
    }
    
    const key = this.getKey(exchange, symbol, interval);
    console.log(`DataManager: Unregistering update handler for ${key}`);
    
    const handlers = this.updateHandlers.get(key);
    if (!handlers) {
      console.warn(`DataManager: No handlers found for ${key}`);
      return;
    }
    
    // Remove handler from the set
    handlers.delete(handler);
    
    // If no more handlers, unsubscribe from real-time updates
    if (handlers.size === 0) {
      try {
        // Unsubscribe from the socket service
        socketService.unsubscribe(exchange, symbol, interval);
        
        // Remove the handlers set
        this.updateHandlers.delete(key);
        console.log(`DataManager: Removed all handlers for ${key}`);
      } catch (error) {
        console.error(`DataManager: Error unsubscribing from ${key}:`, error);
      }
    }
  }

  /**
   * Handle candle updates from real-time sources
   */
  private handleCandleUpdate(
    exchange: string,
    symbol: string,
    interval: TimeInterval,
    candle: Candle
  ): void {
    const key = this.getKey(exchange, symbol, interval);
    
    if (this.debugMode) {
      console.log(`DataManager: Received update for ${key}`, {
        time: candle.time,
        date: new Date(this.ensureSeconds(candle.time) * 1000).toISOString(),
        open: candle.open,
        close: candle.close
      });
    }
    
    // Get existing chart data
    // Get existing chart data or initialize if not exists
let existingData = this.cachedChartData.get(key);
if (!existingData) {
  console.log(`DataManager: Creating initial data structure for ${key}`);
  
  // Create an empty data structure for this key
  existingData = {
    spotCandles: [],
    deltaVolume: [],
    openInterest: [],
    futuresCandles: [],
    isAggregated: false
  };
  
  // Cache it
  this.cachedChartData.set(key, existingData);
  this.cacheTimestamps.set(key, Date.now());
  
  // Initialize data source info
  this.dataSourceInfo.set(key, {
    hasRealTimeData: true,
    lastRealTimeUpdate: Date.now(),
    sourceType: 'real'
  });
}

    // Determine if this is real or mock data
    const extendedCandle = candle as ExtendedCandle;
    const isRealData = !extendedCandle.isMock;
    
    // If this is real data, update our tracking
    if (isRealData) {
      this.updateDataSourceInfo(key, true);
      
      // Notify socketService about real data reception
      socketService.notifyRealDataReceived(exchange, symbol, interval);
    }
    
    // Mark candle as real-time data with source information
    const realTimeCandle: ExtendedCandle = {
      ...candle,
      source: isRealData ? 'real' : 'mock'
    };
    
    // Find if we need to update an existing candle or add a new one
    const spotCandles = existingData.spotCandles;
    const normalizedTime = this.alignToIntervalBoundary(candle.time, interval);
    
    const existingIndex = spotCandles.findIndex(c => 
      this.ensureSeconds(c.time) === this.ensureSeconds(normalizedTime)
    );
    
    if (existingIndex >= 0) {
      // Get existing candle
      const existingCandle = spotCandles[existingIndex] as ExtendedCandle;
      
      // Determine whether to update based on data source priority:
      // 1. Real data always overwrites mock or historical
      // 2. Historical data overwrites mock data
      // 3. Mock data only overwrites another mock data
      const existingSource = existingCandle.source || 'unknown';
      const shouldUpdate = 
        (realTimeCandle.source === 'real') || 
        (realTimeCandle.source === 'historical' && existingSource !== 'real') ||
        (realTimeCandle.source === 'mock' && existingSource === 'mock');
      
      if (shouldUpdate) {
        // Update existing candle
        spotCandles[existingIndex] = realTimeCandle;
        
        if (this.debugMode) {
          console.log(`DataManager: Updated existing candle at index ${existingIndex} for ${key} (${existingSource} -> ${realTimeCandle.source})`);
        }
      } else if (this.debugMode) {
        console.log(`DataManager: Skipped update for index ${existingIndex} - not overwriting ${existingSource} with ${realTimeCandle.source}`);
      }
    } else {
      // Add new candle
      spotCandles.push(realTimeCandle);
      
      // Sort candles by time
      spotCandles.sort((a, b) => 
        this.ensureSeconds(a.time) - this.ensureSeconds(b.time)
      );
      
      // Limit to MAX_CANDLES candles to prevent memory issues
      if (spotCandles.length > this.MAX_CANDLES) {
        spotCandles.shift();
      }
      
      if (this.debugMode) {
        console.log(`DataManager: Added new candle for ${key}, total: ${spotCandles.length} (source: ${realTimeCandle.source})`);
      }
    }
    
    // Check for gaps in timestamp sequence
    this.checkForTimestampGaps(spotCandles as ExtendedCandle[], interval);
    
    // Update cache timestamp
    this.cacheTimestamps.set(key, Date.now());
    
    // Update deltaVolume
    this.updateDeltaVolume(key, realTimeCandle);
    
    // Check for and fill any gaps in real-time data
    // Do this asynchronously to avoid blocking the update
    Promise.resolve().then(() => {
      this.checkAndFillRecentGaps(exchange, symbol, interval)
        .then(gapsFilled => {
          if (gapsFilled) {
            // If gaps were filled, notify handlers again
            this.notifyUpdateHandlers(key);
          }
        })
        .catch(error => {
          console.error(`Error checking for gaps: ${error}`);
        });
    });
    
    // Notify all registered handlers about the update
    this.notifyUpdateHandlers(key);
  }

  /**
   * Initialize data for a specific market
   */
  public async initialize(
    exchange: string,
    symbol: string,
    interval: TimeInterval = '1m',
    limit: number = 100,
    useDeltaAggregation: boolean = false
  ): Promise<ChartData> {
    const key = this.getKey(exchange, symbol, interval);
    console.log(`DataManager: Initializing data for ${key}`);
    
    // Store the current interval for this key
    this.currentInterval.set(key, interval);
    
    try {
      // Use the aggregator service to get data
      let chartData: ChartData;
      
      // Configure delta aggregation in aggregator service
      if (useDeltaAggregation) {
  // Extract base currency
  const baseCurrency = symbol.includes('-') ? 
    symbol.split('-')[0] : 
    symbol.startsWith('BTC') ? 'BTC' : symbol.slice(0, 3);
  
  console.log(`Setting delta aggregation to ENABLED for ${baseCurrency}`);
  aggregatorService.setDeltaAggregationConfig({
    enabled: true,
    baseCurrency: baseCurrency,
    quoteCurrencies: ['USDT', 'USDC', 'USD']
  });
  
  // Use aggregation mode
  console.log(`DataManager: Using aggregation for ${key}`);
  chartData = await aggregatorService.getAggregatedData(
    symbol, 
    interval, 
    this.adjustLimitForInterval(limit, interval),
    exchange as Exchange
  );
  
  // No additional processing needed for aggregated data
} else {
  // Disable delta aggregation if not requested
  console.log('Disabling delta aggregation');
  aggregatorService.setDeltaAggregationConfig({
    enabled: false,
    baseCurrency: 'BTC',
    quoteCurrencies: ['USDT', 'USDC', 'USD']
  });
  
  // Get chart data directly from aggregator
  chartData = await aggregatorService.getAggregatedData(
    symbol,
    interval,
    this.adjustLimitForInterval(limit, interval),
    exchange as Exchange
  );
  
  // Get the candles
  const candles = chartData.spotCandles;
  
  // Normalize and align all historical candles
  const extendedCandles: ExtendedCandle[] = candles.map(candle => {
    // Align to exact interval boundaries and ensure seconds format
    const normalizedTime = this.alignToIntervalBoundary(candle.time, interval);
    
    return {
      ...candle,
      time: normalizedTime, // Always in seconds
      source: (candle as ExtendedCandle).source || 'historical' // Use typecasting
    };
  });

        // Ensure candles are sorted by time
        const sortedCandles = [...extendedCandles].sort((a, b) => a.time - b.time);
        
        // Remove duplicates that might have occurred during normalization
        const uniqueCandles = this.removeDuplicateCandles(sortedCandles);
        
        // Fill any gaps in candle data for continuity
        const continuousCandles = this.fillCandleGaps(uniqueCandles, interval);
        
        console.log(`DataManager: Processed candles: ${candles.length} → ${extendedCandles.length} → ${uniqueCandles.length} → ${continuousCandles.length}`);
        
        // Update chart data with processed candles
        chartData.spotCandles = this.ensureProperCandleFormat(continuousCandles);
        
        // Try to calculate volume data if needed
        if (!chartData.deltaVolume || chartData.deltaVolume.length === 0) {
          try {
            const volumeData = this.calculateDeltaVolume(continuousCandles);
            chartData.deltaVolume = volumeData;
          } catch (error) {
            console.warn(`DataManager: Error calculating volume data for ${key}:`, error);
          }
        }
      }
      
      // Try to fetch open interest data if not present
      if (!chartData.openInterest || chartData.openInterest.length === 0) {
        try {
          console.log(`DataManager: Fetching open interest data for ${key}`);
          const openInterestData = await this.safeGetOpenInterest(exchange, symbol);
          
          if (openInterestData.length > 0) {
            chartData.openInterest = openInterestData;
            console.log(`DataManager: Successfully added ${openInterestData.length} open interest entries`);
          } else {
            console.log(`DataManager: No open interest data available for ${key}`);
          }
        } catch (error) {
          console.warn(`DataManager: Error fetching open interest data: ${error}`);
        }
      }
      
      // Cache the data
      this.cachedChartData.set(key, chartData);
      this.cacheTimestamps.set(key, Date.now());
      
      // Initialize data source info
      this.dataSourceInfo.set(key, {
        hasRealTimeData: false,
        lastRealTimeUpdate: 0,
        sourceType: 'historical'
      });
      
      // Initialize last gap check time
      this.lastGapCheckTime.set(key, Date.now());
      
      // Notify socketService that initial data has been loaded
      socketService.notifyRealDataReceived(exchange, symbol, interval);
      
      // Set up WebSocket for real-time updates
      this.setupRealTimeUpdates(exchange, symbol, interval);
      
      // Log data statistics
      if (this.debugMode) {
        const { spotCandles, openInterest } = chartData;
        console.log(`DataManager: Initialized ${spotCandles.length} candles for ${key}`);
        console.log(`DataManager: Loaded ${openInterest?.length || 0} open interest entries for ${key}`);
        if (spotCandles.length > 0) {
          const firstTime = this.ensureSeconds(spotCandles[0].time);
          const lastTime = this.ensureSeconds(spotCandles[spotCandles.length - 1].time);
          console.log(`DataManager: Time range: ${new Date(firstTime * 1000).toISOString()} to ${new Date(lastTime * 1000).toISOString()}`);
        }
      }
      
      return chartData;
    } catch (error) {
      console.error(`DataManager: Error initializing data for ${key}:`, error);
      
      // Return empty data on error
      const emptyData: ChartData = {
        spotCandles: [],
        deltaVolume: [],
        openInterest: [],
        futuresCandles: [],
        isAggregated: false
      };
      return emptyData;
    }
  }

  /**
   * Set up real-time updates for a symbol
   */
  private setupRealTimeUpdates(
    exchange: string,
    symbol: string,
    interval: TimeInterval
  ): void {
    const key = this.getKey(exchange, symbol, interval);
    console.log(`DataManager: Setting up real-time updates for ${key}`);
    
    // Set up WebSocket handlers
    socketService.setHandlersForSubscription(exchange, symbol, interval, {
      onUpdate: (updatedExchange: string, updatedSymbol: string, candleData: Candle) => {
        // Check if this update is for the symbol we're interested in
        const updateKey = this.getKey(updatedExchange, updatedSymbol, interval);
        if (updateKey !== key) return;
        
        // Process candle update
        this.handleCandleUpdate(updatedExchange, updatedSymbol, interval, candleData);
      },
      onError: (message: string) => {
        console.error('WebSocket error:', message);
      }
    });
    
    // Subscribe to updates
    socketService.subscribe(exchange, symbol, interval);
    
    // Set up periodic gap checking
    const checkGapsInterval = setInterval(() => {
      this.checkAndFillRecentGaps(exchange, symbol, interval)
        .then(gapsFilled => {
          if (gapsFilled) {
            // If gaps were filled, notify handlers
            this.notifyUpdateHandlers(key);
          }
        })
        .catch(error => {
          console.error(`Error in periodic gap check: ${error}`);
        });
    }, this.GAP_CHECK_INTERVAL);
    
    // Clean up interval on unregister
    const cleanupHandler = () => {
      clearInterval(checkGapsInterval);
    };
    
    // Store the cleanup handler with the symbol
    const handlers = this.updateHandlers.get(key) || new Set();
    handlers.add(cleanupHandler);
    this.updateHandlers.set(key, handlers);
  }

  /**
   * Safely get open interest data without throwing errors
   */
  private async safeGetOpenInterest(exchange: string, symbol: string): Promise<OpenInterest[]> {
    try {
      // Try to get exchange-specific service
      const exchangeService = aggregatorService.getExchangeByName(exchange as Exchange);
      if (!exchangeService) {
        console.warn(`Exchange ${exchange} not found for open interest fetch`);
        return [];
      }
      
      // If the exchange service has a method to get open interest, use it
      if (typeof exchangeService.getOpenInterest === 'function') {
        console.log(`Fetching open interest from ${exchange} for ${symbol}`);
        const openInterestData = await exchangeService.getOpenInterest(symbol, '1m', 100);
        console.log(`Received ${openInterestData.length} open interest entries`);
        return openInterestData;
      }
      
      // Fallback to aggregator
      console.log(`Falling back to aggregator for open interest data`);
      return await aggregatorService.getAggregatedOpenInterest(symbol, '1m');
    } catch (error) {
      console.warn(`DataManager: Error getting open interest for ${exchange}:${symbol}:`, error);
      return [];
    }
  }

  /**
   * Calculate volume data from candles
   */
  private calculateDeltaVolume(candles: Candle[]): DeltaVolume[] {
    return candles.map(candle => {
      const delta = candle.close - candle.open;
  
      // Signed volume: negative if candle closed lower
      const signedVolume = delta >= 0 ? candle.volume : -candle.volume;
  
      return {
        time: candle.time,
        value: signedVolume,
        color: delta >= 0 ? '#26a69a' : '#ef5350' // Optional for visuals
      };
    });
  }
  

  /**
   * Get current data for a specific market
   */
  public getData(
    exchange: string,
    symbol: string,
    interval: TimeInterval = '1m'
  ): ChartData | null {
    const key = this.getKey(exchange, symbol, interval);
    
    // Check if data is cached
    if (this.cachedChartData.has(key)) {
      const chartData = this.cachedChartData.get(key)!;
      
      // Store current interval for this key
      const currentInterval = this.currentInterval.get(key);
      if (currentInterval !== interval) {
        console.log(`DataManager: Interval changed for ${key} from ${currentInterval} to ${interval}`);
        
        // If the interval has changed, we need to reinitialize
        this.cleanup(exchange, symbol, currentInterval);
        
        // Initialize with the new interval
        this.initialize(exchange, symbol, interval).catch(error => {
          console.error(`DataManager: Error reinitializing with new interval:`, error);
        });
        
        // Return null to indicate reinitialization
        return null;
      }
      
      // Check for gaps in real-time data (triggers asynchronously)
      Promise.resolve().then(() => {
        this.checkAndFillRecentGaps(exchange, symbol, interval)
          .then(gapsFilled => {
            if (gapsFilled) {
              // If gaps were filled, notify handlers
              this.notifyUpdateHandlers(key);
            }
          })
          .catch(error => {
            console.error(`Error checking for gaps in getData: ${error}`);
          });
      });
      
      return chartData;
    }
    
    // Check if data is stale and needs refresh
    if (this.isDataStale(key)) {
      console.log(`DataManager: Data is stale for ${key}, reinitializing`);
      
      // Reinitialize data
      this.initialize(exchange, symbol, interval).catch(error => {
        console.error(`DataManager: Error reinitializing stale data:`, error);
      });
      
      // Return null to indicate reinitialization
      return null;
    }
    
    // Return empty data if not cached
    console.warn(`DataManager: No cached data found for ${key}`);
    return {
      spotCandles: [],
      deltaVolume: [],
      openInterest: [],
      futuresCandles: [],
      isAggregated: false
    };
  }

  /**
   * Check if data is stale and needs refresh
   */
  private isDataStale(key: string): boolean {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp) return true;
    
    return Date.now() - timestamp > this.CACHE_TTL;
  }

  /**
   * Clean up resources for a specific market
   */
  public cleanup(
    exchange: string,
    symbol: string,
    interval?: TimeInterval
  ): void {
    // If interval not specified, clean up all intervals for this symbol
    if (!interval) {
      // Find all keys that match the exchange and symbol
      const keysToRemove: string[] = [];
      
      for (const key of this.updateHandlers.keys()) {
        const [keyExchange, keySymbol] = key.split(':');
        if (keyExchange === exchange && keySymbol === symbol) {
          keysToRemove.push(key);
        }
      }
      
      // Clean up each key
      for (const key of keysToRemove) {
        this.cleanupKey(key);
      }
      
      return;
    }
    
    // Clean up specific key
    const key = this.getKey(exchange, symbol, interval);
    this.cleanupKey(key);
  }

  /**
   * Clean up resources for a specific key
   */
  private cleanupKey(key: string): void {
    console.log(`DataManager: Cleaning up resources for ${key}`);
    
    // Get handlers for this key
    const handlers = this.updateHandlers.get(key) || new Set();
    if (!handlers) {
      console.log(`DataManager: No handlers found for ${key}`);
      return;
    }
    
    // Extract exchange, symbol, interval from key
    const [exchange, symbol, interval] = key.split(':');
    
    try {
      // Unsubscribe from socket
      socketService.unsubscribe(
        exchange, 
        symbol, 
        interval as TimeInterval
      );
    } catch (error) {
      console.error(`DataManager: Error unsubscribing from ${key}:`, error);
    }
    
    // Call cleanup handlers
    handlers.forEach(handler => {
      try {
        handler();
      } catch (error) {
        console.error(`Error in cleanup handler:`, error);
      }
    });
    
    // Clear data
    this.updateHandlers.delete(key);
    this.cachedChartData.delete(key);
    this.cacheTimestamps.delete(key);
    this.dataSourceInfo.delete(key);
    this.lastGapCheckTime.delete(key);
    this.currentInterval.delete(key);
    
    console.log(`DataManager: Cleaned up resources for ${key}`);
  }

  /**
   * Get available exchanges
   */
  public getExchanges(): string[] {
    return aggregatorService.getExchanges();
  }

  /**
   * Get available symbols for an exchange
   */
  public async getSymbols(exchange: string): Promise<MarketSymbol[]> {
    try {
      const exchangeService = aggregatorService.getExchangeByName(exchange as Exchange);
      if (exchangeService) {
        return await exchangeService.getSymbols();
      } else {
        console.error(`DataManager: Exchange ${exchange} not found`);
        return [];
      }
    } catch (error) {
      console.error(`DataManager: Error getting symbols for ${exchange}:`, error);
      return [];
    }
  }

  /**
   * Ensure timestamp is in seconds format
   */
  private ensureSeconds(time: number): number {
    // If timestamp is in milliseconds, convert to seconds
    return time > 10000000000 ? Math.floor(time / 1000) : time;
  }

  /**
   * Align timestamp to interval boundary
   * IMPROVED: Better handling of larger intervals
   */
  private alignToIntervalBoundary(time: number, interval: TimeInterval): number {
    const timeInSeconds = this.ensureSeconds(time);
    const intervalSeconds = this.getIntervalInSeconds(interval);
    
    // For intervals larger than 1 hour, align to hour boundaries first
    if (intervalSeconds >= 3600) {
      // First align to hour boundary
      const hourAlignedTime = Math.floor(timeInSeconds / 3600) * 3600;
      
      // Then align to interval boundary
      const intervalsPerDay = 86400 / intervalSeconds;
      const hourOfDay = new Date(hourAlignedTime * 1000).getUTCHours();
      const intervalNumber = Math.floor(hourOfDay / (24 / intervalsPerDay));
      
      return Math.floor(hourAlignedTime / 86400) * 86400 + intervalNumber * intervalSeconds;
    }
    
    // For smaller intervals, use simple alignment
    const alignedTime = Math.floor(timeInSeconds / intervalSeconds) * intervalSeconds;
    
    // Only log occasionally to avoid flooding console
    if (Math.random() < this.DEBUG_LOG_FREQUENCY) {
      console.log(`DataManager: Aligned timestamp for ${interval}: ${timeInSeconds} -> ${alignedTime} (${new Date(alignedTime * 1000).toISOString()})`);
    }
    
    return alignedTime;
  }

  /**
   * Convert interval to seconds
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
   * Check for gaps in timestamp sequence and log warnings
   */
  private checkForTimestampGaps(candles: ExtendedCandle[], interval: TimeInterval): void {
    if (candles.length < 2) return;
    
    // Get the interval in seconds
    const intervalSeconds = this.getIntervalInSeconds(interval);
    
    // Track if we found gaps that need filling
    let gapsFound = false;
    
    // Check the last 10 candles for gaps
    const maxCheck = Math.min(10, candles.length - 1);
    for (let i = 0; i < maxCheck; i++) {
      const currentTime = candles[candles.length - 1 - i].time;
      const prevTime = candles[candles.length - 2 - i].time;
      
      const diff = currentTime - prevTime;
      
      if (diff > intervalSeconds * this.GAP_THRESHOLD) {
        console.warn(`DataManager: Gap detected in candle timestamps: ${diff} seconds (expected ${intervalSeconds})`);
        console.warn(`  Current: ${new Date(currentTime * 1000).toISOString()}`);
        console.warn(`  Previous: ${new Date(prevTime * 1000).toISOString()}`);
        gapsFound = true;
      }
    }
    
    // If gaps were found, we could trigger a refill here
    if (gapsFound) {
      // For now, just log it - we have our checkAndFillRecentGaps function that handles this
      console.log('DataManager: Gaps found in recent candles, will be filled by gap filler');
    }
  }

  /**
   * Check for and fill gaps in real-time data
   * This helps with the issue of dropped/skipped candles in live data
   */
  private async checkAndFillRecentGaps(
    exchange: string,
    symbol: string,
    interval: TimeInterval
  ): Promise<boolean> {
    const key = this.getKey(exchange, symbol, interval);
    const now = Date.now();
    
    // Check if we need to run the gap check (avoid running too frequently)
    const lastCheckTime = this.lastGapCheckTime.get(key) || 0;
    if (now - lastCheckTime < this.GAP_CHECK_INTERVAL) {
      return false; // Skip if we checked recently
    }
    
    // Update last check time
    this.lastGapCheckTime.set(key, now);
    
    // Get current chart data
    const chartData = this.cachedChartData.get(key);
    if (!chartData) {
      console.warn(`DataManager: No cached data found for gap check on ${key}`);
      return false;
    }
    
    const candles = chartData.spotCandles as ExtendedCandle[];
    if (candles.length < 2) return false;
    
    const lastCandle = candles[candles.length - 1];
    const secondLastCandle = candles[candles.length - 2];
    
    // Calculate time difference
   const currentTimeInSeconds = Math.floor(now / 1000);
   const lastCandleTime = lastCandle.time;
   const intervalSeconds = this.getIntervalInSeconds(interval);
   
   // Check for gap between last candle and current time
   const timeSinceLastCandle = currentTimeInSeconds - lastCandleTime;
   const expectedIntervals = Math.floor(timeSinceLastCandle / intervalSeconds);
   
   // Check for gap between second last and last candle
   const gapBetweenLastCandles = lastCandleTime - secondLastCandle.time;
   
   // Log relevant information
   console.log(`DataManager: Gap check for ${key}:`, {
     currentTime: new Date(currentTimeInSeconds * 1000).toISOString(),
     lastCandleTime: new Date(lastCandleTime * 1000).toISOString(),
     timeSinceLastCandle: `${timeSinceLastCandle}s (${expectedIntervals} intervals)`,
     gapBetweenLastCandles: `${gapBetweenLastCandles}s (expected ${intervalSeconds}s)`
   });
   
   // Detect gaps
   const hasRecentGap = (
     // Gap from last candle to now is too big (more than threshold intervals old)
     (timeSinceLastCandle > intervalSeconds * this.GAP_THRESHOLD) ||
     // Gap between last two candles is too big
     (gapBetweenLastCandles > intervalSeconds * this.GAP_THRESHOLD)
   );
   
   if (!hasRecentGap) {
     console.log(`DataManager: No significant gaps detected for ${key}`);
     return false;
   }
   
   console.log(`DataManager: Gap detected in real-time data for ${key}, fetching recent candles to fill`);
   
   try {
     // Fetch a smaller batch of recent candles (just enough to fill gaps)
     const fetchLimit = Math.max(10, expectedIntervals + 5); // Add buffer candles
     const freshCandles = await apiService.getHistoricalCandles(
       exchange, 
       symbol, 
       interval, 
       fetchLimit
     );
     
     if (freshCandles.length === 0) {
       console.log(`DataManager: No fresh candles received for ${key}`);
       return false;
     }
     
     console.log(`DataManager: Received ${freshCandles.length} fresh candles to fill gaps`);
     
     // Normalize the fresh candles
     const normalizedFreshCandles: ExtendedCandle[] = freshCandles.map(candle => {
       const normalizedTime = this.alignToIntervalBoundary(candle.time, interval);
       return {
         ...candle,
         time: normalizedTime,
         source: 'historical'
       };
     });
     
     // Find existing candle times
     const existingTimes = new Set(candles.map(c => c.time));
     
     // Identify truly new candles (not already in our dataset)
     const newCandles = normalizedFreshCandles.filter(c => !existingTimes.has(c.time));
     
     if (newCandles.length === 0) {
       console.log(`DataManager: No new candles found to fill gaps in ${key}`);
       return false;
     }
     
     console.log(`DataManager: Adding ${newCandles.length} new candles to fill gaps in ${key}`);
     
     // Add new candles to existing set
     const updatedCandles = [...candles, ...newCandles];
     
     // Remove any duplicates
     const uniqueCandles = this.removeDuplicateCandles(updatedCandles);
     
     // Fill any remaining gaps
     const filledCandles = this.fillCandleGaps(uniqueCandles, interval);
     
     // Update our data
     chartData.spotCandles = this.ensureProperCandleFormat(filledCandles);
     
     // Update cache
     this.cachedChartData.set(key, chartData);
     this.cacheTimestamps.set(key, Date.now());
     
     // Update delta volume for new candles
     const newDeltaVolume = this.calculateDeltaVolume(newCandles);
     const existingDeltaVolume = chartData.deltaVolume || [];
     
     // Add new delta volume entries
     const existingDeltaVolumeTimes = new Set(existingDeltaVolume.map(d => d.time));
     const uniqueNewDeltaVolume = newDeltaVolume.filter(d => !existingDeltaVolumeTimes.has(d.time));
     
     if (uniqueNewDeltaVolume.length > 0) {
       const updatedDeltaVolume = [...existingDeltaVolume, ...uniqueNewDeltaVolume]
         .sort((a, b) => a.time - b.time);
       
       chartData.deltaVolume = updatedDeltaVolume;
     }
     
     console.log(`DataManager: Successfully filled gaps for ${key}, now have ${filledCandles.length} candles`);
     return true;
   } catch (error) {
     console.error(`DataManager: Error filling gaps for ${key}:`, error);
     return false;
   }
 }

 /**
  * Remove duplicate candles with the same timestamp
  */
 private removeDuplicateCandles(candles: ExtendedCandle[]): ExtendedCandle[] {
   const timeMap = new Map<number, ExtendedCandle>();
   
   // Process candles in reverse order (newest first) to prefer newer data
   for (let i = candles.length - 1; i >= 0; i--) {
     const candle = candles[i];
     
     // If this timestamp doesn't exist yet, add it
     if (!timeMap.has(candle.time)) {
       timeMap.set(candle.time, candle);
     } 
     // If it does exist, decide which to keep based on source priority
     else {
       const existing = timeMap.get(candle.time)!;
       
       // Replace existing candle if the new one has higher priority
       // Priority: real > historical > mock
       if (
         (candle.source === 'real' && existing.source !== 'real') ||
         (candle.source === 'historical' && existing.source === 'mock')
       ) {
         timeMap.set(candle.time, candle);
       }
     }
   }
   
   // Convert back to array and sort by time
   return Array.from(timeMap.values()).sort((a, b) => a.time - b.time);
 }

 /**
  * Fill gaps in candle data to ensure continuity
  */
 private fillCandleGaps(
   candles: ExtendedCandle[], 
   interval: TimeInterval
 ): ExtendedCandle[] {
   if (candles.length < 2) return candles;
   
   // Determine interval in seconds
   const intervalSeconds = this.getIntervalInSeconds(interval);
   
   const result: ExtendedCandle[] = [candles[0]];
   let gapsFilled = 0;
   
   for (let i = 1; i < candles.length; i++) {
     const prevCandle = candles[i - 1];
     const currentCandle = candles[i];
     
     // Check if there's a gap (more than threshold * the interval)
     const timeDiff = currentCandle.time - prevCandle.time;
     if (timeDiff > intervalSeconds * this.GAP_THRESHOLD) {
       console.log(`DataManager: Filling gap between ${new Date(prevCandle.time * 1000).toISOString()} and ${new Date(currentCandle.time * 1000).toISOString()}`);
       
       // Calculate number of intervals to fill
       const intervalsToFill = Math.floor(timeDiff / intervalSeconds) - 1;
       if (intervalsToFill > 0) {
         // Create interpolated candles between the gap
         for (let j = 1; j <= intervalsToFill; j++) {
           const fillTime = prevCandle.time + j * intervalSeconds;
           
           // Create a filled candle
           result.push({
             time: fillTime,
             open: prevCandle.close,
             high: prevCandle.close,
             low: prevCandle.close,
             close: prevCandle.close,
             volume: 0,
             source: 'historical', // Mark filled candles as historical
             isMock: true // Also mark as mock data for visual distinction
           });
           
           gapsFilled++;
         }
       }
     }
     
     result.push(currentCandle);
   }
   
   if (gapsFilled > 0) {
     console.log(`DataManager: Filled ${gapsFilled} gaps to ensure data continuity`);
   }
   
   return result;
 }

 /**
  * Ensure candle data is properly formatted for chart rendering
  */
 private ensureProperCandleFormat(candles: ExtendedCandle[]): Candle[] {
   return candles.map(candle => {
     // Ensure all numeric values are actual numbers and not strings
     return {
       time: Number(candle.time),
       open: Number(candle.open),
       high: Number(candle.high),
       low: Number(candle.low),
       close: Number(candle.close),
       volume: Number(candle.volume)
     };
   }).filter(candle => {
     // Filter out any candles with invalid data
     return !isNaN(candle.time) && 
            !isNaN(candle.open) && 
            !isNaN(candle.high) && 
            !isNaN(candle.low) && 
            !isNaN(candle.close) && 
            !isNaN(candle.volume) &&
            candle.time > 0;
   });
 }

 /**
  * Adjust limit based on interval to ensure sufficient data points
  */
 private adjustLimitForInterval(baseLimit: number, interval: TimeInterval): number {
   // Increase the limit for larger intervals to maintain sufficient data points
   switch (interval) {
     case '1m': return baseLimit;
     case '5m': return baseLimit * 2;
     case '15m': return baseLimit * 3;
     case '30m': return baseLimit * 4;
     case '1h': return baseLimit * 6;
     case '4h': return baseLimit * 12;
     case '1d': return baseLimit * 24;
     default: return baseLimit;
   }
 }

 /**
  * Update delta volume data
  */
 private updateDeltaVolume(key: string, candle: ExtendedCandle): void {
   // Get chart data
   const chartData = this.cachedChartData.get(key);
   if (!chartData) return;
   
   // Calculate delta volume for this candle
   const newDeltaVolume = this.calculateDeltaVolume([candle])[0];
   const existingDeltaVolume = chartData.deltaVolume || [];
   
   // Check if we already have delta volume for this time
   const deltaIndex = existingDeltaVolume.findIndex(d => d.time === candle.time);
   
   if (deltaIndex >= 0) {
     // Update existing delta volume with normalized timestamp
     existingDeltaVolume[deltaIndex] = newDeltaVolume;
   } else {
     // Add new delta volume with properly aligned timestamp
     existingDeltaVolume.push(newDeltaVolume);
     
     // Sort by time
     existingDeltaVolume.sort((a, b) => a.time - b.time);
     
     // Limit to MAX_CANDLES entries
     if (existingDeltaVolume.length > this.MAX_CANDLES) {
       existingDeltaVolume.shift();
     }
   }
   
   // Update delta volume
   chartData.deltaVolume = existingDeltaVolume;
   this.cachedChartData.set(key, chartData);
 }

 /**
  * Update data source information for a symbol
  */
 private updateDataSourceInfo(key: string, isRealData: boolean): void {
   const info = this.dataSourceInfo.get(key) || {
     hasRealTimeData: false,
     lastRealTimeUpdate: 0,
     sourceType: 'historical'
   };
   
   if (isRealData) {
     info.hasRealTimeData = true;
     info.lastRealTimeUpdate = Date.now();
     info.sourceType = 'real';
     
     // Only log occasionally to reduce spam
     if (Math.random() < this.DEBUG_LOG_FREQUENCY) {
       console.log(`DataManager: Updated data source info for ${key} - now using REAL data`);
     }
   }
   
   this.dataSourceInfo.set(key, info);
 }

 /**
  * Notify update handlers for a key
  */
 private notifyUpdateHandlers(key: string): void {
  const handlers = this.updateHandlers.get(key) || new Set();
  
  if (handlers.size === 0) {
    return; // No handlers to notify
  }
  
  console.log(`DataManager: About to notify ${handlers.size} handlers for ${key}`);
  
  // Call all handlers
  let handlersCalled = 0;
  handlers.forEach(handler => {
    try {
      handler();
      handlersCalled++;
    } catch (error) {
      console.error('Error in update handler:', error);
    }
  });
  
  console.log(`DataManager: Successfully called ${handlersCalled} handlers for ${key}`);
}

 /**
  * Get a unique key for a symbol
  */
 private getKey(
   exchange: string,
   symbol: string,
   interval: TimeInterval
 ): string {
   return `${exchange}:${symbol}:${interval}`;
 }
}

// Create singleton instance
const dataManagerInstance = DataManager.getInstance();

// Add this to expose dataManager to window for debugging
interface ExtendedWindow extends Window {
 dataManager?: DataManager;
}

// Add this to expose dataManager to window for debugging with proper typing
if (typeof window !== 'undefined') {
 (window as ExtendedWindow).dataManager = dataManagerInstance;
 console.log('dataManager attached to window object for debugging');
}

console.log('dataManager module loaded and singleton instance created');

// Export both the class and a singleton instance to ensure compatibility
export const dataManager = dataManagerInstance;
export default dataManager;