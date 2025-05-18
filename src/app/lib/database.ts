// src/app/lib/database.ts
import { Candle } from '../types/market';

// Simplified in-memory database implementation
// This avoids TypeScript errors with the IndexedDB implementation
// You can replace this with a proper IndexedDB implementation later

class Database {
  private readonly storage: Map<string, Candle[]> = new Map();
  private readonly timestamps: Map<string, Map<number, Candle>> = new Map();
  private readonly DB_NAME = 'crypto-chart-db';
  private readonly DB_VERSION = 1;
  private initialized = false;

  // Initialize the database
  public async init(): Promise<void> {
    if (this.initialized) return; // Already initialized
    
    try {
      console.log('Database initialized (in-memory mode)');
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  // Store a batch of candles
  public async storeCandles(
    exchange: string,
    symbol: string,
    interval: string,
    candles: Candle[]
  ): Promise<void> {
    if (!this.initialized) await this.init();
    
    const exchangeSymbolInterval = `${exchange}-${symbol}-${interval}`;
    
    // Store by exchange-symbol-interval
    if (!this.storage.has(exchangeSymbolInterval)) {
      this.storage.set(exchangeSymbolInterval, []);
    }
    
    // Store by timestamp
    if (!this.timestamps.has(exchangeSymbolInterval)) {
      this.timestamps.set(exchangeSymbolInterval, new Map());
    }
    
    const timeMap = this.timestamps.get(exchangeSymbolInterval)!;
    
    // Add each candle to storage
    for (const candle of candles) {
      // Add to timestamp map
      timeMap.set(candle.time, { ...candle });
    }
    
    // Update the array storage with sorted values
    const sortedCandles = Array.from(timeMap.values())
      .sort((a, b) => a.time - b.time);
    
    this.storage.set(exchangeSymbolInterval, sortedCandles);
    
    console.log(`Stored ${candles.length} candles for ${exchangeSymbolInterval}`);
  }

  // Get candles for a specific exchange, symbol, and interval
  public async getCandles(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number = 100
  ): Promise<Candle[]> {
    if (!this.initialized) await this.init();
    
    const exchangeSymbolInterval = `${exchange}-${symbol}-${interval}`;
    
    // Get candles from storage
    const candles = this.storage.get(exchangeSymbolInterval) || [];
    
    // Return last 'limit' candles
    return candles.slice(-limit);
  }

  // Delete candles older than a certain time
  public async purgeOldCandles(olderThan: number): Promise<void> {
    if (!this.initialized) await this.init();
    
    // Iterate through all exchange-symbol-interval entries
    for (const [key, candles] of this.storage.entries()) {
      // Filter out old candles
      const filteredCandles = candles.filter(candle => candle.time >= olderThan);
      
      // Update storage
      this.storage.set(key, filteredCandles);
      
      // Update timestamp map
      const timeMap = this.timestamps.get(key);
      if (timeMap) {
        // Remove old timestamps
        for (const time of timeMap.keys()) {
          if (time < olderThan) {
            timeMap.delete(time);
          }
        }
      }
    }
    
    console.log(`Purged candles older than ${new Date(olderThan * 1000).toISOString()}`);
  }

  // Check if we have candles for a specific exchange, symbol, and interval
  public async hasCandles(
    exchange: string,
    symbol: string,
    interval: string
  ): Promise<boolean> {
    if (!this.initialized) await this.init();
    
    const exchangeSymbolInterval = `${exchange}-${symbol}-${interval}`;
    
    // Check if we have any candles for this combination
    const candles = this.storage.get(exchangeSymbolInterval) || [];
    return candles.length > 0;
  }
}

// Create a singleton instance
const database = new Database();

export default database;