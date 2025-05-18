// backend/simple-server.js
// Full replacement code
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

console.log('Starting simple server...');

// Create Express app
const app = express();
const port = process.env.PORT || 5000;

// Enable CORS with proper configuration
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server with simpler options
const wss = new WebSocketServer({ 
  server,
  clientTracking: true
});

// Store active client connections
const clients = new Set();

// Simulate exchange connectors with a simple mock
const exchangeConnectors = {
  'binance': createMockConnector('Binance'),
  'okx': createMockConnector('OKX'),
  'bybit': createMockConnector('Bybit'),
  'mexc': createMockConnector('MEXC')
};

// Create a mock connector function
function createMockConnector(name) {
  return {
    name,
    
    // Mock subscription method
    subscribe(symbol, interval, stream, callback) {
      console.log(`[${name}] Subscribing to ${symbol} ${interval} ${stream}`);
      
      // Send an initial update immediately
      setTimeout(() => {
        const initialCandle = this.generateMockCandle(symbol);
        try {
          callback(initialCandle);
          console.log(`[${name}] Sent initial candle for ${symbol}`);
        } catch (error) {
          console.error(`Error sending initial update for ${symbol}:`, error);
        }
      }, 100);
      
      // Send simulated updates every 3 seconds
      const intervalId = setInterval(() => {
        try {
          const mockCandle = this.generateMockCandle(symbol);
          callback(mockCandle);
        } catch (error) {
          console.error(`Error in mock interval for ${symbol}:`, error);
        }
      }, 3000);
      
      // Store the interval ID for cleanup
      const key = `${name}:${symbol}:${interval}`;
      if (!global.mockIntervals) global.mockIntervals = {};
      global.mockIntervals[key] = intervalId;
      
      return intervalId;
    },
    
    // Mock unsubscribe method
    unsubscribe(symbol, interval, stream) {
      console.log(`[${name}] Unsubscribing from ${symbol} ${interval} ${stream}`);
      
      // Clean up interval
      const key = `${name}:${symbol}:${interval}`;
      if (global.mockIntervals && global.mockIntervals[key]) {
        clearInterval(global.mockIntervals[key]);
        delete global.mockIntervals[key];
        console.log(`[${name}] Cleared interval for ${key}`);
        return true;
      }
      
      return false;
    },
    
    // Generate a mock candle for testing
    generateMockCandle(symbol) {
      // Get current time and align to minute
      const now = Math.floor(Date.now() / 1000);
      const alignedTime = Math.floor(now / 60) * 60; // Align to minute boundary
      
      // Set base price based on symbol
      const basePrice = symbol.includes('BTC') ? 65000 : 
                       symbol.includes('ETH') ? 3500 :
                       symbol.includes('SOL') ? 150 :
                       symbol.includes('BNB') ? 450 : 100;
      
      // Generate random price around base with small variance
      const variance = 0.002; // 0.2% variance
      const randomFactor = (Math.random() - 0.5) * variance;
      const price = basePrice * (1 + randomFactor);
      
      // Calculate candle values
      const open = price;
      const close = price * (1 + (Math.random() - 0.5) * variance / 2);
      const high = Math.max(open, close) * (1 + Math.random() * variance / 4);
      const low = Math.min(open, close) * (1 - Math.random() * variance / 4);
      const volume = Math.random() * 100 + 10;
      
      return {
        time: alignedTime,
        open,
        high,
        low,
        close,
        volume
      };
    },
    
    // Mock historical candles method
    async getHistoricalCandles(symbol, interval, limit) {
      console.log(`[${name}] Getting historical candles for ${symbol} ${interval} ${limit}`);
      
      // Generate mock candles with realistic price continuity
      const candles = [];
      
      // Determine interval in seconds
      const intervalSeconds = 
        interval === '1m' ? 60 :
        interval === '5m' ? 300 :
        interval === '15m' ? 900 :
        interval === '30m' ? 1800 :
        interval === '1h' ? 3600 :
        interval === '4h' ? 14400 :
        interval === '1d' ? 86400 : 60;
      
      // Align current time to interval boundary
      const now = Math.floor(Date.now() / 1000);
      const alignedNow = Math.floor(now / intervalSeconds) * intervalSeconds;
      
      // Determine base price and trend
      const basePrice = symbol.includes('BTC') ? 65000 : 
                       symbol.includes('ETH') ? 3500 :
                       symbol.includes('SOL') ? 150 :
                       symbol.includes('BNB') ? 450 : 100;
      
      let currentPrice = basePrice;
      const trend = Math.random() > 0.5 ? 1 : -1; // Random trend direction
      
      for (let i = 0; i < limit; i++) {
        // Calculate time going backwards from now
        const time = alignedNow - (limit - i - 1) * intervalSeconds;
        
        // Add small random price movement with trend
        const trendFactor = trend * 0.0002; // Consistent trend direction
        const randomFactor = (Math.random() - 0.5) * 0.003;
        currentPrice = currentPrice * (1 + trendFactor + randomFactor);
        
        // Keep price within reasonable bounds
        if (currentPrice > basePrice * 1.05) currentPrice = basePrice * 1.05;
        if (currentPrice < basePrice * 0.95) currentPrice = basePrice * 0.95;
        
        // Calculate candle values
        const open = currentPrice;
        const close = currentPrice * (1 + (Math.random() - 0.5) * 0.002);
        const high = Math.max(open, close) * (1 + Math.random() * 0.001);
        const low = Math.min(open, close) * (1 - Math.random() * 0.001);
        const volume = Math.random() * 100 + 10;
        
        candles.push({
          time,
          open,
          high,
          low,
          close,
          volume
        });
      }
      
      return candles;
    },
    
    // NEW: Mock open interest data method
    async getOpenInterest(symbol, interval, limit) {
      console.log(`[${name}] Getting open interest for ${symbol} ${interval} ${limit}`);
      
      // Generate mock open interest data with realistic trends
      const openInterestData = [];
      
      // Determine interval in seconds
      const intervalSeconds = 
        interval === '1m' ? 60 :
        interval === '5m' ? 300 :
        interval === '15m' ? 900 :
        interval === '30m' ? 1800 :
        interval === '1h' ? 3600 :
        interval === '4h' ? 14400 :
        interval === '1d' ? 86400 : 60;
      
      // Align current time to interval boundary
      const now = Math.floor(Date.now() / 1000);
      const alignedNow = Math.floor(now / intervalSeconds) * intervalSeconds;
      
      // Determine base open interest value based on symbol
      // Higher for popular assets like BTC
      const baseOI = symbol.includes('BTC') ? 10000000 : 
                    symbol.includes('ETH') ? 5000000 :
                    symbol.includes('SOL') ? 2000000 :
                    symbol.includes('BNB') ? 1500000 : 1000000;
      
      let currentOI = baseOI;
      const trend = Math.random() > 0.5 ? 1 : -1; // Random trend direction
      
      for (let i = 0; i < limit; i++) {
        // Calculate time going backwards from now
        const time = alignedNow - (limit - i - 1) * intervalSeconds;
        
        // Add small random open interest movement with trend
        const trendFactor = trend * 0.0002; // Consistent trend direction
        const randomFactor = (Math.random() - 0.5) * 0.003;
        currentOI = currentOI * (1 + trendFactor + randomFactor);
        
        // Keep open interest within reasonable bounds
        if (currentOI > baseOI * 1.1) currentOI = baseOI * 1.1;
        if (currentOI < baseOI * 0.9) currentOI = baseOI * 0.9;
        
        openInterestData.push({
          time,
          openInterest: Math.round(currentOI) // Round to whole numbers
        });
      }
      
      return openInterestData;
    },
    
    // Get exchange symbols method
    getSymbols() {
      console.log(`[${name}] Getting symbols`);
      
      const commonSymbols = [
        { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'DOTUSDT', baseAsset: 'DOT', quoteAsset: 'USDT', status: 'TRADING' },
        { symbol: 'MATICUSDT', baseAsset: 'MATIC', quoteAsset: 'USDT', status: 'TRADING' }
      ];
      
      if (name === 'Binance') {
        return [
          ...commonSymbols,
          { symbol: 'BTCBUSD', baseAsset: 'BTC', quoteAsset: 'BUSD', status: 'TRADING' },
          { symbol: 'ETHBUSD', baseAsset: 'ETH', quoteAsset: 'BUSD', status: 'TRADING' }
        ];
      } else if (name === 'Bybit') {
        return [
          ...commonSymbols,
          { symbol: 'BTCUSDC', baseAsset: 'BTC', quoteAsset: 'USDC', status: 'Trading' },
          { symbol: 'ETHUSDC', baseAsset: 'ETH', quoteAsset: 'USDC', status: 'Trading' }
        ];
      } else if (name === 'OKX') {
        return commonSymbols.map(s => ({
          symbol: `${s.baseAsset}-${s.quoteAsset}`,
          baseAsset: s.baseAsset,
          quoteAsset: s.quoteAsset,
          status: 'live'
        }));
      } else if (name === 'MEXC') {
        return [
          ...commonSymbols,
          { symbol: 'LTCBTC', baseAsset: 'LTC', quoteAsset: 'BTC', status: 'TRADING' }
        ];
      }
      
      return commonSymbols;
    }
  };
}

