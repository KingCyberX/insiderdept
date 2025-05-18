// C:\Users\Raja Adil\Documents\realtime-charting-app\backend\create-missing-connectors.js
import * as fs from 'fs';
import path from 'path';

// Create OKX connector
const okxConnectorPath = path.join(process.cwd(), 'exchanges', 'okxConnector.js');
const okxConnectorContent = `// Simple ES Module implementation of okxConnector.js
import WebSocket from 'ws';
import axios from 'axios';

class OkxConnector {
  constructor() {
    this.baseUrl = 'https://www.okx.com/api/v5';
    this.wsBaseUrl = 'wss://ws.okx.com:8443/ws/v5';
    this.wsConnections = new Map();
    this.subscribers = new Map();
  }

  /**
   * Subscribe to a market data stream (simplified mock implementation)
   */
  subscribe(symbol, interval, stream, callback) {
    console.log(\`Subscribing to OKX \${symbol} \${interval} \${stream}\`);
    
    // Store callback
    const key = \`\${symbol}:\${interval}:\${stream}\`;
    this.subscribers.set(key, callback);
    
    // Send mock updates every few seconds
    const intervalId = setInterval(() => {
      const mockCandle = this.generateMockCandle(symbol);
      callback(mockCandle);
    }, 5000);
    
    // Store interval ID for cleanup
    this.wsConnections.set(key, intervalId);
  }

  /**
   * Unsubscribe from a market data stream
   */
  unsubscribe(symbol, interval, stream) {
    console.log(\`Unsubscribing from OKX \${symbol} \${interval} \${stream}\`);
    const key = \`\${symbol}:\${interval}:\${stream}\`;
    
    // Clear interval
    const intervalId = this.wsConnections.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      this.wsConnections.delete(key);
    }
    
    // Remove subscriber
    this.subscribers.delete(key);
  }

  /**
   * Generate a mock candle for testing
   */
  generateMockCandle(symbol) {
    const now = Math.floor(Date.now() / 1000);
    const basePrice = symbol.includes('BTC') ? 65000 : 3500;
    const price = basePrice + (Math.random() - 0.5) * 1000;
    
    return {
      time: now,
      open: price,
      high: price * (1 + Math.random() * 0.01),
      low: price * (1 - Math.random() * 0.01),
      close: price * (1 + (Math.random() - 0.5) * 0.01),
      volume: Math.random() * 100
    };
  }

  /**
   * Get historical candles
   */
  async getHistoricalCandles(symbol, interval, limit) {
    console.log(\`Getting historical candles for OKX \${symbol} \${interval} \${limit}\`);
    
    // Generate mock historical candles
    const candles = [];
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = interval === '1m' ? 60 : 300;
    
    for (let i = 0; i < limit; i++) {
      const time = now - (limit - i) * intervalSeconds;
      const basePrice = symbol.includes('BTC') ? 65000 : 3500;
      const price = basePrice + (Math.random() - 0.5) * 1000;
      
      candles.push({
        time,
        open: price,
        high: price * (1 + Math.random() * 0.01),
        low: price * (1 - Math.random() * 0.01),
        close: price * (1 + (Math.random() - 0.5) * 0.01),
        volume: Math.random() * 100
      });
    }
    
    return candles;
  }

  /**
   * Format a symbol into OKX format (e.g., BTCUSDT -> BTC-USDT)
   */
  formatSymbol(symbol) {
    // OKX uses format like BTC-USDT
    if (symbol.includes('-')) return symbol;
    
    // Try to find where to split the symbol
    const bases = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'MATIC'];
    for (const base of bases) {
      if (symbol.startsWith(base)) {
        return \`\${base}-\${symbol.slice(base.length)}\`;
      }
    }
    
    // Default fallback
    return symbol;
  }

  /**
   * Check API status
   */
  async checkStatus() {
    return true; // Always return true for mock implementation
  }
}

// Export the connector
export default OkxConnector;`;

fs.writeFileSync(okxConnectorPath, okxConnectorContent, 'utf8');
console.log(`Created OKX connector at: ${okxConnectorPath}`);

