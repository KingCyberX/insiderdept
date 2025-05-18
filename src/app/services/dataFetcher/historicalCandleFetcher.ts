// src/app/services/dataFetcher/historicalCandleFetcher.ts
import { Candle, TimeInterval } from '../../types/market';
import database from '../../lib/database';
import { CandleHistoryHelper } from '../../../models/CandleHistory';

// Import exchange services
import binanceExchange from '../exchanges/binanceExchange';
import okxExchange from '../exchanges/okxExchange';
import bybitExchange from '../exchanges/bybitExchange';
import mexcExchange from '../exchanges/mexcExchange';
import { ExchangeService } from '../exchanges/baseExchange';

// Define the data source for historical candles
type ExchangeType = 'Binance' | 'OKX' | 'Bybit' | 'MEXC';

interface FetchOptions {
  limit?: number;
  startTime?: number;
  endTime?: number;
  tryCache?: boolean;
  forceFresh?: boolean;
}

const DEFAULT_LIMIT = 500;
const CACHE_EXPIRY = 30 * 60; // 30 minutes in seconds

class HistoricalCandleFetcher {
  private readonly exchangeServices: Record<ExchangeType, ExchangeService> = {
    'Binance': binanceExchange,
    'OKX': okxExchange,
    'Bybit': bybitExchange,
    'MEXC': mexcExchange
  };

  /**
   * Fetch historical candles from an exchange with caching support
   */
  public async fetchCandles(
    exchange: ExchangeType,
    symbol: string,
    interval: TimeInterval,
    options: FetchOptions = {}
  ): Promise<Candle[]> {
    try {
      // Adjust the limit based on interval to ensure sufficient data points
      const adjustedLimit = this.adjustLimitForInterval(options.limit || DEFAULT_LIMIT, interval);
      
      const {
        limit = adjustedLimit,
        tryCache = true,
        forceFresh = false
      } = options;

      const exchangeService = this.exchangeServices[exchange];
      if (!exchangeService) {
        throw new Error(`Unsupported exchange: ${exchange}`);
      }

      // Check cache first unless forceFresh is set
      if (tryCache && !forceFresh) {
        const hasCandles = await database.hasCandles(exchange, symbol, interval);
        
        if (hasCandles) {
          console.log(`[HistoricalCandleFetcher] Using cached candles for ${exchange} ${symbol} ${interval}`);
          const cachedCandles = await database.getCandles(exchange, symbol, interval, limit);
          
          // Check if cached data is still fresh
          const now = Math.floor(Date.now() / 1000);
          const latestCandle = cachedCandles[cachedCandles.length - 1];
          
          if (
            cachedCandles.length >= limit &&
            latestCandle &&
            now - latestCandle.time < CACHE_EXPIRY
          ) {
            console.log(`[HistoricalCandleFetcher] Returning ${cachedCandles.length} cached candles for ${symbol}`);
            
            // Normalize timestamps for consistency
            const normalizedCandles = this.normalizeCandles(cachedCandles, interval);
            return normalizedCandles;
          }
          
          console.log(`[HistoricalCandleFetcher] Cached data for ${symbol} is stale or incomplete, fetching fresh data`);
        }
      }

      // Fetch fresh data from the exchange
      console.log(`[HistoricalCandleFetcher] Fetching ${limit} candles from ${exchange} for ${symbol} (${interval})`);
      
      // Use the standard getCandles method
      const candles = await exchangeService.getCandles(symbol, interval, limit);
      
      if (!CandleHistoryHelper.isValidCandleArray(candles)) {
        throw new Error(`Invalid candle data received from ${exchange}`);
      }
      
      // Normalize timestamps for consistency
      const normalizedCandles = this.normalizeCandles(candles, interval);
      
      // Store in cache
      await database.storeCandles(exchange, symbol, interval, normalizedCandles);
      console.log(`[HistoricalCandleFetcher] Stored ${normalizedCandles.length} candles in cache for ${symbol}`);
      
      return normalizedCandles;
    } catch (error) {
      console.error(`[HistoricalCandleFetcher] Error fetching candles:`, error);
      
      // Try to return cached data as fallback if available and not already tried
      if (!options.tryCache) {
        try {
          const cachedCandles = await database.getCandles(exchange, symbol, interval, options.limit || DEFAULT_LIMIT);
          if (cachedCandles.length > 0) {
            console.log(`[HistoricalCandleFetcher] Returning ${cachedCandles.length} cached candles as fallback`);
            return this.normalizeCandles(cachedCandles, interval);
          }
        } catch (cacheError) {
          console.error(`[HistoricalCandleFetcher] Failed to retrieve from cache:`, cacheError);
        }
      }
      
      throw error;
    }
  }

  /**
   * Adjust limit based on interval to ensure sufficient data points
   */
  private adjustLimitForInterval(baseLimit: number, interval: TimeInterval): number {
    // Increase the limit for larger intervals to get sufficient data
    switch (interval) {
      case '1m': return baseLimit;
      case '5m': return Math.ceil(baseLimit * 1.5);
      case '15m': return Math.ceil(baseLimit * 2);
      case '30m': return Math.ceil(baseLimit * 2.5);
      case '1h': return Math.ceil(baseLimit * 3);
      case '4h': return Math.ceil(baseLimit * 5);
      case '1d': return Math.ceil(baseLimit * 10);
      default: return baseLimit;
    }
  }