console.log('Available exchanges:', Object.keys(exchangeConnectors));

// Add a ping interval to detect dead connections
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Client connection is dead, terminating');
      try {
        ws.terminate();
      } catch {
        console.error('Error terminating dead client');
      }
      return;
    }
    
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (error) {
      console.error('Error sending ping to client:', error);
      try {
        ws.terminate();
      } catch {
        // Ignore errors during termination
      }
    }
  });
}, 15000);

// Clean up the interval on server close
wss.on('close', () => {
  clearInterval(pingInterval);
});

// Handle WebSocket errors at the server level
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  try {
    // Add client to active connections
    clients.add(ws);
    console.log(`Client connected from ${req.socket.remoteAddress}. Total connections: ${clients.size}`);

    // Setup ping/pong
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Send initial connection status
    try {
      ws.send(JSON.stringify({
        type: 'status',
        connected: true
      }));
      console.log('Sent initial status message to client');
    } catch (error) {
      console.error('Error sending initial status message:', error);
    }

    // Store subscriptions for this client
    const clientSubscriptions = new Set();

    // Handle client messages
    ws.on('message', (message) => {
      try {
        console.log('Received message:', message.toString().substring(0, 100));
        const data = JSON.parse(message.toString());
        
        // Handle ping messages
        if (data.type === 'ping') {
          try {
            ws.send(JSON.stringify({ type: 'pong' }));
            console.log('Sent pong response');
          } catch (error) {
            console.error('Error sending pong response:', error);
          }
          return;
        }
        
        // Handle status request message
        if (data.type === 'status_request') {
          try {
            ws.send(JSON.stringify({
              type: 'status',
              connected: true
            }));
            console.log('Sent status response to status_request');
          } catch (error) {
            console.error('Error sending status response:', error);
          }
          return;
        }
        
        // Handle subscription requests
        if (data.type === 'subscribe') {
          const { exchange, symbol, interval, stream } = data;
          
          if (!exchange || !symbol) {
            try {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Missing required parameters: exchange, symbol'
              }));
            } catch (error) {
              console.error('Error sending error message:', error);
            }
            return;
          }
          
          console.log(`Subscription request: ${exchange}:${symbol}:${interval || '1m'}`);
          
          // Find the exchange connector
          const connector = exchangeConnectors[exchange.toLowerCase()];
          if (!connector) {
            try {
              ws.send(JSON.stringify({
                type: 'error',
                message: `Unsupported exchange: ${exchange}`
              }));
            } catch (error) {
              console.error('Error sending error message:', error);
            }
            return;
          }
          
          // Create unique subscription key
          const subscriptionKey = `${exchange}:${symbol}:${interval || '1m'}:${stream || 'kline'}`;
          
          // Add to client subscriptions
          clientSubscriptions.add(subscriptionKey);
          
          // Subscribe to the stream
          try {
            // First send a confirmation that we're processing the subscription
            try {
              ws.send(JSON.stringify({
                type: 'subscription_processing',
                exchange,
                symbol,
                interval: interval || '1m',
                stream: stream || 'kline'
              }));
              console.log(`Sent subscription processing notification for ${subscriptionKey}`);
            } catch (e) {
              console.error(`Error sending subscription processing notification: ${e}`);
            }
            
            // Then subscribe to the stream
            connector.subscribe(symbol, interval || '1m', stream || 'kline', (data) => {
              // Only send if client is still connected
              if (ws.readyState === ws.OPEN) {
                try {
                  ws.send(JSON.stringify({
                    type: 'update',
                    exchange,
                    symbol,
                    data
                  }));
                } catch (error) {
                  console.error(`Error sending update for ${subscriptionKey}:`, error);
                }
              }
            });
            
            // Confirm subscription
            try {
              ws.send(JSON.stringify({
                type: 'subscribed',
                exchange,
                symbol,
                interval: interval || '1m',
                stream: stream || 'kline'
              }));
              console.log(`Sent subscription confirmation for ${subscriptionKey}`);
            } catch (error) {
              console.error('Error sending subscription confirmation:', error);
            }
            
            // Send an immediate initial update
            const initialCandle = connector.generateMockCandle(symbol);
            try {
              ws.send(JSON.stringify({
                type: 'update',
                exchange,
                symbol,
                data: initialCandle
              }));
              console.log(`Sent initial update for ${subscriptionKey}`);
            } catch (error) {
              console.error(`Error sending initial update for ${subscriptionKey}:`, error);
            }
          } catch (error) {
            console.error(`Error processing subscription for ${subscriptionKey}:`, error);
            try {
              ws.send(JSON.stringify({
                type: 'error',
                message: `Subscription error: ${error.message || 'Unknown error'}`
              }));
            } catch (sendError) {
              console.error('Error sending subscription error message:', sendError);
            }
          }
        }
        
        // Handle unsubscribe requests
        else if (data.type === 'unsubscribe') {
          const { exchange, symbol, interval, stream } = data;
          
          if (!exchange || !symbol) {
            try {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Missing required parameters: exchange, symbol'
              }));
            } catch (error) {
              console.error('Error sending error message:', error);
            }
            return;
          }
          
          // Find the exchange connector
          const connector = exchangeConnectors[exchange.toLowerCase()];
          if (connector) {
            // Create unique subscription key
            const subscriptionKey = `${exchange}:${symbol}:${interval || '1m'}:${stream || 'kline'}`;
            
            // Remove from client subscriptions
            clientSubscriptions.delete(subscriptionKey);
            
            connector.unsubscribe(symbol, interval || '1m', stream || 'kline');
            
            // Confirm unsubscription
            try {
              ws.send(JSON.stringify({
                type: 'unsubscribed',
                exchange,
                symbol,
                interval: interval || '1m',
                stream: stream || 'kline'
              }));
            } catch (error) {
              console.error('Error sending unsubscription confirmation:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
        try {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        } catch (sendError) {
          console.error('Error sending error message:', sendError);
        }
      }
    });

    // Handle client disconnection
    ws.on('close', (code, reason) => {
      console.log(`Client disconnected. Code: ${code}, Reason: ${reason || 'No reason provided'}`);
      
      // Clean up all subscriptions for this client
      for (const subscriptionKey of clientSubscriptions) {
        const [exchange, symbol, interval, stream] = subscriptionKey.split(':');
        const connector = exchangeConnectors[exchange.toLowerCase()];
        if (connector) {
          try {
            connector.unsubscribe(symbol, interval, stream);
            console.log(`Cleaned up subscription: ${subscriptionKey}`);
          } catch (error) {
            console.error(`Error cleaning up subscription ${subscriptionKey}:`, error);
          }
        }
      }
      
      // Remove client from set
      clients.delete(ws);
      console.log(`Client disconnected. Total connections: ${clients.size}`);
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket client error:', error);
      // Clean up all subscriptions for this client
      for (const subscriptionKey of clientSubscriptions) {
        const [exchange, symbol, interval, stream] = subscriptionKey.split(':');
        const connector = exchangeConnectors[exchange.toLowerCase()];
        if (connector) {
          connector.unsubscribe(symbol, interval, stream);
        }
      }
      
      clients.delete(ws);
    });
  } catch (error) {
    console.error('Error handling WebSocket connection:', error);
  }
});

