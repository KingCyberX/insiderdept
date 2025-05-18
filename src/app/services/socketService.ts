// src/app/services/socketService.ts

import { Candle, TimeInterval } from '../types/market';
import TimestampUtils from '../utils/timestampUtils';

// Extended Candle interface for mock data support
interface ExtendedCandle extends Candle {
  isMock?: boolean;
  source?: 'real' | 'mock' | 'historical' | 'unknown';
}

// Define interfaces for WebSocket messages
interface SubscribeMessage {
  type: 'subscribe';
  exchange: string;
  symbol: string;
  interval: TimeInterval;
  stream?: string;
}

interface UnsubscribeMessage {
  type: 'unsubscribe';
  exchange: string;
  symbol: string;
  interval: TimeInterval;
  stream?: string;
}

interface UpdateMessage {
  type: 'update';
  exchange: string;
  symbol: string;
  data: Candle;
}

interface StatusMessage {
  type: 'status';
  connected: boolean;
}

interface StatusRequestMessage {
  type: 'status_request';
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

interface SubscribedMessage {
  type: 'subscribed';
  exchange: string;
  symbol: string;
  interval: TimeInterval;
}

interface UnsubscribedMessage {
  type: 'unsubscribed';
  exchange: string;
  symbol: string;
  interval: TimeInterval;
}

interface PingMessage {
  type: 'ping';
}

interface PongMessage {
  type: 'pong';
}

interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp?: number;
}

type WebSocketMessage = 
  | SubscribeMessage 
  | UnsubscribeMessage 
  | UpdateMessage 
  | StatusMessage 
  | StatusRequestMessage
  | ErrorMessage 
  | SubscribedMessage 
  | UnsubscribedMessage
  | PingMessage
  | PongMessage
  | HeartbeatMessage;

// Define handlers interface
interface WebSocketHandlers {
  onUpdate?: (exchange: string, symbol: string, data: ExtendedCandle) => void;
  onStatus?: (connected: boolean) => void;
  onError?: (message: string) => void;
  onSubscribed?: (exchange: string, symbol: string, interval: TimeInterval) => void;
  onUnsubscribed?: (exchange: string, symbol: string, interval: TimeInterval) => void;
}

// Data source tracking interface
interface DataSourceTracker {
  hasRealData: boolean;         // Whether real data has ever been received
  lastRealUpdateTime: number;   // Timestamp of last real data update
  initialDataReceived: boolean; // Whether initial data has been loaded
}

/**
 * WebSocket service for real-time market data
 */
class SocketService {
  private ws: WebSocket | null = null;
  private serverUrl: string = 'ws://localhost:5000'; // Default WebSocket server URL
  private apiUrl: string = 'http://localhost:5000/api'; // Default API server URL
  private handlers: WebSocketHandlers = {};
  private reconnectInterval: number = 3000; // Reconnect interval in ms
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5; // Increased for better recovery
  private subscriptions: Map<string, SubscribeMessage> = new Map();
  private connected: boolean = false;
  private handlersBySubscription: Map<string, WebSocketHandlers> = new Map();
  private mockMode: boolean = false;
  private mockUpdateIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastCandleBySymbol: Map<string, ExtendedCandle> = new Map(); // Track last candle for each symbol
  private connectionTimeout: NodeJS.Timeout | null = null;
  private connectingInProgress: boolean = false; // Flag to prevent multiple connect calls
  private serverAvailabilityCheckInProgress: boolean = false;
  private serverConnectionFailed: boolean = false; // Flag to track if the server is unavailable
  private pendingSubscriptions: Set<string> = new Set(); // Track pending subscriptions
  
  // Debug tracking
  private lastDebugLog: number = 0;
  private debugThrottle: number = 3000; // 3 seconds between debug logs
  
  // Tracking real data sources to avoid mixing with mock data
  private dataSourceTracker: Map<string, DataSourceTracker> = new Map();
  
  // Configuration
  private mockFallbackDelay: number = 10000; // 10 seconds without real data before using mock
  private forceRealDataOnly: boolean = false; // Set to true to completely disable mock data
  private pingInterval: NodeJS.Timeout | null = null;
  private pingIntervalMs: number = 10000; // Ping every 10 seconds
  private connectionAttemptTimeout: number = 20000; // Increased to 20 seconds for better connection reliability
  
  // Circuit breaker pattern
  private circuitOpen: boolean = false; // Circuit breaker state
  private circuitResetTimeout: NodeJS.Timeout | null = null;
  private consecutiveFailures: number = 0;
  private readonly MAX_FAILURES_BEFORE_CIRCUIT_OPEN = 3;
  private readonly CIRCUIT_RESET_TIMEOUT = 30000; // 30 seconds

  constructor() {
    console.log('SocketService: Constructor called');
    
    // Get environment variables
    const env = {
      WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:5000',
      API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'
    };
    
    console.log('Environment variables in socketService:', env);
    
    this.serverUrl = env.WS_URL;
    this.apiUrl = env.API_URL;
    
    console.log(`SocketService: Using WebSocket server URL: ${this.serverUrl}`);
    
    // Check for server availability after the instance is created
    this.checkServerAvailability()
      .then(() => {
        this.connect();
      })
      .catch((error) => {
        console.error('SocketService: Server unavailable during initialization:', error);
        this.notifyError({
          type: 'Server unavailable',
          message: 'WebSocket server is not available',
          error
        });
      });
  }