  /**
   * Normalize candle timestamps for consistency across intervals
   */
  private normalizeCandles(candles: Candle[], interval: TimeInterval): Candle[] {
    return candles.map(candle => {
      // Ensure timestamp is in seconds format
      const timeInSeconds = candle.time > 10000000000 
        ? Math.floor(candle.time / 1000) 
        : candle.time;
      
      // Align to interval boundary based on interval size
      let alignedTime = timeInSeconds;
      const intervalSeconds = this.getIntervalInSeconds(interval);
      
      if (intervalSeconds >= 3600) { // 1h or greater
        // For intervals >= 1h, align to hour boundaries first
        const hourAlignedTime = Math.floor(timeInSeconds / 3600) * 3600;
        
        // Then align to interval boundary based on the hours in the day
        const intervalsPerDay = 86400 / intervalSeconds;
        const hourOfDay = new Date(hourAlignedTime * 1000).getUTCHours();
        const intervalNumber = Math.floor(hourOfDay / (24 / intervalsPerDay));
        
        alignedTime = Math.floor(hourAlignedTime / 86400) * 86400 + intervalNumber * intervalSeconds;
      } else {
        // For smaller intervals, just align to the interval boundary
        alignedTime = Math.floor(timeInSeconds / intervalSeconds) * intervalSeconds;
      }
      
      return {
        ...candle,
        time: alignedTime // Store time in seconds format
      };
    });
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
   * Fetch historical candles for multiple symbols or exchanges and merge them
   */
  public async fetchAggregatedCandles(
    baseAsset: string,
    quoteAssets: string[],
    exchanges: ExchangeType[],
    interval: TimeInterval,
    options: FetchOptions = {}
  ): Promise<{ candles: Candle[], isAggregated: boolean }> {
    const { limit = DEFAULT_LIMIT } = options;
    
    // Adjust the limit based on interval
    const adjustedLimit = this.adjustLimitForInterval(limit, interval);
    
    try {
      // Create a list of symbols to fetch
      const symbolRequests: Array<{ exchange: ExchangeType; symbol: string }> = [];
      
      for (const exchange of exchanges) {
        for (const quoteAsset of quoteAssets) {
          let symbol: string;
          
          // Format symbol based on exchange
          if (exchange === 'OKX') {
            symbol = `${baseAsset}-${quoteAsset}`;
          } else {
            symbol = `${baseAsset}${quoteAsset}`;
          }
          
          // Add to request list
          symbolRequests.push({ exchange, symbol });
        }
      }
      
      if (symbolRequests.length === 0) {
        throw new Error('No valid symbol/exchange combinations found for aggregation');
      }
      
      // Fetch data for all symbols in parallel
      const fetchPromises = symbolRequests.map(async ({ exchange, symbol }) => {
        try {
          const candles = await this.fetchCandles(exchange, symbol, interval, {
            ...options,
            limit: adjustedLimit
          });
          return { exchange, symbol, candles, success: true };
        } catch (error) {
          console.error(`Failed to fetch candles for ${exchange} ${symbol}:`, error);
          return { exchange, symbol, candles: [], success: false };
        }
      });
      
      const results = await Promise.all(fetchPromises);
      const successfulResults = results.filter(r => r.success && r.candles.length > 0);
      
      if (successfulResults.length === 0) {
        throw new Error('Failed to fetch any valid candle data for aggregation');
      }
      
      // Aggregate the candles by time
      const timeMap = new Map<number, {
        volumes: number[];
        opens: number[];
        highs: number[];
        lows: number[];
        closes: number[];
      }>();
      
      // Process all candles
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
      const aggregatedCandles = Array.from(timeMap.entries())
        .map(([time, data]) => {
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
        })
        .sort((a, b) => a.time - b.time);
      
      // Fill any gaps in the data
      const filledCandles = this.fillCandleGaps(aggregatedCandles, interval);
      
      // Apply limit if needed
      const limitedCandles = filledCandles.slice(-limit);
      
      return {
        candles: limitedCandles,
        isAggregated: successfulResults.length > 1
      };
    } catch (error) {
      console.error('[HistoricalCandleFetcher] Failed to fetch aggregated candles:', error);
      throw error;
    }
  }
  
  /**
   * Fill gaps in candle data for continuity
   */
  private fillCandleGaps(candles: Candle[], interval: TimeInterval): Candle[] {
    if (candles.length < 2) return candles;
    
    const intervalSeconds = this.getIntervalInSeconds(interval);
    const result: Candle[] = [candles[0]];
    
    for (let i = 1; i < candles.length; i++) {
      const prevCandle = candles[i - 1];
      const currentCandle = candles[i];
      const timeDiff = currentCandle.time - prevCandle.time;
      
      // Check if there's a gap (more than 1.5x the interval)
      if (timeDiff > intervalSeconds * 1.5) {
        // Calculate how many intervals we need to fill
        const intervalsToFill = Math.floor(timeDiff / intervalSeconds) - 1;
        
        // Only fill if there are at least one missing interval
        if (intervalsToFill > 0) {
          console.log(`[HistoricalCandleFetcher] Filling ${intervalsToFill} gaps between ${new Date(prevCandle.time * 1000).toISOString()} and ${new Date(currentCandle.time * 1000).toISOString()}`);
          
          // Create filled candles for each missing interval
          for (let j = 1; j <= intervalsToFill; j++) {
            const fillTime = prevCandle.time + j * intervalSeconds;
            result.push({
              time: fillTime,
              open: prevCandle.close,
              high: prevCandle.close,
              low: prevCandle.close,
              close: prevCandle.close,
              volume: 0
            });
          }
        }
      }
      
      result.push(currentCandle);
    }
    
    return result;
  }

  /**
   * Purge old candles from the database
   */
  public async purgeOldCandles(olderThan: number = 7 * 24 * 60 * 60): Promise<void> {
    const cutoffTime = Math.floor(Date.now() / 1000) - olderThan;
    await database.purgeOldCandles(cutoffTime);
  }
}

// Create a singleton instance
const historicalCandleFetcher = new HistoricalCandleFetcher();
export default historicalCandleFetcher;