// Create MEXC connector
const mexcConnectorPath = path.join(process.cwd(), 'exchanges', 'mexcConnector.js');
const mexcConnectorContent = `// Simple ES Module implementation of mexcConnector.js
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
   * Subscribe to a market data stream (simplified mock implementation)
   */
  subscribe(symbol, interval, stream, callback) {
    console.log(\`Subscribing to MEXC \${symbol} \${interval} \${stream}\`);
    
    // Store callback
    const key = \`\${symbol}:\${interval}:\${stream}\`;
    this.subscribers.set(key, callback);
    
    // Send mock updates every few seconds
    const intervalId = setInterval(() => {
      const mockCandle = this.generateMockCandle(symbol);
      callback(mockCandle);
    }, 5000);
    
    // Store interval ID for cleanup
    this.wsConnections.set(key, intervalId);
  }

  /**
   * Unsubscribe from a market data stream
   */
  unsubscribe(symbol, interval, stream) {
    console.log(\`Unsubscribing from MEXC \${symbol} \${interval} \${stream}\`);
    const key = \`\${symbol}:\${interval}:\${stream}\`;
    
    // Clear interval
    const intervalId = this.wsConnections.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      this.wsConnections.delete(key);
    }
    
    // Remove subscriber
    this.subscribers.delete(key);
  }

  /**
   * Generate a mock candle for testing
   */
  generateMockCandle(symbol) {
    const now = Math.floor(Date.now() / 1000);
    const basePrice = symbol.includes('BTC') ? 65000 : 3500;
    const price = basePrice + (Math.random() - 0.5) * 1000;
    
    return {
      time: now,
      open: price,
      high: price * (1 + Math.random() * 0.01),
      low: price * (1 - Math.random() * 0.01),
      close: price * (1 + (Math.random() - 0.5) * 0.01),
      volume: Math.random() * 100
    };
  }

  /**
   * Get historical candles
   */
  async getHistoricalCandles(symbol, interval, limit) {
    console.log(\`Getting historical candles for MEXC \${symbol} \${interval} \${limit}\`);
    
    // Generate mock historical candles
    const candles = [];
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = interval === '1m' ? 60 : 300;
    
    for (let i = 0; i < limit; i++) {
      const time = now - (limit - i) * intervalSeconds;
      const basePrice = symbol.includes('BTC') ? 65000 : 3500;
      const price = basePrice + (Math.random() - 0.5) * 1000;
      
      candles.push({
        time,
        open: price,
        high: price * (1 + Math.random() * 0.01),
        low: price * (1 - Math.random() * 0.01),
        close: price * (1 + (Math.random() - 0.5) * 0.01),
        volume: Math.random() * 100
      });
    }
    
    return candles;
  }

  /**
   * Check API status
   */
  async checkStatus() {
    return true; // Always return true for mock implementation
  }
}

// Export the connector
export default MexcConnector;`;

fs.writeFileSync(mexcConnectorPath, mexcConnectorContent, 'utf8');
console.log(`Created MEXC connector at: ${mexcConnectorPath}`);

// Create a test script to make sure our imports work
const testPath = path.join(process.cwd(), 'test-connectors.js');
const testContent = `// Test that all connectors can be imported
import BinanceConnector from './exchanges/binanceConnector.js';
import OkxConnector from './exchanges/okxConnector.js';
import BybitConnector from './exchanges/bybitConnector.js';
import MexcConnector from './exchanges/mexcConnector.js';

console.log('Successfully imported all connectors:');
console.log('- BinanceConnector:', typeof BinanceConnector);
console.log('- OkxConnector:', typeof OkxConnector);
console.log('- BybitConnector:', typeof BybitConnector);
console.log('- MexcConnector:', typeof MexcConnector);

// Try creating instances
try {
  const binance = new BinanceConnector();
  const okx = new OkxConnector();
  const bybit = new BybitConnector();
  const mexc = new MexcConnector();
  
  console.log('\\nSuccessfully created instances of all connectors!');
} catch (error) {
  console.error('Error creating instances:', error);
}`;

fs.writeFileSync(testPath, testContent, 'utf8');
console.log(`Created test script at: ${testPath}`);