  /**
   * Check if the WebSocket server is available
   * This helps quickly determine if we should use mock mode
   */
  private async checkServerAvailability(): Promise<void> {
    console.log(`SocketService: Checking server availability at ${this.serverUrl}`);
    
    // Skip if already in mock mode or check already in progress
    if (this.mockMode || this.serverAvailabilityCheckInProgress) {
      return Promise.resolve();
    }
    
    this.serverAvailabilityCheckInProgress = true;
    
    return new Promise<void>((resolve, reject) => {
      try {
        const testWs = new WebSocket(this.serverUrl);
        
        const timeout = setTimeout(() => {
          if (testWs.readyState !== WebSocket.OPEN) {
            testWs.close();
            this.serverAvailabilityCheckInProgress = false;
            this.serverConnectionFailed = true;
            this.mockMode = true;
            reject(new Error('Connection timeout while checking server availability'));
          }
        }, 5000);
        
        testWs.onopen = () => {
          console.log('SocketService: Server is available - successful test connection');
          clearTimeout(timeout);
          
          // Send a test ping message to ensure full communication works
          testWs.send(JSON.stringify({ type: 'ping' }));
          console.log('SocketService: Sent test ping message');
        };
        
        testWs.onclose = (event) => {
          console.log('SocketService: Test connection closed during availability check', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          });
          
          clearTimeout(timeout);
          this.serverAvailabilityCheckInProgress = false;
          
          if (event.wasClean) {
            resolve();
          } else {
            this.serverConnectionFailed = true;
            this.mockMode = true;
            reject(new Error(`Test connection closed with code ${event.code}`));
          }
        };
        
        testWs.onerror = (error) => {
          console.error('SocketService: Test connection error:', error);
          clearTimeout(timeout);
          testWs.close();
          this.serverAvailabilityCheckInProgress = false;
          this.serverConnectionFailed = true;
          this.mockMode = true;
          reject(new Error('Error while testing server availability'));
        };
        
        testWs.onmessage = (event) => {
          try {
            console.log('SocketService: Received message during availability check:', event.data);
            const data = JSON.parse(event.data);
            
            if (data.type === 'pong') {
              console.log('SocketService: Server responded to ping, connection is fully working');
              clearTimeout(timeout);
              testWs.close(1000, 'Test complete');
              this.serverAvailabilityCheckInProgress = false;
              resolve();
            }
          } catch (error) {
            console.error('SocketService: Error parsing test message:', error);
          }
        };
      } catch (error) {
        console.error('SocketService: Error creating test WebSocket:', error);
        this.serverAvailabilityCheckInProgress = false;
        this.serverConnectionFailed = true;
        this.mockMode = true;
        reject(error);
      }
    });
  }

  /**
   * Set global handlers that apply to all subscriptions
   */
  setGlobalHandlers(): void {
    const handlers = [
      ...this.handlers.onStatus ? ['onStatus'] : [],
      ...this.handlers.onError ? ['onError'] : []
    ];
    
    console.log(`SocketService: Setting global handlers (${handlers.length}) ${JSON.stringify(handlers)}`);
  }

  /**
   * Notify error handlers
   */
  private notifyError(error: Error | { message: string; type?: string; [key: string]: unknown }): void {
    if (this.handlers.onError) {
      this.handlers.onError(error.message || JSON.stringify(error));
    }
  }

  /**
   * Get the connection status
   */
  isConnected(): boolean {
    return this.connected || this.mockMode;
  }

  /**
   * Notify the service that real data has been received for a symbol
   * This helps prevent mock data from overwriting real data
   */
  notifyRealDataReceived(exchange: string, symbol: string, interval: TimeInterval): void {
    const key = `${exchange}:${symbol}:${interval}`;
    
    const tracker = this.dataSourceTracker.get(key) || { 
      hasRealData: false, 
      lastRealUpdateTime: 0,
      initialDataReceived: true
    };
    
    // Update tracker
    tracker.hasRealData = true;
    tracker.lastRealUpdateTime = Date.now();
    tracker.initialDataReceived = true;
    
    this.dataSourceTracker.set(key, tracker);
    
    // Cancel any mock update intervals for this symbol if real data is recent
    const shouldCancelMock = tracker.lastRealUpdateTime > Date.now() - 15000; // Real data in last 15 sec
    
    if (shouldCancelMock) {
      const updateIntervalKey = `${exchange}:${symbol}:${interval}`;
      if (this.mockUpdateIntervals.has(updateIntervalKey)) {
        clearInterval(this.mockUpdateIntervals.get(updateIntervalKey)!);
        this.mockUpdateIntervals.delete(updateIntervalKey);
        console.log(`SocketService: Stopped mock updates for ${key} after receiving real data`);
      }
    }
  }

  /**
   * Set handlers for websocket events
   */
  setHandlers(handlers: WebSocketHandlers): void {
    // Merge with existing handlers
    if (handlers.onUpdate) this.handlers.onUpdate = handlers.onUpdate;
    if (handlers.onStatus) this.handlers.onStatus = handlers.onStatus;
    if (handlers.onError) this.handlers.onError = handlers.onError;
    if (handlers.onSubscribed) this.handlers.onSubscribed = handlers.onSubscribed;
    if (handlers.onUnsubscribed) this.handlers.onUnsubscribed = handlers.onUnsubscribed;
    
    // If in mock mode, trigger connected status
    if (this.mockMode && handlers.onStatus) {
      setTimeout(() => {
        if (handlers.onStatus) {
          handlers.onStatus(true);
        }
      }, 100);
    }
    
    this.setGlobalHandlers();
  }
  
  /**
   * Set handlers for a specific subscription
   */
  setHandlersForSubscription(
    exchange: string, 
    symbol: string, 
    interval: TimeInterval, 
    handlers: WebSocketHandlers
  ): void {
    const key = `${exchange}:${symbol}:${interval}`;
    this.handlersBySubscription.set(key, handlers);
  }

  /**
   * Send ping to keep connection alive
   */
  private sendPing(): void {
    console.log('SocketService: Sending ping to server');
    this.send({ type: 'ping' });
  }
  
  /**
   * Start the ping interval to keep connection alive
   */
  private startPingInterval(): void {
    if (this.mockMode || !this.ws) return;
    
    // Clear any existing ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // Set up ping interval
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendPing();
      }
    }, this.pingIntervalMs);
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.mockMode) {
      console.log('SocketService: Mock mode - Simulating WebSocket connection');
      this.connected = true;
      if (this.handlers.onStatus) {
        this.handlers.onStatus(true);
      }
      
      // Resubscribe to all active subscriptions in mock mode
      this.subscriptions.forEach((subscription) => {
        this.startMockUpdates(
          subscription.exchange, 
          subscription.symbol, 
          subscription.interval
        );
      });
      
      return;
    }
    
    // Skip if already connected or connecting
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('SocketService: Already connected, skipping duplicate connect call');
      return;
    }
    
    if (this.connectingInProgress) {
      console.log('SocketService: Connection attempt already in progress, skipping duplicate connect call');
      return;
    }
    
    // Check for circuit breaker
    if (this.circuitOpen) {
      console.log('SocketService: Circuit breaker is open, using mock mode');
      this.switchToMockMode();
      return;
    }
    
    // If the server was previously unreachable, use mock mode
    if (this.serverConnectionFailed) {
      console.log('SocketService: Server previously unreachable, using mock mode');
      this.switchToMockMode();
      return;
    }
    
    if (this.ws) {
      const readyState = this.ws.readyState;
      
      if (readyState === WebSocket.OPEN) {
        console.log('SocketService: WebSocket already open, skipping connection');
        return;
      }
      
      if (readyState === WebSocket.CONNECTING) {
        console.log('SocketService: WebSocket already connecting, waiting...');
        return;
      }
      
      // Clean up existing socket
      console.log(`SocketService: Cleaning up existing WebSocket in state ${readyState}`);
      try {
        this.ws.close();
      } catch {
        // Ignore errors during close
      }
      this.ws = null;
    }

    console.log(`SocketService: Connecting to WebSocket server at ${this.serverUrl}`);
    this.connectingInProgress = true;
    
    try {
      // Clear any existing connection timeout
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      
      // Create a new WebSocket
      console.log(`SocketService: Creating new WebSocket instance for ${this.serverUrl}`);
      this.ws = new WebSocket(this.serverUrl);
      
      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        console.log('SocketService: Connection timeout reached');
        if (this.ws) {
          this.ws.close();
        }
        this.connectingInProgress = false;
        this.notifyError({
          type: 'Connection timeout',
          message: 'WebSocket connection timeout reached'
        });
        
        // Try to reconnect if below max attempts
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        } else {
          // Switch to mock mode if max attempts reached
          this.switchToMockMode();
        }
      }, this.connectionAttemptTimeout);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error('SocketService: Error creating WebSocket:', error);
      this.clearConnectionTimeout();
      this.connectingInProgress = false;
      this.notifyError({
        type: 'WebSocket creation error',
        message: 'Error creating WebSocket connection',
        error
      });
      
      // Switch to mock mode on error
      this.switchToMockMode();
    }
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {
    console.log('SocketService: WebSocket connection established');
    
    // Clear connection timeout
    this.clearConnectionTimeout();
    
    this.connected = true;
    this.reconnectAttempts = 0;
    this.connectingInProgress = false;
    this.consecutiveFailures = 0; // Reset failure counter on success
    
    // Start ping interval
    this.startPingInterval();
    
    // Send status request
    this.send({ type: 'status_request' });
    console.log('SocketService: Sent status request message');
    
    // Notify status handlers
    if (this.handlers.onStatus) {
      this.handlers.onStatus(true);
    }
    
    // Resubscribe to all subscriptions
    this.resubscribe();
  }

  /**
   * Handle WebSocket message event
   */
  private handleMessage(event: MessageEvent): void {
    try {
      // Handle ping-pong messages directly
      if (event.data === 'pong' || event.data === '{"type":"pong"}') {
        console.log('SocketService: Received pong from server');
        return;
      }
      
      console.log('SocketService: Received message:', 
        typeof event.data === 'string' 
          ? event.data.length > 100 
            ? event.data.slice(0, 100) + '...' 
            : event.data
          : '[binary data]'
      );
      
      const message = JSON.parse(event.data) as WebSocketMessage;
      
      switch (message.type) {
        case 'update':
          this.handleUpdateMessage(message);
          break;
        
        case 'status':
          console.log(`SocketService: Received status update - connected: ${message.connected}`);
          this.handlers.onStatus?.(message.connected);
          break;
        
        case 'error':
          console.error('SocketService: WebSocket error from server:', message.message);
          this.handlers.onError?.(message.message);
          break;
        
        case 'subscribed':
          console.log(`SocketService: Subscribed to ${message.exchange} ${message.symbol} ${message.interval}`);
          this.handlers.onSubscribed?.(message.exchange, message.symbol, message.interval);
          
          // Remove from pending subscriptions
          const subKey = `${message.exchange}:${message.symbol}:${message.interval}`;
          this.pendingSubscriptions.delete(subKey);
          break;
        
        case 'unsubscribed':
          const unsubKey = `${message.exchange}:${message.symbol}:${message.interval}`;
          console.log(`SocketService: Unsubscribed from ${unsubKey}`);
          
          this.subscriptions.delete(unsubKey);
          this.handlers.onUnsubscribed?.(message.exchange, message.symbol, message.interval);
          break;
          
        case 'pong':
          console.log('SocketService: Received pong from server');
          break;
          
        case 'heartbeat':
          console.log('SocketService: Received heartbeat from server');
          break;
      }
    } catch (error) {
      console.error('SocketService: Error processing WebSocket message:', error);
      console.error('SocketService: Raw message data:', 
        typeof event.data === 'string' 
          ? event.data.slice(0, 200) 
          : '[binary data]'
      );
      
      this.notifyError({
        type: 'Message processing error',
        message: error instanceof Error ? error.message : 'Unknown error processing message'
      });
    }
  }
  
  /**
   * Handle update messages separately to keep code organized
   */
  private handleUpdateMessage(message: UpdateMessage): void {
    if (!message.exchange || !message.symbol) return;
    
    // Find matching subscription and interval
    let matchingInterval: TimeInterval = '1m';
    
    // Use Array.from to avoid ESLint warnings about unused variables
    const subscriptionValues = Array.from(this.subscriptions.values());
    for (const sub of subscriptionValues) {
      if (sub.exchange === message.exchange && sub.symbol === message.symbol) {
        matchingInterval = sub.interval;
        break;
      }
    }
    
    const key = `${message.exchange}:${message.symbol}:${matchingInterval}`;
    
    // Mark this as real data and cancel mock updates for this symbol
    this.notifyRealDataReceived(message.exchange, message.symbol, matchingInterval);
    
    // Normalize the candle data
    const normalizedCandle = this.normalizeCandle(message.data, matchingInterval);
    
    // Store this as the last candle for the symbol
    this.lastCandleBySymbol.set(key, {
      ...normalizedCandle,
      source: 'real'
    });
    
    // Add source information
    const extendedCandle: ExtendedCandle = {
      ...normalizedCandle,
      source: 'real'
    };
    
    // Check for subscription-specific handlers first
    const specificHandlers = this.handlersBySubscription.get(key);
    
    if (specificHandlers?.onUpdate) {
      specificHandlers.onUpdate(message.exchange, message.symbol, extendedCandle);
    } 
    // Fall back to global handlers
    else if (this.handlers.onUpdate) {
      this.handlers.onUpdate(message.exchange, message.symbol, extendedCandle);
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    // Clear connection timeout
    this.clearConnectionTimeout();
    console.log('SocketService: Clearing connection timeout on close');
    
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Get closure reason
    const explanation = this.getCloseEventReason(event.code);
    
    console.log('SocketService: WebSocket connection closed:', {
      code: event.code,
      explanation,
      reason: event.reason || 'No reason provided',
      wasClean: event.wasClean
    });
    
    this.connected = false;
    this.connectingInProgress = false;
    
    // Notify status handlers
    if (this.handlers.onStatus) {
      this.handlers.onStatus(false);
    }
    
    // Handle abnormal closures
    if (!event.wasClean || event.code !== 1000) {
      this.consecutiveFailures++;
      console.log(`SocketService: Abnormal closure detected. Consecutive failures: ${this.consecutiveFailures}`);
      
      // If we haven't reached the maximum number of reconnect attempts, try to reconnect
      if (this.consecutiveFailures >= this.MAX_FAILURES_BEFORE_CIRCUIT_OPEN) {
        console.log('SocketService: Maximum reconnection attempts reached');
        this.circuitOpen = true;
        
        // Set timeout to reset circuit breaker
        if (this.circuitResetTimeout) {
          clearTimeout(this.circuitResetTimeout);
        }
        
        this.circuitResetTimeout = setTimeout(() => {
          console.log('SocketService: Resetting circuit breaker');
          this.circuitOpen = false;
          this.consecutiveFailures = 0;
          
          // Try connecting again after reset
          this.connect();
        }, this.CIRCUIT_RESET_TIMEOUT);
        
        // Switch to mock mode
        this.switchToMockMode();
      } else {
        // Attempt to reconnect
        this.attemptReconnect();
      }
    } else {
      // Reset reconnect attempts on clean closure
      this.reconnectAttempts = 0;
    }
    
    // Clean up
    this.ws = null;
  }

/**
 * Handle WebSocket error event
 */
private handleError(event: Event): void {
  // Log detailed error information without exposing sensitive data
  console.warn('SocketService: WebSocket error occurred', {
    type: 'WebSocket error',
    message: 'Connection error or the server rejected the connection',
    url: this.serverUrl,
    readyState: this.ws ? this.ws.readyState : 'null',
    eventType: event.type
  });
  
  // Log the raw event for debugging (may be empty in some browsers)
  console.warn('Raw WebSocket error event:', event);
  
  // Clear connection timeout
  this.clearConnectionTimeout();
  
  // Increment failure counter
  this.consecutiveFailures++;
  
  // Notify error handler with better details
  this.notifyError({
    type: 'WebSocket error',
    message: 'Connection error or the server rejected the connection',
  });
  
  // If we're still in the CONNECTING state, the connection hasn't been established
  // This likely indicates a network issue or server rejection
  if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
    console.warn('SocketService: Error occurred while connecting, will handle in close event');
    
    // The WebSocket will fire a close event after the error
    // We'll let the close handler manage reconnection logic
    
    // If the connection is stalled, force closure after a short delay
    setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        console.warn('SocketService: Connection still in CONNECTING state after error, forcing close');
        try {
          // Force the socket to close
          this.ws.close();
          // Clean up event handlers to prevent memory leaks
          this.ws.onopen = null;
          this.ws.onclose = null;
          this.ws.onerror = null;
          this.ws.onmessage = null;
        } catch (_err) {
          // Ignore errors during forced close
        }
        
        // Reset state
        this.ws = null;
        this.connectingInProgress = false;
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        } else {
          this.switchToMockMode();
        }
      }
    }, 1000); // 1 second delay
  }
  
  // If we're in the OPEN state, the error occurred during communication
  // This is unusual but could happen with network disruptions
  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    console.warn('SocketService: Error occurred with open connection, attempting to reconnect');
    try {
      this.ws.close();
    } catch (_err) {
      // Ignore errors during close
    }
  }
}

  /**
   * Get a human-readable explanation for WebSocket close codes
   */
  private getCloseEventReason(code: number): string {
    const reasons: { [key: number]: string } = {
      1000: 'Normal closure',
      1001: 'Going away',
      1002: 'Protocol error',
      1003: 'Unsupported data',
      1004: 'Reserved',
      1005: 'No status received',
      1006: 'Abnormal closure',
      1007: 'Invalid frame payload data',
      1008: 'Policy violation',
      1009: 'Message too big',
      1010: 'Mandatory extension',
      1011: 'Internal server error',
      1012: 'Service restart',
      1013: 'Try again later',
      1014: 'Bad gateway',
      1015: 'TLS handshake'
    };
    
    return reasons[code] || 'Unknown close reason';
  }

  /**
   * Clear connection timeout
   */
  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      console.log('SocketService: Clearing connection timeout during disconnect');
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  /**
   * Switch to mock mode
   */
  private switchToMockMode(): void {
    if (this.mockMode) return; // Already in mock mode
    
    console.log('SocketService: Switching to mock mode due to connection issues');
    this.mockMode = true;
    
    // Call status handler to indicate mock connection
    if (this.handlers.onStatus) {
      setTimeout(() => {
        if (this.handlers.onStatus) {
          this.handlers.onStatus(true);
        }
      }, 100);
    }
    
    // Start mock updates for all active subscriptions
    this.subscriptions.forEach((subscription) => {
      this.startMockUpdates(
        subscription.exchange, 
        subscription.symbol, 
        subscription.interval
      );
    });
  }

  /**
   * Attempt to reconnect to the WebSocket server
   */
  private attemptReconnect(): void {
    // Skip if already in mock mode
    if (this.mockMode) return;
    
    // Skip if already connecting
    if (this.connectingInProgress) {
      console.log('SocketService: Reconnection attempt skipped - connection attempt already in progress');
      return;
    }
    
    // Check if circuit breaker is open
    if (this.circuitOpen) {
      console.log('SocketService: Circuit breaker is open, using mock mode');
      this.switchToMockMode();
      return;
    }
    
    // Check reconnect attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('SocketService: Maximum reconnection attempts reached, switching to mock mode');
      this.switchToMockMode();
      return;
    }
    
    this.reconnectAttempts++;
    
    // Calculate delay with exponential backoff
    const backoffDelayMs = Math.min(
      this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1),
      30000 // Max 30 second delay
    );
    
    console.log(`SocketService: Attempting to reconnect in ${Math.round(backoffDelayMs / 1000)} seconds (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      // Only attempt connection if still disconnected and not already connecting
      if (!this.connected && !this.connectingInProgress) {
        this.connect();
      } else {
        console.log('SocketService: Skipping reconnection attempt - already connected or connecting');
      }
    }, backoffDelayMs);
  }

  /**
 * Normalize candle data to ensure consistent format
 */
private normalizeCandle(candle: Candle, interval: TimeInterval): Candle {
  // Log raw candle occasionally for debugging
  if (Date.now() - this.lastDebugLog > this.debugThrottle) {
    this.lastDebugLog = Date.now();
    console.log(`SocketService: Raw candle time before normalization:`, {
      time: candle.time,
      date: new Date(candle.time > 10000000000 ? candle.time : candle.time * 1000).toISOString(),
      interval
    });
  }

  // Inline implementation of ensureSeconds to avoid dependency issues
  const ensureSeconds = (time: number): number => {
    return time > 10000000000 ? Math.floor(time / 1000) : time;
  };
  
  // Inline implementation of getIntervalInSeconds
  const getIntervalInSeconds = (interval: TimeInterval): number => {
    switch (interval) {
      case '1m': return 60;
      case '5m': return 300;
      case '15m': return 900;
      case '30m': return 1800;
      case '1h': return 3600;
      case '4h': return 14400;
      case '1d': return 86400;
      default: return 60; // Default to 1 minute
    }
  };
  
  // Inline implementation of alignToIntervalBoundary
  const alignToIntervalBoundary = (time: number, interval: TimeInterval): number => {
    const timeInSeconds = ensureSeconds(time);
    const intervalSeconds = getIntervalInSeconds(interval);
    
    // For intervals larger than 1 hour, align to hour boundaries first
    if (intervalSeconds >= 3600) {
      const hourAlignedTime = Math.floor(timeInSeconds / 3600) * 3600;
      
      const intervalsPerDay = 86400 / intervalSeconds;
      const hourOfDay = new Date(hourAlignedTime * 1000).getUTCHours();
      const intervalNumber = Math.floor(hourOfDay / (24 / intervalsPerDay));
      
      return Math.floor(hourAlignedTime / 86400) * 86400 + intervalNumber * intervalSeconds;
    }
    
    // For smaller intervals, simply align to the interval boundary
    return Math.floor(timeInSeconds / intervalSeconds) * intervalSeconds;
  };

  // Convert timestamp to seconds and align it
  const timeInSeconds = ensureSeconds(candle.time);
  const alignedTime = alignToIntervalBoundary(timeInSeconds, interval);
  
  // Return a new candle with the aligned timestamp
  return {
    ...candle,
    time: alignedTime
  };
}

  /**
   * Send a message to the WebSocket server
   */
  public send(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('SocketService: WebSocket not connected, cannot send message:', message);
      return;
    }
    
    try {
      const serialized = JSON.stringify(message);
      this.ws.send(serialized);
    } catch (error) {
      console.error('SocketService: Error sending message:', error, message);
      this.notifyError({
        type: 'Send error',
        message: 'Error sending message to WebSocket server',
        error
      });
    }
  }

  /**
   * Resubscribe to all active subscriptions
   */
  private resubscribe(): void {
    if (this.mockMode) return;
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('SocketService: Cannot resubscribe - WebSocket not open');
      return;
    }

    const subscriptionCount = this.subscriptions.size;
    console.log(`SocketService: Resubscribing to ${subscriptionCount} streams`);
    
    if (subscriptionCount === 0) {
      console.log('SocketService: No active subscriptions to resubscribe');
      return;
    }
    
    // Resubscribe to all active subscriptions with a small delay between each
    let delayMs = 0;
    
    this.subscriptions.forEach((subscription) => {
      setTimeout(() => {
        try {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.send(subscription);
            console.log(`SocketService: Sent resubscription for ${subscription.exchange}:${subscription.symbol}:${subscription.interval}`);
          } else {
            console.warn('SocketService: WebSocket not open during resubscribe');
          }
        } catch (error) {
          console.error(`SocketService: Error resubscribing:`, error);
        }
      }, delayMs);
      
      // Stagger subscriptions for better reliability
      delayMs += 200;
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    // Clear connection timeout if it exists
    this.clearConnectionTimeout();
    
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Clear circuit breaker timeout
    if (this.circuitResetTimeout) {
      clearTimeout(this.circuitResetTimeout);
      this.circuitResetTimeout = null;
    }
    
    // Clear all mock intervals
    this.mockUpdateIntervals.forEach(interval => clearInterval(interval));
    this.mockUpdateIntervals.clear();
    
    // Don't disconnect if already in mock mode
    if (this.mockMode) {
      console.log('SocketService: Mock mode - Simulating WebSocket disconnection');
      this.connected = false;
      
      if (this.handlers.onStatus) {
        this.handlers.onStatus(false);
      }
      return;
    }
    
    // Check if there's a connection to disconnect
    if (!this.ws) {
      console.log('SocketService: No WebSocket connection to disconnect from');
      return;
    }
    
    // Store current state for logging
    const readyState = this.ws.readyState;
    
    // Only close if not already closing or closed
    if (readyState !== WebSocket.CLOSING && readyState !== WebSocket.CLOSED) {
      try {
        console.log(`SocketService: Closing WebSocket connection (current state: ${readyState})`);
        this.ws.close(1000, 'Disconnected by client');
      } catch (error) {
        console.warn('SocketService: Error closing WebSocket:', error);
      }
    } else {
      console.log(`SocketService: WebSocket already closing or closed (state: ${readyState}), skipping close call`);
    }
    
    // Clean up resources
    this.ws = null;
    this.connected = false;
    this.connectingInProgress = false;
    
    console.log('SocketService: WebSocket disconnected');
  }
  
  /**
   * Subscribe to a market data stream
   */
  subscribe(exchange: string, symbol: string, interval: TimeInterval, stream: string = 'kline', handlers?: WebSocketHandlers): void {
    const key = `${exchange}:${symbol}:${interval}`;
    const message: SubscribeMessage = {
      type: 'subscribe',
      exchange,
      symbol,
      interval,
      stream
    };
    
    console.log(`SocketService: Subscribing to ${key}`);
    
    // Store subscription
    this.subscriptions.set(key, message);
    
    // Store handlers for this subscription if provided
    if (handlers) {
      this.setHandlersForSubscription(exchange, symbol, interval, handlers);
    }
    
    // Initialize data source tracker if not exists
    if (!this.dataSourceTracker.has(key)) {
      this.dataSourceTracker.set(key, {
        hasRealData: false,
        lastRealUpdateTime: 0,
        initialDataReceived: false
      });
    }
    
    // Check if circuit breaker is open
    if (this.circuitOpen) {
      console.log(`SocketService: Circuit breaker is open, using mock mode for ${key}`);
      this.startMockUpdates(exchange, symbol, interval);
      return;
    }
    
    if (this.mockMode) {
      console.log(`SocketService: Mock mode - Simulating subscription to ${exchange} ${symbol} (${interval})`);
      
      // Simulate successful subscription
      if (this.handlers.onSubscribed) {
        setTimeout(() => {
          if (this.handlers.onSubscribed) {
            this.handlers.onSubscribed(exchange, symbol, interval);
          }
        }, 100);
      }
      
      // Start sending mock updates
      this.startMockUpdates(exchange, symbol, interval);
      return;
    }
    
    // Add to pending subscriptions
    this.pendingSubscriptions.add(key);
    
    // If not connected, connect first
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(`SocketService: WebSocket not open, connecting first before subscribing to ${key}`);
      
      // Auto-connect if not connected or connecting
      if (!this.connectingInProgress) {
        this.connect();
      } else {
        console.log(`SocketService: Connection already in progress, subscription will be handled once connected`);
      }
      
      // Start mock updates as a fallback if connection has previously failed
      if (this.serverConnectionFailed) {
        console.log(`SocketService: Server connection issues detected, starting mock updates for ${key}`);
        this.startMockUpdates(exchange, symbol, interval);
      }
      
      return;
    }

    // Send to server
    try {
      console.log(`SocketService: Sending subscription message to server for ${key}`);
      this.send(message);
      
      // Add a fallback - if no confirmation received within 5 seconds, start mock updates
      setTimeout(() => {
        // Only start mock if this subscription is still pending
        if (this.pendingSubscriptions.has(key)) {
          console.log(`SocketService: No subscription confirmation received for ${key} after 5s, starting mock updates as fallback`);
          this.startMockUpdates(exchange, symbol, interval);
        }
      }, 5000);
    } catch (error) {
      console.error(`SocketService: Error sending subscription:`, error);
      
      // Fallback to mock mode for this subscription
      this.startMockUpdates(exchange, symbol, interval);
    }
  }

  /**
   * Unsubscribe from a market data stream
   */
  unsubscribe(exchange: string, symbol: string, interval: TimeInterval, stream: string = 'kline'): void {
    const key = `${exchange}:${symbol}:${interval}`;
    
    console.log(`SocketService: Unsubscribing from ${key}`);
    
    // Remove from subscriptions
    this.subscriptions.delete(key);
    this.handlersBySubscription.delete(key);
    this.dataSourceTracker.delete(key);
    this.lastCandleBySymbol.delete(key);
    this.pendingSubscriptions.delete(key);
    
    // Clean up any mock updates
    const mockIntervalKey = `${exchange}:${symbol}:${interval}`;
    if (this.mockUpdateIntervals.has(mockIntervalKey)) {
      clearInterval(this.mockUpdateIntervals.get(mockIntervalKey)!);
      this.mockUpdateIntervals.delete(mockIntervalKey);
    }
    
    if (this.mockMode) {
      console.log(`SocketService: Mock mode - Simulating unsubscription from ${exchange} ${symbol} (${interval})`);
      
      // Simulate successful unsubscription
      if (this.handlers.onUnsubscribed) {
        setTimeout(() => {
          if (this.handlers.onUnsubscribed) {
            this.handlers.onUnsubscribed(exchange, symbol, interval);
          }
        }, 100);
      }
      
      return;
    }
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(`SocketService: WebSocket not open, can't send unsubscribe message for ${key}`);
      return;
    }

    // Send unsubscription message
    const message: UnsubscribeMessage = {
      type: 'unsubscribe',
      exchange,
      symbol,
      interval,
      stream
    };
    
    // Send to server
    try {
      console.log(`SocketService: Sending unsubscription message to server for ${key}`);
      this.send(message);
    } catch (error) {
      console.error(`SocketService: Error sending unsubscription:`, error);
    }
  }
  
  /**
   * Check if we should use mock data for a symbol
   */
  private shouldUseMockData(exchange: string, symbol: string, interval: TimeInterval): boolean {
    // If forceRealDataOnly is true, never use mock data
    if (this.forceRealDataOnly) {
      return false;
    }
    
    // Always use mock data in mock mode
    if (this.mockMode) {
      return true;
    }
    
    // Check if circuit breaker is open
    if (this.circuitOpen) {
      return true;
    }
    
    const key = `${exchange}:${symbol}:${interval}`;
    const tracker = this.dataSourceTracker.get(key);
    
    // If no tracker, assume we should use mock
    if (!tracker) {
      return true;
    }
    
    // Check if real data is stale or non-existent
    const timeSinceRealUpdate = Date.now() - (tracker.lastRealUpdateTime || 0);
    const realDataIsFresh = tracker.hasRealData && timeSinceRealUpdate < this.mockFallbackDelay;
    
    if (!realDataIsFresh) {
      console.log(`SocketService: Using mock data for ${key} - ${
        tracker.hasRealData 
          ? `real data is stale (${Math.round(timeSinceRealUpdate/1000)}s old)` 
          : 'no real data received yet'
      }`);
    }
    
    return !realDataIsFresh;
  }
  
  /**
   * Start sending mock updates for a subscription
   */
  private startMockUpdates(exchange: string, symbol: string, interval: TimeInterval): void {
    const key = `${exchange}:${symbol}:${interval}`;
    console.log(`SocketService: Starting mock updates for ${key}`);
    
    // Get handlers for this subscription
    const handlers = this.handlersBySubscription.get(key) || this.handlers;
    
    // Only send mock updates if we have an onUpdate handler
    if (!handlers.onUpdate) {
      console.warn(`SocketService: No onUpdate handler for ${key}, skipping mock updates`);
      return;
    }
    
    // Check if we already have real data for this symbol
    if (!this.shouldUseMockData(exchange, symbol, interval)) {
      console.log(`SocketService: Skipping mock updates for ${key} - real data already available`);
      return;
    }
    
    // Get interval in seconds
    const intervalSeconds = TimestampUtils.getIntervalInSeconds(interval);
    
    // Generate a mock candle
    const generateMockCandle = (): ExtendedCandle | null => {
      // Skip if we should no longer use mock data
      if (!this.shouldUseMockData(exchange, symbol, interval)) {
        console.log(`SocketService: Skipping mock update for ${key} - real data preferred`);
        
        // Stop the mock update interval
        const updateIntervalKey = `${exchange}:${symbol}:${interval}`;
        if (this.mockUpdateIntervals.has(updateIntervalKey)) {
          clearInterval(this.mockUpdateIntervals.get(updateIntervalKey)!);
          this.mockUpdateIntervals.delete(updateIntervalKey);
          console.log(`SocketService: Stopped mock updates for ${key} due to real data`);
        }
        
        return null;
      }
      
      // Calculate current time and align it to the interval boundary
      const now = Math.floor(Date.now() / 1000);
      const alignedTime = TimestampUtils.alignToIntervalBoundary(now, interval);
      
      // Use last candle as base if available to ensure continuity
      const lastCandle = this.lastCandleBySymbol.get(key);
      
      // Determine base price based on last candle or symbol
      let basePrice = 0;
      
      if (lastCandle) {
        // Use last candle's close as the new base price for continuity
        basePrice = lastCandle.close;
      } else if (symbol.includes('BTC')) {
        basePrice = 65000; // Fixed BTC price for consistency
      } else if (symbol.includes('ETH')) {
        basePrice = 3500;
      } else if (symbol.includes('SOL')) {
        basePrice = 150;
      } else if (symbol.includes('BNB')) {
        basePrice = 450;
      } else {
        basePrice = 100; // Default
      }
      
      // Small random movement to keep price realistic
      const volatilityFactor = intervalSeconds <= 300 ? 0.001 : // 1m and 5m
                              intervalSeconds <= 1800 ? 0.002 : // 15m and 30m
                              intervalSeconds <= 3600 ? 0.003 : // 1h
                              0.005; // 4h and 1d
      
      const randomFactor = (Math.random() - 0.5) * volatilityFactor;
      const priceWithMovement = basePrice * (1 + randomFactor);
      
      // Calculate candle values
      const open = priceWithMovement;
      const close = priceWithMovement * (1 + (Math.random() - 0.5) * (volatilityFactor / 2));
      const high = Math.max(open, close) * (1 + Math.random() * (volatilityFactor / 5));
      const low = Math.min(open, close) * (1 - Math.random() * (volatilityFactor / 5));
      const volume = Math.random() * 100 + 10;
      
      // Only log occasionally to avoid flooding console
      if (Date.now() - this.lastDebugLog > this.debugThrottle) {
        this.lastDebugLog = Date.now();
        console.log(`SocketService: Generated mock candle for ${key} at time ${alignedTime}`);
      }
      
      // Store as last candle for continuity
      const mockCandle: ExtendedCandle = {
        time: alignedTime,
        open,
        high,
        low,
        close,
        volume,
        isMock: true,
        source: 'mock'
      };
      this.lastCandleBySymbol.set(key, mockCandle);
      
      return mockCandle;
    };
    
    // Calculate update interval based on the interval setting
    const updateIntervalMs = 
      interval === '1m' ? 3000 : // Update every 3 seconds for 1m
      interval === '5m' ? 10000 : // Update every 10 seconds for 5m
      interval === '15m' ? 20000 : // Update every 20 seconds for 15m
      interval === '30m' ? 30000 : // Update every 30 seconds for 30m
      interval === '1h' ? 60000 : // Update every minute for 1h
      interval === '4h' ? 120000 : // Update every 2 minutes for 4h
      interval === '1d' ? 300000 : // Update every 5 minutes for 1d
      3000; // Default to 3 seconds for fast updates
    
    // Send initial update immediately for better UX
    setTimeout(() => {
      if (handlers.onUpdate) {
        // Generate candle
        const mockCandle = generateMockCandle();
        
        // Only send update if we have a candle
        if (mockCandle) {
          try {
            console.log(`SocketService: Sending initial mock update for ${key}`);
            handlers.onUpdate(exchange, symbol, mockCandle);
          } catch (error) {
            console.error(`SocketService: Error in initial onUpdate handler for ${key}:`, error);
          }
        }
      }
    }, 100);
    
    // Set up interval for mock updates
    const updateIntervalKey = `${exchange}:${symbol}:${interval}`;
    
    // Clear any existing interval
    if (this.mockUpdateIntervals.has(updateIntervalKey)) {
      clearInterval(this.mockUpdateIntervals.get(updateIntervalKey)!);
    }
    
    // Create new interval
    const intervalId = setInterval(() => {
      // Check if we're still subscribed
      if (!this.subscriptions.has(key)) {
        clearInterval(intervalId);
        this.mockUpdateIntervals.delete(updateIntervalKey);
        console.log(`SocketService: Stopping mock updates for ${key} - unsubscribed`);
        return;
      }
      
      // Get the current handlers (they might have changed)
      const currentHandlers = this.handlersBySubscription.get(key) || this.handlers;
      
      // Send mock update if we have a handler
      if (currentHandlers.onUpdate) {
        // Generate candle
        const mockCandle = generateMockCandle();
        
        // Only send update if we have a candle
        if (mockCandle) {
          try {
            currentHandlers.onUpdate(exchange, symbol, mockCandle);
          } catch (error) {
            console.error(`SocketService: Error in onUpdate handler for ${key}:`, error);
          }
        }
      }
    }, updateIntervalMs);
    
    // Store the interval ID
    this.mockUpdateIntervals.set(updateIntervalKey, intervalId);
    console.log(`SocketService: Mock updates started for ${key} - interval ${updateIntervalMs}ms`);
  }
}

// Create singleton instance
const socketService = new SocketService();
export default socketService;