// API routes
app.get('/api/test', (req, res) => {
  console.log('Test endpoint hit!');
  res.json({ success: true, message: 'API server is working' });
});

// FIXED: Updated /api/symbols endpoint to properly handle all exchanges
app.get('/api/symbols', (req, res) => {
  try {
    console.log('Symbols endpoint hit!');
    const { exchange } = req.query;
    
    if (!exchange) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: exchange'
      });
    }
    
    // Normalize exchange name for case-insensitive matching
    const normalizedExchange = exchange.toLowerCase();
    
    // Find the exchange connector
    const connector = exchangeConnectors[normalizedExchange];
    if (!connector) {
      console.error(`Unsupported exchange requested: ${exchange}`);
      return res.status(400).json({
        success: false,
        error: `Unsupported exchange: ${exchange}`
      });
    }
    
    // Get symbols for the exchange
    const symbols = connector.getSymbols();
    console.log(`Found ${symbols.length} symbols for ${exchange}`);
    
    return res.json({
      success: true,
      symbols
    });
  } catch (error) {
    console.error('Error fetching exchange symbols:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error fetching exchange symbols'
    });
  }
});

app.get('/api/historical', async (req, res) => {
  try {
    const { exchange, symbol, interval, limit } = req.query;
    
    if (!exchange || !symbol) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: exchange, symbol'
      });
    }
    
    // Normalize exchange name for case-insensitive matching
    const normalizedExchange = exchange.toLowerCase();
    
    // Find the exchange connector
    const connector = exchangeConnectors[normalizedExchange];
    if (!connector) {
      return res.status(400).json({
        success: false,
        error: `Unsupported exchange: ${exchange}`
      });
    }
    
    // Get historical data
    const candles = await connector.getHistoricalCandles(
      symbol,
      interval || '1m',
      parseInt(limit?.toString() || '100')
    );
    
    return res.json({
      success: true,
      candles
    });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error fetching historical data'
    });
  }
});

