// backend/exchanges/okxConnector.js
import WebSocket from 'ws';
import axios from 'axios';

class OkxConnector {
  constructor() {
    this.baseUrl = 'https://www.okx.com/api/v5';
    this.wsBaseUrl = 'wss://ws.okx.com:8443/ws/v5/public';
    this.wsConnections = new Map();
    this.subscribers = new Map();
  }

  /**
   * Subscribe to a market data stream
   */
  subscribe(symbol, interval, stream, callback) {
    // Format symbol (e.g., BTCUSDT -> BTC-USDT for OKX)
    const formattedSymbol = this.formatSymbol(symbol);
    const wsKey = `${formattedSymbol}:${interval}:${stream}`;
    
    // Check if already subscribed
    if (this.subscribers.has(wsKey)) {
      const subscribers = this.subscribers.get(wsKey);
      subscribers.add(callback);
      this.subscribers.set(wsKey, subscribers);
      console.log(`Added subscriber to existing OKX stream ${wsKey}, total: ${subscribers.size}`);
      return;
    }
    
    // Create new subscribers set
    const subscribers = new Set([callback]);
    this.subscribers.set(wsKey, subscribers);
    
    // Check if we already have a connection for this stream
    if (this.wsConnections.has(wsKey)) {
      console.log(`Using existing OKX connection for ${wsKey}`);
      return;
    }
    
    // Map interval to OKX format
    const okxInterval = this.mapInterval(interval);
    
    // Create new WebSocket connection
    const ws = new WebSocket(this.wsBaseUrl);
    
    ws.on('open', () => {
      console.log(`Connected to OKX WebSocket for ${formattedSymbol}`);
      
      // Subscribe to candle data
      const subscribeMsg = {
        op: 'subscribe',
        args: [{
          channel: 'candle' + okxInterval,
          instId: formattedSymbol
        }]
      };
      
      ws.send(JSON.stringify(subscribeMsg));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        // Process candle data
        if (message.data && message.arg && message.arg.channel && message.arg.channel.startsWith('candle')) {
          const candleData = message.data[0];
          
          // Convert to candle format
          const candle = {
            time: Math.floor(parseInt(candleData[0]) / 1000),
            open: parseFloat(candleData[1]),
            high: parseFloat(candleData[2]),
            low: parseFloat(candleData[3]),
            close: parseFloat(candleData[4]),
            volume: parseFloat(candleData[5])
          };
          
          // Notify all subscribers
          const subscribers = this.subscribers.get(wsKey);
          if (subscribers) {
            subscribers.forEach(cb => {
              try {
                cb(candle);
              } catch (error) {
                console.error('Error in OKX subscriber callback:', error);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error processing OKX message:', error);
      }
    });
    
    ws.on('error', (error) => {
      console.error(`OKX WebSocket error for ${wsKey}:`, error);
    });
    
    ws.on('close', () => {
      console.log(`OKX WebSocket closed for ${wsKey}`);
      
      // Remove connection
      this.wsConnections.delete(wsKey);
      
      // Attempt to reconnect if we still have subscribers
      if (this.subscribers.has(wsKey) && this.subscribers.get(wsKey).size > 0) {
        console.log(`Attempting to reconnect to OKX for ${wsKey}...`);
        setTimeout(() => {
          this.subscribe(symbol, interval, stream, null);
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
    const formattedSymbol = this.formatSymbol(symbol);
    const wsKey = `${formattedSymbol}:${interval}:${stream}`;
    
    // Check if we have subscribers for this stream
    if (!this.subscribers.has(wsKey)) {
      return;
    }
    
    const subscribers = this.subscribers.get(wsKey);
    
    // If callback is provided, remove only that subscriber
    if (callback) {
      subscribers.delete(callback);
      console.log(`Removed subscriber from OKX ${wsKey}, remaining: ${subscribers.size}`);
      
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
        console.error(`Error closing OKX WebSocket for ${wsKey}:`, error);
      }
      
      this.wsConnections.delete(wsKey);
    }
    
    this.subscribers.delete(wsKey);
    console.log(`Closed OKX connection and removed all subscribers for ${wsKey}`);
  }

  /**
   * Get historical candles
   */
  async getHistoricalCandles(symbol, interval, limit) {
    try {
      const formattedSymbol = this.formatSymbol(symbol);
      const okxInterval = this.mapInterval(interval);
      
      const response = await axios.get(`${this.baseUrl}/market/candles`, {
        params: {
          instId: formattedSymbol,
          bar: okxInterval,
          limit
        }
      });
      
      if (!response.data || !response.data.data) {
        throw new Error('Invalid response from OKX');
      }
      
      // Convert to candle format
      return response.data.data.map(candle => ({
        time: Math.floor(parseInt(candle[0]) / 1000),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      }));
    } catch (error) {
      console.error('Error fetching historical candles from OKX:', error);
      throw new Error(`Failed to fetch historical candles from OKX: ${error.message}`);
    }
  }

  /**
   * Format symbol for OKX (e.g., BTCUSDT -> BTC-USDT)
   */
  formatSymbol(symbol) {
    // If already in OKX format, return as is
    if (symbol.includes('-')) {
      return symbol;
    }
    
    // Extract base and quote currencies
    const baseRegex = /^([A-Z0-9]{3,})/;
    const match = symbol.match(baseRegex);
    
    if (!match) {
      return symbol;
    }
    
    const base = match[1];
    const quote = symbol.substring(base.length);
    
    return `${base}-${quote}`;
  }

  /**
   * Map interval to OKX format
   */
  mapInterval(interval) {
    const map = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1H',
      '4h': '4H',
      '1d': '1D'
    };
    
    return map[interval] || '1m';
  }

  /**
   * Check API status
   */
  async checkStatus() {
    try {
      const response = await axios.get(`${this.baseUrl}/public/time`);
      return response.status === 200;
    } catch (error) {
      console.error('Error checking OKX API status:', error);
      return false;
    }
  }
}

export default OkxConnector;  