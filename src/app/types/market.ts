// src/app/types/market.ts

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DeltaVolume {
  time: number;
  value: number;
  color: string;
}

export interface OpenInterest {
  time: number;
  openInterest: number;
}

export interface MarketSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status?: string;
  exchange?: string;
}

export interface ChartData {
  spotCandles: Candle[];
  futuresCandles: Candle[];
  openInterest: OpenInterest[];
  deltaVolume: DeltaVolume[];
  // Add this flag to indicate aggregated data
  isAggregated?: boolean;
}

export type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export type Exchange = 'Binance' | 'OKX' | 'Bybit' | 'MEXC';

export interface ExchangeInfo {
  name: Exchange;
  apiBaseUrl: string;
  wsBaseUrl: string;
  logo: string;
  status: 'operational' | 'issues' | 'maintenance';
}

// Add these types for delta aggregation
export interface DeltaAggregationConfig {
  enabled: boolean;
  baseCurrency: string;
  quoteCurrencies: string[];
}