// NEW: Open Interest endpoint
app.get('/api/open-interest', async (req, res) => {
  try {
    console.log('Open Interest endpoint hit!');
    const { exchange, symbol, interval, limit } = req.query;
    
    if (!exchange || !symbol) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: exchange, symbol'
      });
    }
    
    // Normalize exchange name for case-insensitive matching
    const normalizedExchange = exchange.toLowerCase();
    
    // Find the exchange connector
    const connector = exchangeConnectors[normalizedExchange];
    if (!connector) {
      return res.status(400).json({
        success: false,
        error: `Unsupported exchange: ${exchange}`
      });
    }
    
    // Get open interest data
    const openInterestData = await connector.getOpenInterest(
      symbol,
      interval || '1m',
      parseInt(limit?.toString() || '100')
    );
    
    return res.json({
      success: true,
      data: openInterestData
    });
  } catch (error) {
    console.error('Error fetching open interest data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error fetching open interest data'
    });
  }
});

// Market data endpoint

// REST API routes for market data (for screener)
app.get('/api/market-data', async (req, res) => {
  try {
    const { exchange } = req.query;
    
    if (!exchange) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: exchange'
      });
    }
    
    console.log(`Received market data request for exchange: ${exchange}`);
    
    // Find the exchange connector
    const connector = exchangeConnectors[exchange.toLowerCase()];
    if (!connector) {
      console.log(`Exchange connector not found for ${exchange}`);
      // Return mock data instead of error
      return res.json({
        success: true,
        data: generateMockMarketData(exchange.toString())
      });
    }
    
    // Try to get symbols from the connector
    let symbols = [];
    try {
      // Check if getSymbols method exists
      if (typeof connector.getSymbols === 'function') {
        symbols = await connector.getSymbols();
        console.log(`Fetched ${symbols.length} symbols from ${exchange}`);
      } else {
        console.log(`getSymbols method not found for ${exchange}, using mock data`);
        symbols = generateMockSymbols(exchange.toString());
      }
    } catch (error) {
      console.error(`Error fetching symbols for ${exchange}:`, error);
      symbols = generateMockSymbols(exchange.toString());
    }
    
    // Generate market data
    const marketData = symbols.map(symbol => generateMarketData(symbol, exchange.toString()));
    
    return res.json({
      success: true,
      data: marketData
    });
  } catch (error) {
    console.error('Error generating market data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error generating market data'
    });
  }
});

