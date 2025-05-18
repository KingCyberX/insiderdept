// \src\app\actions\fetchHitoricalData.ts

'use server'

import { Candle, TimeInterval } from '../types/market';
import historicalCandleFetcher from '../services/dataFetcher/historicalCandleFetcher';

type ExchangeType = 'Binance' | 'OKX' | 'Bybit' | 'MEXC';

interface HistoricalDataParams {
  exchange: ExchangeType;
  symbol: string;
  interval: TimeInterval;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

interface HistoricalDataResponse {
  success: boolean;
  candles: Candle[];
  error?: string;
  isAggregated?: boolean;
}

export async function fetchHistoricalData(
  params: HistoricalDataParams
): Promise<HistoricalDataResponse> {
  try {
    const { exchange, symbol, interval, limit = 500 } = params;
    
    console.log(`[Server Action] Fetching historical data for ${exchange} ${symbol} ${interval}`);
    
    // Validate inputs
    if (!exchange || !symbol || !interval) {
      return {
        success: false,
        candles: [],
        error: 'Missing required parameters: exchange, symbol, or interval'
      };
    }
    
    // Call the historical data fetcher service
    const candles = await historicalCandleFetcher.fetchCandles(
      exchange,
      symbol,
      interval,
      {
        limit,
        startTime: params.startTime,
        endTime: params.endTime,
        tryCache: true
      }
    );
    
    return {
      success: true,
      candles,
      isAggregated: false
    };
  } catch (error) {
    console.error('[Server Action] Error fetching historical data:', error);
    return {
      success: false,
      candles: [],
      error: error instanceof Error ? error.message : 'Unknown error fetching historical data'
    };
  }
}

interface AggregatedDataParams {
  baseAsset: string;
  quoteAssets: string[];
  exchanges: ExchangeType[];
  interval: TimeInterval;
  limit?: number;
}

export async function fetchAggregatedHistoricalData(
  params: AggregatedDataParams
): Promise<HistoricalDataResponse> {
  try {
    const { baseAsset, quoteAssets, exchanges, interval, limit = 500 } = params;
    
    console.log(`[Server Action] Fetching aggregated data for ${baseAsset} across ${exchanges.join(', ')}`);
    
    // Validate inputs
    if (!baseAsset || !quoteAssets || quoteAssets.length === 0 || !exchanges || exchanges.length === 0) {
      return {
        success: false,
        candles: [],
        error: 'Missing required parameters for aggregation'
      };
    }
    
    // Call the historical data fetcher service for aggregated data
    const result = await historicalCandleFetcher.fetchAggregatedCandles(
      baseAsset,
      quoteAssets,
      exchanges,
      interval,
      { limit }
    );
    
    return {
      success: true,
      candles: result.candles,
      isAggregated: result.isAggregated
    };
  } catch (error) {
    console.error('[Server Action] Error fetching aggregated historical data:', error);
    return {
      success: false,
      candles: [],
      error: error instanceof Error ? error.message : 'Unknown error fetching aggregated data'
    };
  }
}