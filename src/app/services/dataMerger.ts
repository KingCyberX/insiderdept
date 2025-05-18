// src/app/services/dataManager.ts

import { Candle, TimeInterval, DeltaVolume, ChartData } from '../types/market';
import socketService from './socketService';
import apiService from './apiService';

/**
 * Data manager service to combine real-time and historical data
 */
class DataManager {
  private candles: Map<string, Candle[]> = new Map();
  private deltaVolume: Map<string, DeltaVolume[]> = new Map();
  private isInitialized: Map<string, boolean> = new Map();
  private updateHandlers: Map<string, Set<() => void>> = new Map();
  
  constructor() {
    // Log when dataManager instance is created
    console.log('DataManager instance created');
  }
  
  /**
   * Initialize data for a symbol
   */
  async initialize(
    exchange: string,
    symbol: string,
    interval: TimeInterval = '1m',
    limit: number = 100
  ): Promise<ChartData> {
    try {
      console.log(`DataManager: Initializing data for ${exchange}:${symbol}:${interval}`);
      const key = this.getKey(exchange, symbol, interval);
      
      // Get historical data
      const historicalCandles = await apiService.getHistoricalCandles(
        exchange,
        symbol,
        interval,
        limit
      );
      
      // Calculate delta volume
      const deltaVolume = this.calculateDeltaVolume(historicalCandles);
      
      // Store data
      this.candles.set(key, historicalCandles);
      this.deltaVolume.set(key, deltaVolume);
      this.isInitialized.set(key, true);
      
      // Set up WebSocket for real-time updates
      this.setupRealTimeUpdates(exchange, symbol, interval);
      
      console.log(`DataManager: Data initialized for ${key} with ${historicalCandles.length} candles`);
      
      return {
        spotCandles: historicalCandles,
        deltaVolume,
        futuresCandles: [],
        openInterest: [],
        isAggregated: false
      };
    } catch (error) {
      console.error('Error initializing data:', error);
      throw error;
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
    socketService.setHandlers({
      onUpdate: (updatedExchange, updatedSymbol, candleData) => {
        // Check if this update is for the symbol we're interested in
        const updateKey = this.getKey(updatedExchange, updatedSymbol, interval);
        if (updateKey !== key) return;
        
        // Update candles
        this.updateCandle(key, candleData);
        
        // Notify handlers
        this.notifyUpdateHandlers(key);
      },
      onError: (message) => {
        console.error('WebSocket error:', message);
      }
    });
    
    // Subscribe to updates
    socketService.subscribe(exchange, symbol, interval);
  }
  
  /**
   * Update a candle in the dataset
   */
  private updateCandle(key: string, newCandle: Candle): void {
    // Get existing candles
    const existingCandles = this.candles.get(key) || [];
    
    // Check if we already have a candle for this time
    const index = existingCandles.findIndex(c => c.time === newCandle.time);
    
    if (index >= 0) {
      // Update existing candle
      existingCandles[index] = newCandle;
    } else {
      // Add new candle
      existingCandles.push(newCandle);
      
      // Sort by time
      existingCandles.sort((a, b) => a.time - b.time);
      
      // Limit to 1000 candles to prevent memory issues
      if (existingCandles.length > 1000) {
        existingCandles.shift();
      }
    }
    
    // Update candles
    this.candles.set(key, existingCandles);
    
    // Update delta volume
    const newDeltaVolume = this.calculateDeltaVolume([newCandle])[0];
    const existingDeltaVolume = this.deltaVolume.get(key) || [];
    
    // Check if we already have delta volume for this time
    const deltaIndex = existingDeltaVolume.findIndex(d => d.time === newCandle.time);
    
    if (deltaIndex >= 0) {
      // Update existing delta volume
      existingDeltaVolume[deltaIndex] = newDeltaVolume;
    } else {
      // Add new delta volume
      existingDeltaVolume.push(newDeltaVolume);
      
      // Sort by time
      existingDeltaVolume.sort((a, b) => a.time - b.time);
      
      // Limit to 1000 entries
      if (existingDeltaVolume.length > 1000) {
        existingDeltaVolume.shift();
      }
    }
    
    // Update delta volume
    this.deltaVolume.set(key, existingDeltaVolume);
  }
  
  /**
   * Calculate delta volume from candles
   */
  private calculateDeltaVolume(candles: Candle[]): DeltaVolume[] {
    return candles.map(candle => {
      const delta = candle.close - candle.open;
      return {
        time: candle.time,
        value: candle.volume,
        color: delta >= 0 ? '#26a69a' : '#ef5350'
      };
    });
  }
  
  /**
   * Get the latest data for a symbol
   */
  getData(
    exchange: string,
    symbol: string,
    interval: TimeInterval = '1m'
  ): ChartData | null {
    const key = this.getKey(exchange, symbol, interval);
    
    // Check if data is initialized
    if (!this.isInitialized.get(key)) {
      console.log(`DataManager: Data not initialized for ${key}`);
      return null;
    }
    
    // Get data
    const spotCandles = this.candles.get(key) || [];
    const deltaVolume = this.deltaVolume.get(key) || [];
    
    return {
      spotCandles,
      deltaVolume,
      futuresCandles: [],
      openInterest: [],
      isAggregated: false
    };
  }
  
  /**
   * Register a handler for data updates
   */
  registerUpdateHandler(
    exchange: string,
    symbol: string,
    interval: TimeInterval,
    handler: () => void
  ): void {
    const key = this.getKey(exchange, symbol, interval);
    console.log(`DataManager: Registering update handler for ${key}`);
    
    // Get existing handlers
    const handlers = this.updateHandlers.get(key) || new Set();
    
    // Add handler
    handlers.add(handler);
    
    // Update handlers
    this.updateHandlers.set(key, handlers);
    
    console.log(`DataManager: Registered handler for ${key}, total handlers: ${handlers.size}`);
  }
  
  /**
   * Unregister a handler for data updates
   */
  unregisterUpdateHandler(
    exchange: string,
    symbol: string,
    interval: TimeInterval,
    handler: () => void
  ): void {
    const key = this.getKey(exchange, symbol, interval);
    console.log(`DataManager: Unregistering update handler for ${key}`);
    
    // Get existing handlers
    const handlers = this.updateHandlers.get(key) || new Set();
    
    // Remove handler
    handlers.delete(handler);
    
    // Update handlers
    this.updateHandlers.set(key, handlers);
    
    console.log(`DataManager: Unregistered handler for ${key}, remaining handlers: ${handlers.size}`);
  }
  
  /**
   * Notify update handlers for a key
   */
  private notifyUpdateHandlers(key: string): void {
    const handlers = this.updateHandlers.get(key) || new Set();
    
    if (handlers.size === 0) {
      return; // No handlers to notify
    }
    
    console.log(`DataManager: Notifying ${handlers.size} handlers for ${key}`);
    
    // Call all handlers
    handlers.forEach(handler => {
      try {
        handler();
      } catch (error) {
        console.error('Error in update handler:', error);
      }
    });
  }
  
  /**
   * Clean up resources for a symbol
   */
  cleanup(
    exchange: string,
    symbol: string,
    interval: TimeInterval = '1m'
  ): void {
    const key = this.getKey(exchange, symbol, interval);
    console.log(`DataManager: Cleaning up resources for ${key}`);
    
    // Unsubscribe from WebSocket
    socketService.unsubscribe(exchange, symbol, interval);
    
    // Clear data
    this.candles.delete(key);
    this.deltaVolume.delete(key);
    this.isInitialized.delete(key);
    this.updateHandlers.delete(key);
    
    console.log(`DataManager: Cleanup completed for ${key}`);
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
const dataManager = new DataManager();

// Add this to expose dataManager to window for debugging
interface ExtendedWindow extends Window {
  dataManager?: typeof dataManager;
}

// Add this to expose dataManager to window for debugging with proper typing
if (typeof window !== 'undefined') {
  (window as ExtendedWindow).dataManager = dataManager;
}

console.log('dataManager module loaded and singleton instance created');

export default dataManager;