// Helper function to generate mock symbols
function generateMockSymbols(exchange) {
  console.log(`Generating mock symbols for ${exchange}`);
  const commonSymbols = [
    { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'DOTUSDT', baseAsset: 'DOT', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'MATICUSDT', baseAsset: 'MATIC', quoteAsset: 'USDT', status: 'TRADING' }
  ];
  
  // Add some exchange-specific symbols
  if (exchange === 'Binance') {
    return [
      ...commonSymbols,
      { symbol: 'BTCBUSD', baseAsset: 'BTC', quoteAsset: 'BUSD', status: 'TRADING' },
      { symbol: 'ETHBUSD', baseAsset: 'ETH', quoteAsset: 'BUSD', status: 'TRADING' }
    ];
  } else if (exchange === 'Bybit') {
    return [
      ...commonSymbols,
      { symbol: 'BTCUSDC', baseAsset: 'BTC', quoteAsset: 'USDC', status: 'Trading' },
      { symbol: 'ETHUSDC', baseAsset: 'ETH', quoteAsset: 'USDC', status: 'Trading' }
    ];
  } else if (exchange === 'OKX') {
    return commonSymbols.map(s => ({
      symbol: `${s.baseAsset}-${s.quoteAsset}`, // OKX uses format like BTC-USDT
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      status: 'live'
    }));
  } else if (exchange === 'MEXC') {
    return [
      ...commonSymbols,
      { symbol: 'LTCBTC', baseAsset: 'LTC', quoteAsset: 'BTC', status: 'TRADING' }
    ];
  }
  
  return commonSymbols;
}

