// C:\Users\Raja Adil\Documents\realtime-charting-app\backend\simple-server.js
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

console.log('Starting server...');

// Create Express app
const app = express();
const port = process.env.PORT || 5000;

// Enable CORS
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store active client connections
const clients = new Set();

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
    console.log('Received message:', message.toString());
    
    try {
      const data = JSON.parse(message.toString());
      
      // Echo the message back
      ws.send(JSON.stringify({
        type: 'echo',
        data
      }));
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Client disconnected. Total connections: ${clients.size}`);
  });
});

// Simple API route
app.get('/api/historical', (req, res) => {
  const { limit } = req.query;
  
  // Generate some mock candle data
  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  const intervalSeconds = 60; // 1 minute
  const count = parseInt(limit ? limit.toString() : '100');
  
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * intervalSeconds;
    const price = 65000 + (Math.random() - 0.5) * 1000; // Random price around 65000
    
    candles.push({
      time,
      open: price,
      high: price * (1 + Math.random() * 0.01),
      low: price * (1 - Math.random() * 0.01),
      close: price * (1 + (Math.random() - 0.5) * 0.01),
      volume: Math.random() * 100
    });
  }
  
  res.json({
    success: true,
    candles
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running'
  });
});

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`WebSocket server available at ws://localhost:${port}`);
  console.log(`REST API available at http://localhost:${port}/api`);
});