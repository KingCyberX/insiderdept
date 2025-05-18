// backend/exchanges/mexcConnector.js
import WebSocket from 'ws';
import axios from 'axios';

class MexcConnector {
  constructor() {
    this.baseUrl = 'https://api.mexc.com/api/v3';
    this.wsBaseUrl = 'wss://wbs.mexc.com/ws';
    this.wsConnections = new Map();
    this.subscribers = new Map();
  }

  /**
   * Subscribe to a market data stream
   */
  subscribe(symbol, interval, stream, callback) {
    const wsKey = `${symbol}:${interval}:${stream}`;
    
    // Check if already subscribed
    if (this.subscribers.has(wsKey)) {
      const subscribers = this.subscribers.get(wsKey);
      subscribers.add(callback);
      this.subscribers.set(wsKey, subscribers);
      console.log(`Added subscriber to existing MEXC stream ${wsKey}, total: ${subscribers.size}`);
      return;
    }
    
    // Create new subscribers set
    const subscribers = new Set([callback]);
    this.subscribers.set(wsKey, subscribers);
    
    // Check if we already have a connection
    if (this.wsConnections.has('mexc')) {
      // Add subscription to existing connection
      const ws = this.wsConnections.get('mexc');
      
      // Subscribe to kline data
      const subscribeMsg = {
        method: 'SUBSCRIPTION',
        params: [`spot@public.kline.v3.api@${symbol}@${interval}`]
      };
      
      ws.send(JSON.stringify(subscribeMsg));
      console.log(`Added subscription to existing MEXC connection: ${symbol} ${interval}`);
      return;
    }
    
    // Create new WebSocket connection
    const ws = new WebSocket(this.wsBaseUrl);
    
    ws.on('open', () => {
      console.log('Connected to MEXC WebSocket');
      
      // Subscribe to kline data
      const subscribeMsg = {
        method: 'SUBSCRIPTION',
        params: [`spot@public.kline.v3.api@${symbol}@${interval}`]
      };
      
      ws.send(JSON.stringify(subscribeMsg));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        // Process kline data
        if (message.d && message.c === 'spot@public.kline.v3.api') {
          const candleData = message.d;
          
          // Extract symbol and interval
          const [topicSymbol, topicInterval] = message.s.split('@');
          const msgKey = `${topicSymbol}:${topicInterval}:${stream}`;
          
          // Convert to candle format
          const candle = {
            time: Math.floor(parseInt(candleData.t) / 1000),
            open: parseFloat(candleData.o),
            high: parseFloat(candleData.h),
            low: parseFloat(candleData.l),
            close: parseFloat(candleData.c),
            volume: parseFloat(candleData.v)
          };
          
          // Notify all subscribers
          const subscribers = this.subscribers.get(msgKey);
          if (subscribers) {
            subscribers.forEach(cb => {
              try {
                cb(candle);
              } catch (error) {
                console.error('Error in MEXC subscriber callback:', error);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error processing MEXC message:', error);
      }
    });
    
    ws.on('error', (error) => {
      console.error('MEXC WebSocket error:', error);
    });
    
    ws.on('close', () => {
      console.log('MEXC WebSocket closed');
      
      // Remove connection
      this.wsConnections.delete('mexc');
      
      // Attempt to reconnect if we still have subscribers
      if (this.subscribers.size > 0) {
        console.log('Attempting to reconnect to MEXC...');
        setTimeout(() => {
          this.reconnect();
        }, 5000);
      }
    });
    
    // Store connection
    this.wsConnections.set('mexc', ws);
  }

  /**
   * Reconnect and resubscribe to all streams
   */
  reconnect() {
    const streams = [];
    
    // Collect all subscriptions
    this.subscribers.forEach((subscribers, key) => {
      const [symbol, interval] = key.split(':');
      streams.push(`spot@public.kline.v3.api@${symbol}@${interval}`);
    });
    
    if (streams.length === 0) {
      return;
    }
    
    // Create new WebSocket connection
    const ws = new WebSocket(this.wsBaseUrl);
    
    ws.on('open', () => {
      console.log('Reconnected to MEXC WebSocket');
      
      // Subscribe to all streams
      const subscribeMsg = {
        method: 'SUBSCRIPTION',
        params: streams
      };
      
      ws.send(JSON.stringify(subscribeMsg));
    });
    
    // Set up message handler
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        // Process kline data
        if (message.d && message.c === 'spot@public.kline.v3.api') {
          const candleData = message.d;
          
          // Extract symbol and interval
          const [topicSymbol, topicInterval] = message.s.split('@');
          const msgKey = `${topicSymbol}:${topicInterval}:kline`;
          
          // Convert to candle format
          const candle = {
            time: Math.floor(parseInt(candleData.t) / 1000),
            open: parseFloat(candleData.o),
            high: parseFloat(candleData.h),
            low: parseFloat(candleData.l),
            close: parseFloat(candleData.c),
            volume: parseFloat(candleData.v)
          };
          
          // Notify all subscribers
          const subscribers = this.subscribers.get(msgKey);
          if (subscribers) {
            subscribers.forEach(cb => {
              try {
                cb(candle);
              } catch (error) {
                console.error('Error in MEXC subscriber callback:', error);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error processing MEXC message:', error);
      }
    });
    
    // Set up error handler
    ws.on('error', (error) => {
      console.error('MEXC WebSocket error:', error);
    });
    
    // Set up close handler
    ws.on('close', () => {
      console.log('MEXC WebSocket closed');
      
      // Remove connection
      this.wsConnections.delete('mexc');
      
      // Attempt to reconnect if we still have subscribers
      if (this.subscribers.size > 0) {
        console.log('Attempting to reconnect to MEXC...');
        setTimeout(() => {
          this.reconnect();
        }, 5000);
      }
    });
    
    // Store connection
    this.wsConnections.set('mexc', ws);
  }

  /**
   * Unsubscribe from a market data stream
   */
  unsubscribe(symbol, interval, stream, callback) {
    const wsKey = `${symbol}:${interval}:${stream}`;
    
    // Check if we have subscribers for this stream
    if (!this.subscribers.has(wsKey)) {
      return;
    }
    
    const subscribers = this.subscribers.get(wsKey);
    
    // If callback is provided, remove only that subscriber
    if (callback) {
      subscribers.delete(callback);
      console.log(`Removed subscriber from MEXC ${wsKey}, remaining: ${subscribers.size}`);
      
      // If no subscribers left, unsubscribe from stream
      if (subscribers.size === 0) {
        this.unsubscribeFromStream(symbol, interval);
        this.subscribers.delete(wsKey);
      } else {
        this.subscribers.set(wsKey, subscribers);
      }
    } else {
      // Remove all subscribers and unsubscribe from stream
      this.unsubscribeFromStream(symbol, interval);
      this.subscribers.delete(wsKey);
    }
    
    // If no more subscribers at all, close connection
    if (this.subscribers.size === 0) {
      this.closeConnection();
    }
  }

  /**
   * Unsubscribe from a specific stream
   */
  unsubscribeFromStream(symbol, interval) {
    const ws = this.wsConnections.get('mexc');
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Unsubscribe from kline data
    const unsubscribeMsg = {
      method: 'UNSUBSCRIPTION',
      params: [`spot@public.kline.v3.api@${symbol}@${interval}`]
    };
    
    ws.send(JSON.stringify(unsubscribeMsg));
  }

  /**
   * Close the WebSocket connection
   */
  closeConnection() {
    const ws = this.wsConnections.get('mexc');
    
    if (ws) {
      try {
        ws.close();
      } catch (error) {
        console.error('Error closing MEXC WebSocket:', error);
      }
      
      this.wsConnections.delete('mexc');
    }
    
    console.log('Closed MEXC connection');
  }

  /**
   * Get historical candles
   */
  async getHistoricalCandles(symbol, interval, limit) {
    try {
      const response = await axios.get(`${this.baseUrl}/klines`, {
        params: {
          symbol,
          interval,
          limit
        }
      });
      
      if (!Array.isArray(response.data)) {
        throw new Error('Invalid response from MEXC');
      }
      
      // Convert to candle format
      return response.data.map(candle => ({
        time: Math.floor(parseInt(candle[0]) / 1000),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      }));
    } catch (error) {
      console.error('Error fetching historical candles from MEXC:', error);
      throw new Error(`Failed to fetch historical candles from MEXC: ${error.message}`);
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
      console.error('Error checking MEXC API status:', error);
      return false;
    }
  }
}

export default MexcConnector;