// Helper function to generate market data for a symbol
function generateMarketData(symbol, exchange) {
  // Base price determined by asset
  const baseAsset = symbol.baseAsset || '';
  const basePrice = 
    baseAsset.includes('BTC') ? 65000 :
    baseAsset.includes('ETH') ? 3500 :
    baseAsset.includes('SOL') ? 150 :
    baseAsset.includes('BNB') ? 450 :
    baseAsset.includes('ADA') ? 0.45 :
    baseAsset.includes('DOGE') ? 0.15 :
    baseAsset.includes('XRP') ? 0.55 :
    baseAsset.includes('AVAX') ? 35 :
    baseAsset.includes('DOT') ? 6.5 :
    baseAsset.includes('MATIC') ? 0.70 : 
    10; // Default price
  
  // Add some random variation
  const price = basePrice * (1 + (Math.random() * 0.02 - 0.01)); // ±1%
  
  // Generate price change
  const priceChange = (Math.random() * 10 - 5); // -5% to +5%
  
  // Generate volume based on price
  const volume = price * (1000 + Math.random() * 5000);
  
  return {
    symbol: symbol.symbol,
    baseAsset: symbol.baseAsset || '',
    quoteAsset: symbol.quoteAsset || '',
    price,
    priceChange24h: priceChange,
    volume24h: volume,
    volumeChange24h: Math.random() * 20 - 10, // -10% to +10%
    high24h: price * (1 + Math.random() * 0.05), // Up to 5% higher
    low24h: price * (1 - Math.random() * 0.05), // Up to 5% lower
    exchanges: [exchange],
    primaryExchange: exchange,
    volatility: Math.random() * 5, // 0-5% volatility
    lastUpdated: Date.now()
  };
}

// Helper function to generate mock market data (fallback)
function generateMockMarketData(exchange) {
  const symbols = generateMockSymbols(exchange);
  return symbols.map(symbol => generateMarketData(symbol, exchange));
}

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`WebSocket server available at ws://localhost:${port}`);
  console.log(`REST API available at http://localhost:${port}/api`);
  console.log(`Test the API: http://localhost:${port}/api/test`);
  console.log(`Test symbols: http://localhost:${port}/api/symbols?exchange=Binance`);
  console.log(`Test open interest: http://localhost:${port}/api/open-interest?exchange=Binance&symbol=BTCUSDT&interval=1m`);
  console.log(`Test market data: http://localhost:${port}/api/market-data?exchange=Binance`);
  console.log(`Test top symbols: http://localhost:${port}/api/top-symbols?metric=volume&limit=10&exchanges=Binance,Bybit`);
});