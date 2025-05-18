// backend/server.js
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
// eslint-disable-next-line
import axios from 'axios';
import { setupExchangeConnectors } from './exchanges/connectors.js';

// Create Express app
const app = express();
const port = process.env.PORT || 5000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store active client connections
const clients = new Set();

// Initialize exchange connectors
const exchangeConnectors = setupExchangeConnectors();

// Handle WebSocket connections
wss.on('connection', (ws) => {
  // Add client to active connections
  clients.add(ws);
  console.log(`Client connected. Total connections: ${clients.size}`);

  // Send initial connection status
  ws.send(JSON.stringify({
    type: 'status',
    connected: true
  }));

  // Handle client messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle subscription requests
      if (data.type === 'subscribe') {
        const { exchange, symbol, interval, stream } = data;
        
        if (!exchange || !symbol) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Missing required parameters: exchange, symbol'
          }));
          return;
        }
        
        // Find the exchange connector
        const connector = exchangeConnectors[exchange.toLowerCase()];
        if (!connector) {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unsupported exchange: ${exchange}`
          }));
          return;
        }
        
        // Subscribe to the stream
        connector.subscribe(symbol, interval || '1m', stream || 'kline', (data) => {
          // Only send if client is still connected
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: 'update',
              exchange,
              symbol,
              data
            }));
          }
        });
        
        // Confirm subscription
        ws.send(JSON.stringify({
          type: 'subscribed',
          exchange,
          symbol,
          interval: interval || '1m',
          stream: stream || 'kline'
        }));
      }
      
      // Handle unsubscribe requests
      else if (data.type === 'unsubscribe') {
        const { exchange, symbol, interval, stream } = data;
        
        if (!exchange || !symbol) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Missing required parameters: exchange, symbol'
          }));
          return;
        }
        
        // Find the exchange connector
        const connector = exchangeConnectors[exchange.toLowerCase()];
        if (connector) {
          connector.unsubscribe(symbol, interval || '1m', stream || 'kline');
          
          // Confirm unsubscription
          ws.send(JSON.stringify({
            type: 'unsubscribed',
            exchange,
            symbol,
            interval: interval || '1m',
            stream: stream || 'kline'
          }));
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Client disconnected. Total connections: ${clients.size}`);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// REST API routes for historical data
app.get('/api/historical', async (req, res) => {
  try {
    const { exchange, symbol, interval, limit } = req.query;
    
    if (!exchange || !symbol) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: exchange, symbol'
      });
    }
    
    // Find the exchange connector
    const connector = exchangeConnectors[exchange.toLowerCase()];
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
      parseInt(limit) || 100
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


// API endpoint for market data (for screener)
app.get('/api/market-data', async (req, res) => {
  try {
    const { exchange } = req.query;
    
    if (!exchange) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: exchange'
      });
    }
    
    // Find the exchange connector
    const connector = exchangeConnectors[exchange.toLowerCase()];
    if (!connector) {
      return res.status(400).json({
        success: false,
        error: `Unsupported exchange: ${exchange}`
      });
    }
    
    // Get available symbols for the exchange
    let symbols;
    try {
      symbols = await connector.getSymbols();
    } catch (error) {
      console.error(`Error fetching symbols for ${exchange}:`, error);
      symbols = []; // If we can't get symbols, use empty array
    }
    
    // Generate market data (in a real implementation, you would fetch this from the exchange API)
    const marketData = symbols.map(symbol => {
      // Base price determined by asset
      const basePrice = 
        symbol.baseAsset === 'BTC' ? 65000 :
        symbol.baseAsset === 'ETH' ? 3500 :
        symbol.baseAsset === 'SOL' ? 150 :
        symbol.baseAsset === 'BNB' ? 450 :
        symbol.baseAsset === 'ADA' ? 0.45 :
        symbol.baseAsset === 'DOGE' ? 0.15 :
        symbol.baseAsset === 'XRP' ? 0.55 :
        symbol.baseAsset === 'AVAX' ? 35 :
        symbol.baseAsset === 'DOT' ? 6.5 :
        symbol.baseAsset === 'MATIC' ? 0.70 : 
        10; // Default price
      
      // Add some random variation
      const price = basePrice * (1 + (Math.random() * 0.02 - 0.01)); // ±1%
      
      // Generate price change
      const priceChange = (Math.random() * 10 - 5); // -5% to +5%
      
      // Generate volume based on price
      const volume = price * (1000 + Math.random() * 5000);
      
      return {
        symbol: symbol.symbol,
        baseAsset: symbol.baseAsset,
        quoteAsset: symbol.quoteAsset,
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
    });
    
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

// API endpoint for top symbols by various metrics (for screener)
app.get('/api/top-symbols', async (req, res) => {
  try {
    const { metric = 'volume', limit = 20, exchanges } = req.query;
    
    // Parse exchanges list if provided
    const exchangeList = exchanges ? exchanges.split(',') : Object.keys(exchangeConnectors);
    
    // Collect symbols from all requested exchanges
    let allSymbols = [];
    
    for (const exchange of exchangeList) {
      const connector = exchangeConnectors[exchange.toLowerCase()];
      if (!connector) continue;
      
      try {
        const symbols = await connector.getSymbols();
        
        // Generate market data for these symbols
        const marketData = symbols.map(symbol => {
          // Base price determined by asset
          const basePrice = 
            symbol.baseAsset === 'BTC' ? 65000 :
            symbol.baseAsset === 'ETH' ? 3500 :
            symbol.baseAsset === 'SOL' ? 150 :
            symbol.baseAsset === 'BNB' ? 450 :
            symbol.baseAsset === 'ADA' ? 0.45 :
            symbol.baseAsset === 'DOGE' ? 0.15 :
            symbol.baseAsset === 'XRP' ? 0.55 :
            symbol.baseAsset === 'AVAX' ? 35 :
            symbol.baseAsset === 'DOT' ? 6.5 :
            symbol.baseAsset === 'MATIC' ? 0.70 : 
            10; // Default price
          
          // Add some random variation
          const price = basePrice * (1 + (Math.random() * 0.02 - 0.01)); // ±1%
          
          // Generate price change
          const priceChange = (Math.random() * 10 - 5); // -5% to +5%
          
          // Generate volume based on price
          const volume = price * (1000 + Math.random() * 5000);
          
          return {
            symbol: symbol.symbol,
            baseAsset: symbol.baseAsset,
            quoteAsset: symbol.quoteAsset,
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
        });
        
        allSymbols = [...allSymbols, ...marketData];
      } catch (error) {
        console.error(`Error fetching symbols for ${exchange}:`, error);
      }
    }
    
    // Sort based on metric
    if (metric === 'volume') {
      allSymbols.sort((a, b) => b.volume24h - a.volume24h);
    } else if (metric === 'price_change') {
      allSymbols.sort((a, b) => b.priceChange24h - a.priceChange24h);
    } else if (metric === 'volatility') {
      allSymbols.sort((a, b) => b.volatility - a.volatility);
    }
    
    // Apply limit
    const limitedSymbols = allSymbols.slice(0, parseInt(limit) || 20);
    
    return res.json({
      success: true,
      data: limitedSymbols
    });
  } catch (error) {
    console.error('Error generating top symbols data:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error generating top symbols data'
    });
  }
});

// Start server
server.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
  console.log(`WebSocket server available at ws://localhost:${port}`);
});