// backend/exchanges/bybitConnector.js
import WebSocket from 'ws';
import axios from 'axios';

class BybitConnector {
  constructor() {
    this.baseUrl = 'https://api.bybit.com';
    this.wsBaseUrl = 'wss://stream.bybit.com/v5/public/spot';
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
      console.log(`Added subscriber to existing Bybit stream ${wsKey}, total: ${subscribers.size}`);
      return;
    }
    
    // Create new subscribers set
    const subscribers = new Set([callback]);
    this.subscribers.set(wsKey, subscribers);
    
    // Check if we already have a connection
    if (this.wsConnections.has('bybit')) {
      // Add subscription to existing connection
      const ws = this.wsConnections.get('bybit');
      
      // Subscribe to kline data
      const subscribeMsg = {
        op: 'subscribe',
        args: [`kline.${interval}.${symbol}`]
      };
      
      ws.send(JSON.stringify(subscribeMsg));
      console.log(`Added subscription to existing Bybit connection: ${symbol} ${interval}`);
      return;
    }
    
    // Create new WebSocket connection
    const ws = new WebSocket(this.wsBaseUrl);
    
    ws.on('open', () => {
      console.log('Connected to Bybit WebSocket');
      
      // Subscribe to kline data
      const subscribeMsg = {
        op: 'subscribe',
        args: [`kline.${interval}.${symbol}`]
      };
      
      ws.send(JSON.stringify(subscribeMsg));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        // Process kline data
        if (message.topic && message.topic.startsWith('kline.') && message.data) {
          const candleData = message.data[0];
          
          // Extract symbol and interval from topic
          const [, topicInterval, topicSymbol] = message.topic.split('.');
          const msgKey = `${topicSymbol}:${topicInterval}:${stream}`;
          
          // Convert to candle format
          const candle = {
            time: Math.floor(parseInt(candleData.start) / 1000),
            open: parseFloat(candleData.open),
            high: parseFloat(candleData.high),
            low: parseFloat(candleData.low),
            close: parseFloat(candleData.close),
            volume: parseFloat(candleData.volume)
          };
          
          // Notify all subscribers
          const subscribers = this.subscribers.get(msgKey);
          if (subscribers) {
            subscribers.forEach(cb => {
              try {
                cb(candle);
              } catch (error) {
                console.error('Error in Bybit subscriber callback:', error);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error processing Bybit message:', error);
      }
    });
    
    ws.on('error', (error) => {
      console.error('Bybit WebSocket error:', error);
    });
    
    ws.on('close', () => {
      console.log('Bybit WebSocket closed');
      
      // Remove connection
      this.wsConnections.delete('bybit');
      
      // Attempt to reconnect if we still have subscribers
      if (this.subscribers.size > 0) {
        console.log('Attempting to reconnect to Bybit...');
        setTimeout(() => {
          this.reconnect();
        }, 5000);
      }
    });
    
    // Store connection
    this.wsConnections.set('bybit', ws);
  }

  /**
   * Reconnect and resubscribe to all streams
   */
  reconnect() {
    const streams = new Set();
    
    // Collect all subscriptions
    this.subscribers.forEach((subscribers, key) => {
      const [symbol, interval] = key.split(':');
      streams.add(`kline.${interval}.${symbol}`);
    });
    
    if (streams.size === 0) {
      return;
    }
    
    // Create new WebSocket connection
    const ws = new WebSocket(this.wsBaseUrl);
    
    ws.on('open', () => {
      console.log('Reconnected to Bybit WebSocket');
      
      // Subscribe to all streams
      const subscribeMsg = {
        op: 'subscribe',
        args: Array.from(streams)
      };
      
      ws.send(JSON.stringify(subscribeMsg));
    });
    
    // Set up message handler
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        // Process kline data
        if (message.topic && message.topic.startsWith('kline.') && message.data) {
          const candleData = message.data[0];
          
          // Extract symbol and interval from topic
          const [, topicInterval, topicSymbol] = message.topic.split('.');
          const msgKey = `${topicSymbol}:${topicInterval}:kline`;
          
          // Convert to candle format
          const candle = {
            time: Math.floor(parseInt(candleData.start) / 1000),
            open: parseFloat(candleData.open),
            high: parseFloat(candleData.high),
            low: parseFloat(candleData.low),
            close: parseFloat(candleData.close),
            volume: parseFloat(candleData.volume)
          };
          
          // Notify all subscribers
          const subscribers = this.subscribers.get(msgKey);
          if (subscribers) {
            subscribers.forEach(cb => {
              try {
                cb(candle);
              } catch (error) {
                console.error('Error in Bybit subscriber callback:', error);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error processing Bybit message:', error);
      }
    });
    
    // Set up error handler
    ws.on('error', (error) => {
      console.error('Bybit WebSocket error:', error);
    });
    
    // Set up close handler
    ws.on('close', () => {
      console.log('Bybit WebSocket closed');
      
      // Remove connection
      this.wsConnections.delete('bybit');
      
      // Attempt to reconnect if we still have subscribers
      if (this.subscribers.size > 0) {
        console.log('Attempting to reconnect to Bybit...');
        setTimeout(() => {
          this.reconnect();
        }, 5000);
      }
    });
    
    // Store connection
    this.wsConnections.set('bybit', ws);
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
      console.log(`Removed subscriber from Bybit ${wsKey}, remaining: ${subscribers.size}`);
      
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
    const ws = this.wsConnections.get('bybit');
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Unsubscribe from kline data
    const unsubscribeMsg = {
      op: 'unsubscribe',
      args: [`kline.${interval}.${symbol}`]
    };
    
    ws.send(JSON.stringify(unsubscribeMsg));
  }

  /**
   * Close the WebSocket connection
   */
  closeConnection() {
    const ws = this.wsConnections.get('bybit');
    
    if (ws) {
      try {
        ws.close();
      } catch (error) {
        console.error('Error closing Bybit WebSocket:', error);
      }
      
      this.wsConnections.delete('bybit');
    }
    
    console.log('Closed Bybit connection');
  }

  /**
   * Get historical candles
   */
  async getHistoricalCandles(symbol, interval, limit) {
    try {
      const response = await axios.get(`${this.baseUrl}/v5/market/kline`, {
        params: {
          category: 'spot',
          symbol,
          interval,
          limit
        }
      });
      
      if (!response.data || !response.data.result || !response.data.result.list) {
        throw new Error('Invalid response from Bybit');
      }
      
      // Convert to candle format
      return response.data.result.list.map(candle => ({
        time: Math.floor(parseInt(candle[0]) / 1000),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      })).reverse(); // Bybit returns newest first, so reverse
    } catch (error) {
      console.error('Error fetching historical candles from Bybit:', error);
      throw new Error(`Failed to fetch historical candles from Bybit: ${error.message}`);
    }
  }

  /**
   * Check API status
   */
  async checkStatus() {
    try {
      const response = await axios.get(`${this.baseUrl}/v5/market/time`);
      return response.status === 200;
    } catch (error) {
      console.error('Error checking Bybit API status:', error);
      return false;
    }
  }
}

export default BybitConnector;