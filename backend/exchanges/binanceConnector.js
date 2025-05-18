// backend/exchanges/binanceConnector.js
import WebSocket from 'ws';
import axios from 'axios';

class BinanceConnector {
  constructor() {
    this.baseUrl = 'https://api.binance.com/api/v3';
    this.wsBaseUrl = 'wss://stream.binance.com:9443/ws';
    this.wsConnections = new Map();
    this.subscribers = new Map();
  }

  /**
   * Subscribe to a market data stream
   */
  subscribe(symbol, interval, stream, callback) {
    const formattedSymbol = symbol.toLowerCase();
    const streamName = stream === 'kline' ? `${formattedSymbol}@kline_${interval}` : formattedSymbol;
    const wsKey = `${streamName}`;
    
    // Check if already subscribed
    if (this.subscribers.has(wsKey)) {
      const subscribers = this.subscribers.get(wsKey);
      subscribers.add(callback);
      this.subscribers.set(wsKey, subscribers);
      console.log(`Added subscriber to existing stream ${wsKey}, total: ${subscribers.size}`);
      return;
    }
    
    // Create new subscribers set
    const subscribers = new Set([callback]);
    this.subscribers.set(wsKey, subscribers);
    
    // Check if we already have a connection for this stream
    if (this.wsConnections.has(wsKey)) {
      console.log(`Using existing connection for ${wsKey}`);
      return;
    }
    
    // Create new WebSocket connection
    const ws = new WebSocket(`${this.wsBaseUrl}/${streamName}`);
    
    ws.on('open', () => {
      console.log(`Connected to Binance stream ${streamName}`);
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        // Process kline data
        if (stream === 'kline' && message.k) {
          const kline = message.k;
          
          // Convert to candle format
          const candle = {
            time: Math.floor(kline.t / 1000), // Convert to seconds
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v)
          };
          
          // Notify all subscribers
          const subscribers = this.subscribers.get(wsKey);
          if (subscribers) {
            subscribers.forEach(callback => {
              try {
                callback(candle);
              } catch (error) {
                console.error('Error in subscriber callback:', error);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error processing Binance message:', error);
      }
    });
    
    ws.on('error', (error) => {
      console.error(`Binance WebSocket error for ${streamName}:`, error);
    });
    
    ws.on('close', () => {
      console.log(`Binance WebSocket closed for ${streamName}`);
      
      // Remove connection
      this.wsConnections.delete(wsKey);
      
      // Attempt to reconnect if we still have subscribers
      if (this.subscribers.has(wsKey) && this.subscribers.get(wsKey).size > 0) {
        console.log(`Attempting to reconnect to ${streamName}...`);
        setTimeout(() => {
          this.subscribe(symbol, interval, stream);
        }, 5000);
      }
    });
    
    // Store connection
    this.wsConnections.set(wsKey, ws);
  }

  /**
   * Unsubscribe from a market data stream
   */
  unsubscribe(symbol, interval, stream, callback) {
    const formattedSymbol = symbol.toLowerCase();
    const streamName = stream === 'kline' ? `${formattedSymbol}@kline_${interval}` : formattedSymbol;
    const wsKey = `${streamName}`;
    
    // Check if we have subscribers for this stream
    if (!this.subscribers.has(wsKey)) {
      return;
    }
    
    const subscribers = this.subscribers.get(wsKey);
    
    // If callback is provided, remove only that subscriber
    if (callback) {
      subscribers.delete(callback);
      console.log(`Removed subscriber from ${wsKey}, remaining: ${subscribers.size}`);
      
      // If no subscribers left, close connection
      if (subscribers.size === 0) {
        this.closeConnection(wsKey);
      } else {
        this.subscribers.set(wsKey, subscribers);
      }
    } else {
      // Remove all subscribers and close connection
      this.closeConnection(wsKey);
    }
  }

  /**
   * Close a WebSocket connection
   */
  closeConnection(wsKey) {
    const ws = this.wsConnections.get(wsKey);
    
    if (ws) {
      try {
        ws.close();
      } catch (error) {
        console.error(`Error closing WebSocket for ${wsKey}:`, error);
      }
      
      this.wsConnections.delete(wsKey);
    }
    
    this.subscribers.delete(wsKey);
    console.log(`Closed connection and removed all subscribers for ${wsKey}`);
  }

  /**
   * Get historical candles
   */
  async getHistoricalCandles(symbol, interval, limit) {
    try {
      const response = await axios.get(`${this.baseUrl}/klines`, {
        params: {
          symbol: symbol.toUpperCase(),
          interval,
          limit
        }
      });
      
      // Convert to candle format
      return response.data.map(candle => ({
        time: Math.floor(candle[0] / 1000), // Convert to seconds
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      }));
    } catch (error) {
        console.error('Error fetching historical candles from Binance:', error);
        throw new Error(`Failed to fetch historical candles from Binance: ${error.message}`);
      }
    }
  
    /**
     * Check API status
     */
    async checkStatus() {
      try {
        const response = await axios.get(`${this.baseUrl}/ping`);
        return response.status === 200;
      } catch (error) {
        console.error('Error checking Binance API status:', error);
        return false;
      }
    }
  }
  
  module.exports = BinanceConnector;

// Added export
export default BinanceConnector;
