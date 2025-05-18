// src/app/cron/updateHistory.ts
import { TimeInterval } from '../types/market';
import database from '../lib/database';
import historicalCandleFetcher from '../services/dataFetcher/historicalCandleFetcher';

type ExchangeType = 'Binance' | 'OKX' | 'Bybit' | 'MEXC';

interface ScheduledJob {
  id: string;
  interval: number; // Milliseconds
  lastRun: number; // Timestamp
  isRunning: boolean;
  fn: () => Promise<void>;
}

class HistoryUpdateScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private updateIntervalMs = 60 * 1000; // Check for jobs to run every minute
  
  // Start the scheduler
  start(): void {
    if (this.timer) {
      return; // Already running
    }
    
    console.log('[Scheduler] Starting history update scheduler');
    
    // Run immediately once
    this.runDueJobs();
    
    // Then set up interval
    this.timer = setInterval(() => {
      this.runDueJobs();
    }, this.updateIntervalMs);
  }
  
  // Stop the scheduler
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Scheduler] Stopped history update scheduler');
    }
  }
  
  // Run jobs that are due to run
  private async runDueJobs(): Promise<void> {
    const now = Date.now();
    
    for (const [id, job] of this.jobs.entries()) {
      // Check if job should run
      if (!job.isRunning && now - job.lastRun >= job.interval) {
        job.isRunning = true;
        console.log(`[Scheduler] Running job: ${id}`);
        
        try {
          await job.fn();
          job.lastRun = Date.now();
          console.log(`[Scheduler] Job completed: ${id}`);
        } catch (error) {
          console.error(`[Scheduler] Error running job ${id}:`, error);
        } finally {
          job.isRunning = false;
        }
      }
    }
  }
  
  // Schedule a new job or update an existing one
  schedule(
    id: string,
    intervalMinutes: number,
    fn: () => Promise<void>
  ): void {
    const job: ScheduledJob = {
      id,
      interval: intervalMinutes * 60 * 1000,
      lastRun: 0, // Run immediately when scheduler starts
      isRunning: false,
      fn
    };
    
    this.jobs.set(id, job);
    console.log(`[Scheduler] Scheduled job: ${id} (every ${intervalMinutes} minutes)`);
  }
  
  // Remove a job
  unschedule(id: string): boolean {
    return this.jobs.delete(id);
  }
  
  // Schedule a job to update historical data for a symbol
  scheduleSymbolUpdate(
    exchange: ExchangeType,
    symbol: string,
    interval: TimeInterval,
    updateIntervalMinutes: number = 60 // Default to hourly updates
  ): string {
    const jobId = `update-${exchange}-${symbol}-${interval}`;
    
    // Create the job function
    const updateFn = async () => {
      try {
        console.log(`[Scheduler] Updating historical data for ${exchange} ${symbol} (${interval})`);
        
        // Fetch the latest data
        const candles = await historicalCandleFetcher.fetchCandles(
          exchange,
          symbol,
          interval,
          { limit: 100, forceFresh: true }
        );
        
        console.log(`[Scheduler] Fetched ${candles.length} candles for ${symbol}`);
        
        // Store in database (the fetcher already does this, but we log it here)
        console.log(`[Scheduler] Updated historical data for ${symbol} in database`);
        
        // Clean up old data occasionally (once a day)
        if (Math.random() < 0.05) { // ~5% chance each run
          const daysToKeep = 7; // Keep 7 days of data
          const olderThan = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
          
          console.log(`[Scheduler] Purging data older than ${daysToKeep} days`);
          await database.purgeOldCandles(olderThan);
        }
      } catch (error) {
        console.error(`[Scheduler] Error updating historical data for ${symbol}:`, error);
      }
    };
    
    // Schedule the job
    this.schedule(jobId, updateIntervalMinutes, updateFn);
    
    return jobId;
  }
  
  // Schedule updates for multiple popular symbols
  schedulePopularSymbols(updateIntervalMinutes: number = 60): void {
    const popularSymbols = [
      { exchange: 'Binance' as ExchangeType, symbol: 'BTCUSDT' },
      { exchange: 'Binance' as ExchangeType, symbol: 'ETHUSDT' },
      { exchange: 'Binance' as ExchangeType, symbol: 'BNBUSDT' },
      { exchange: 'OKX' as ExchangeType, symbol: 'BTC-USDT' },
      { exchange: 'OKX' as ExchangeType, symbol: 'ETH-USDT' },
      { exchange: 'Bybit' as ExchangeType, symbol: 'BTCUSDT' },
      { exchange: 'MEXC' as ExchangeType, symbol: 'BTCUSDT' }
    ];
    
    const intervals: TimeInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
    
    // Schedule updates for each symbol and interval
    for (const { exchange, symbol } of popularSymbols) {
      for (const interval of intervals) {
        // Stagger the updates to avoid all running at once
        const randomOffset = Math.floor(Math.random() * updateIntervalMinutes / 2);
        const adjustedInterval = updateIntervalMinutes + randomOffset;
        
        this.scheduleSymbolUpdate(exchange, symbol, interval, adjustedInterval);
      }
    }
  }
}

// Create singleton instance
const historyUpdateScheduler = new HistoryUpdateScheduler();

// Export the instance
export default historyUpdateScheduler;

// Auto-start in client-side environments if needed
if (typeof window !== 'undefined') {
  // Check if we need to auto-start (e.g., based on user preference)
  const shouldAutoStart = localStorage.getItem('autoUpdateHistory') === 'true';
  
  if (shouldAutoStart) {
    // Start with a delay to allow the app to initialize
    setTimeout(() => {
      historyUpdateScheduler.start();
      historyUpdateScheduler.schedulePopularSymbols();
    }, 5000);
  }
}