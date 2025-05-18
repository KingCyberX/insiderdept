// src/app/models/CandleHistory.ts
import { Candle, TimeInterval } from '../app/types/market';

// Define schema for candle history
export interface CandleHistoryRecord {
  exchange: string;
  symbol: string;
  interval: TimeInterval;
  candles: Candle[];
  lastUpdated: number; // Unix timestamp in seconds
}

export interface CandleHistoryQuery {
  exchange: string;
  symbol: string;
  interval: TimeInterval;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

// Define interface for database operations
export interface CandleHistoryStorage {
  storeCandles(record: CandleHistoryRecord): Promise<void>;
  getCandles(query: CandleHistoryQuery): Promise<Candle[]>;
  hasCandles(exchange: string, symbol: string, interval: TimeInterval): Promise<boolean>;
  purgeOldCandles(olderThan: number): Promise<void>;
}

// Additional metadata for aggregation
export interface CandleHistoryMetadata {
  isAggregated: boolean;
  sourceExchanges?: string[];
  baseAsset?: string;
  quoteAssets?: string[];
}

// Combine the record with metadata
export interface CandleHistoryRecordWithMetadata extends CandleHistoryRecord {
  metadata?: CandleHistoryMetadata;
}

// Export a helper class to standardize candle history operations
export class CandleHistoryHelper {
  // Helper function to create a unique key for a candle query
  public static createKey(exchange: string, symbol: string, interval: TimeInterval): string {
    return `${exchange}-${symbol}-${interval}`;
  }
  
  // Helper to validate if a candle array is valid
  public static isValidCandleArray(candles: Candle[]): boolean {
    if (!Array.isArray(candles) || candles.length === 0) {
      return false;
    }
    
    // Check if every item has the required properties
    return candles.every(candle => 
      typeof candle.time === 'number' &&
      typeof candle.open === 'number' &&
      typeof candle.high === 'number' &&
      typeof candle.low === 'number' &&
      typeof candle.close === 'number' &&
      typeof candle.volume === 'number'
    );
  }
  
  // Calculate metrics from a candle array
  public static calculateMetrics(candles: Candle[]): {
    count: number;
    startTime: number;
    endTime: number;
    avgVolume: number;
  } {
    if (!this.isValidCandleArray(candles)) {
      return { count: 0, startTime: 0, endTime: 0, avgVolume: 0 };
    }
    
    const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
    
    const count = candles.length;
    const startTime = sortedCandles[0].time;
    const endTime = sortedCandles[sortedCandles.length - 1].time;
    const totalVolume = sortedCandles.reduce((sum, candle) => sum + candle.volume, 0);
    const avgVolume = totalVolume / count;
    
    return { count, startTime, endTime, avgVolume };
  }
  
  // Find missing time periods in a candle array based on expected interval
  public static findMissingPeriods(
    candles: Candle[], 
    interval: TimeInterval
  ): { startTime: number; endTime: number }[] {
    if (!this.isValidCandleArray(candles)) {
      return [];
    }
    
    // Convert interval to seconds
    const intervalInSeconds = this.intervalToSeconds(interval);
    
    // Sort candles by time
    const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
    
    // Find gaps
    const gaps: { startTime: number; endTime: number }[] = [];
    
    for (let i = 0; i < sortedCandles.length - 1; i++) {
      const currentTime = sortedCandles[i].time;
      const nextTime = sortedCandles[i + 1].time;
      
      // If there's a gap larger than the interval
      if (nextTime - currentTime > intervalInSeconds * 1.5) {
        gaps.push({
          startTime: currentTime + intervalInSeconds,
          endTime: nextTime - intervalInSeconds
        });
      }
    }
    
    return gaps;
  }
  
  // Helper to convert interval to seconds
  private static intervalToSeconds(interval: TimeInterval): number {
    const numValue = parseInt(interval.slice(0, -1), 10);
    const unit = interval.slice(-1);
    
    switch (unit) {
      case 'm': return numValue * 60;
      case 'h': return numValue * 60 * 60;
      case 'd': return numValue * 24 * 60 * 60;
      default: return 60; // Default to 1 minute
    }
  }
}