  // src/app/services/exchanges/baseExchange.ts
  console.log('baseExchange.ts module loading');

  import { Candle, MarketSymbol, OpenInterest, TimeInterval } from '../../types/market';

  // Interface for WebSocket message handlers
  export interface WebSocketStreamHandlers {
    onKline?: (kline: Candle) => void;
    onMessage?: (event: MessageEvent) => void;
    onError?: (error: Error | Event) => void;
    onClose?: (event: CloseEvent) => void;
    onOpen?: (event: Event) => void;
    
    // Use a more permissive index signature that allows all handler types
    [key: string]: unknown;
  }

  export interface ExchangeService {
    getName(): string;
    getCandles(symbol: string, interval?: TimeInterval, limit?: number): Promise<Candle[]>;
    getFuturesCandles?(symbol: string, interval?: TimeInterval, limit?: number): Promise<Candle[]>;
    getSymbols(): Promise<MarketSymbol[]>;
    getOpenInterest?(symbol: string, interval?: TimeInterval, limit?: number): Promise<OpenInterest[]>;
    validateSymbol(symbol: string): Promise<boolean>;
    getWebSocketUrl(symbol: string, stream: string): string;
    formatSymbol?(symbol: string): string; // For exchanges that have unique symbol formats
    
    // Add the new historical candles method
    getHistoricalCandles?(
      symbol: string, 
      interval?: TimeInterval, 
      limit?: number,
      endTime?: number,
      startTime?: number
    ): Promise<Candle[]>;
    
    // Add method for merging historical and real-time data
    mergeHistoricalAndRealtimeData?(
      symbol: string,
      interval: TimeInterval,
      limit?: number
    ): Promise<Candle[]>;
    
    // Add method for WebSocket subscriptions
    subscribeToRealTimeUpdates?(
      symbol: string,
      interval: TimeInterval,
      handlers?: WebSocketStreamHandlers
    ): void;
    
    // Add method for WebSocket unsubscriptions
    unsubscribeFromRealTimeUpdates?(
      symbol: string, 
      interval: TimeInterval
    ): void;
  }

  export abstract class BaseExchangeService implements ExchangeService {
    protected readonly baseUrl: string;
    protected readonly name: string;
    protected readonly wsBaseUrl: string;
    
    constructor(name: string, baseUrl: string, wsBaseUrl: string = '') {
      console.log(`BaseExchangeService constructor called with name=${name}`);
      this.name = name;
      this.baseUrl = baseUrl;
      this.wsBaseUrl = wsBaseUrl;
    }
    
    getName(): string {
      return this.name;
    }
    
    abstract getCandles(symbol: string, interval?: TimeInterval, limit?: number): Promise<Candle[]>;
    abstract getSymbols(): Promise<MarketSymbol[]>;
    abstract validateSymbol(symbol: string): Promise<boolean>;
    abstract getWebSocketUrl(symbol: string, stream: string): string;
    
    // Optional methods - not all exchanges support these
    getFuturesCandles?(symbol: string, interval?: TimeInterval, limit?: number): Promise<Candle[]>;
    getOpenInterest?(symbol: string, interval?: TimeInterval, limit?: number): Promise<OpenInterest[]>;
    formatSymbol?(symbol: string): string;
    
    // New optional methods for historical data and real-time merging
    getHistoricalCandles?(
      symbol: string, 
      interval?: TimeInterval, 
      limit?: number,
      endTime?: number,
      startTime?: number
    ): Promise<Candle[]>;
    
    mergeHistoricalAndRealtimeData?(
      symbol: string,
      interval: TimeInterval,
      limit?: number
    ): Promise<Candle[]>;
    
    subscribeToRealTimeUpdates?(
      symbol: string,
      interval: TimeInterval,
      handlers?: WebSocketStreamHandlers
    ): void;
    
    unsubscribeFromRealTimeUpdates?(
      symbol: string, 
      interval: TimeInterval
    ): void;
  }

  console.log('baseExchange.ts module loaded, BaseExchangeService exported');