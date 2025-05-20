// src/components/ChartController.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import TimeframeSelector from './controls/TimeframeSelector';
import AssetSearch from './controls/AssetSearch';
import ConnectionStatus from './controls/ConnectionStatus';
import ErrorDisplay from './controls/ErrorDisplay';
import ExchangeSelector from './controls/ExchangeSelector';
import MiniChartPanel from './chart/MiniChartPanel';
import SymbolSidebar from '../components/sidebar/SymbolSidebar';
import ChartPanelGroup from './chart/ChartPanelGroup';
import dataManagerImport, { dataManager } from '../services/dataManager';
import socketService from '../services/socketService';
import apiService from '../services/apiService';
// Commented out to fix ESLint warning since it's only used in specific functions via dynamic imports
// import aggregatorService from '../services/exchanges/aggregator';
import type { ChartData as ImportedChartData } from '../types/market';

// Ensure we have a valid dataManager instance
const dataManagerInstance = dataManager || dataManagerImport;

// Internal utility function for timestamp handling to avoid dependency issues
const internalEnsureSeconds = (time: number): number => {
  return time > 10000000000 ? Math.floor(time / 1000) : time;
};

// Define a simple error type
interface Error {
  message: string;
  severity?: 'info' | 'warning' | 'error';
  timestamp?: number;
}

// Create a simple error handler hook
function useSimpleErrorHandler() {
  const [errors, setErrors] = useState<Error[]>([]);
  
  const addError = useCallback((message: string, severity: 'info' | 'warning' | 'error' = 'error') => {
    setErrors(prev => [...prev, { 
      message, 
      severity,
      timestamp: Date.now() 
    }]);
    
    // Also log to console
    if (severity === 'error') {
      console.error(message);
    } else if (severity === 'warning') {
      console.warn(message);
    } else {
      console.info(message);
    }
  }, []);
  
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);
  
  return { errors, addError, clearErrors };
}

type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
type Exchange = 'Binance' | 'OKX' | 'Bybit' | 'MEXC';

interface ChartControllerProps {
  initialSymbol?: string;
  initialInterval?: TimeInterval;
  initialExchange?: Exchange;
}

// Define interface for candles
interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Use a type guard to check if a candle has source/isMock properties
interface ExtendedCandle extends Candle {
  source?: 'real' | 'mock' | 'historical' | 'unknown';
  isMock?: boolean;
}

// Type guard function to safely check for extended properties
function hasSourceProperty(candle: Candle): candle is ExtendedCandle {
  return 'source' in candle;
}

function hasMockProperty(candle: Candle): candle is ExtendedCandle {
  return 'isMock' in candle;
}

// Define interface for delta volume
interface DeltaVolume {
  time: number;
  value: number;
  color: string;
}

// Define interface for open interest
interface OpenInterest {
  time: number;
  openInterest: number;
}

// Define our local ChartData interface matching what our component expects
interface ChartData {
  spotCandles: Candle[];
  deltaVolume: DeltaVolume[];
  openInterest: OpenInterest[];
  futuresCandles: Candle[];
  isAggregated: boolean;
}

// Utility function to convert imported ChartData to our local ChartData
function convertChartData(data: ImportedChartData): ChartData {
  return {
    spotCandles: data.spotCandles,
    deltaVolume: data.deltaVolume || [],
    openInterest: data.openInterest || [],
    futuresCandles: data.futuresCandles || [],
    isAggregated: !!data.isAggregated // Convert undefined/boolean to boolean
  };
}

const ChartController: React.FC<ChartControllerProps> = ({
  initialSymbol = 'BTCUSDT',
  initialInterval = '1m',
  initialExchange = 'Binance'
}) => {
  // State to check if dataManager is ready
  const [isDataManagerReady, setIsDataManagerReady] = useState(false);
  
  // Basic chart and control state
  const [symbol, setSymbol] = useState(initialSymbol);
  const [interval, setInterval] = useState<TimeInterval>(initialInterval);
  const [exchange, setExchange] = useState<Exchange>(initialExchange);
  const [isLoading, setIsLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  
  // Chart data state
  const [chartData, setChartData] = useState<ChartData | null>(null);
  
  // Aggregation state
  const [deltaAggregationEnabled, setDeltaAggregationEnabled] = useState(false);
  

  // Sidebar visibility (new states)
  const [showSymbolSidebar, setShowSymbolSidebar] = useState(true);
  const [showExchangePanels, setShowExchangePanels] = useState(true);
  
  // Define exchange panels for the right sidebar
  const exchangePanels = [
    { name: 'Binance Spot', id: 'binance-spot', color: '#f06292' },
    { name: 'Coinbase', id: 'coinbase', color: '#64b5f6' },
    { name: 'Bitfinex Spot', id: 'bitfinex-spot', color: '#f06292' },
    { name: 'Bybit Spot', id: 'bybit-spot', color: '#f06292' },
    { name: 'OKEx Spot', id: 'okex-spot', color: '#ce93d8' },
    { name: 'Binance Perps', id: 'binance-perps', color: '#4fc3f7' },
    { name: 'Bybit Perps', id: 'bybit-perps', color: '#4fc3f7' },
  ];
  
  // Refs for tracking previous values and data loading state
  const isLoadingRef = useRef<boolean>(true);
  const prevParamsRef = useRef({ exchange, symbol, interval });
  const dataInitializingRef = useRef<boolean>(false);
  const initialDataLoadedRef = useRef<boolean>(false);
  
  // Stats tracking
  const [chartStats, setChartStats] = useState({
    realCount: 0,
    mockCount: 0,
    histCount: 0,
    totalCount: 0,
    timespan: 0
  });
  
  // Using our simple error handler
  const { errors, addError, clearErrors } = useSimpleErrorHandler();

  // Effect to check and set dataManager readiness
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('ChartController dataManager check:', {
        defaultImport: typeof dataManagerImport,
        namedImport: typeof dataManager,
        instance: typeof dataManagerInstance,
        hasRegisterMethod: dataManagerInstance && typeof dataManagerInstance.registerUpdateHandler === 'function'
      });
    }
    
    // Set dataManager ready status based on actual instance availability
    if (dataManagerInstance && typeof dataManagerInstance.registerUpdateHandler === 'function') {
      setIsDataManagerReady(true);
      console.log('dataManager is properly initialized');
    } else {
      // Try again after a short delay
      const timer = setTimeout(() => {
        if (dataManagerInstance && typeof dataManagerInstance.registerUpdateHandler === 'function') {
          setIsDataManagerReady(true);
        } else {
          console.error('DataManager still not available after delay');
        }
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, []);

  // Effect to handle WebSocket connection status
  useEffect(() => {
    // Set up socket service handlers
    socketService.setHandlers({
      onStatus: (connected) => {
        // Fixed: Ensure we're passing a boolean, not undefined
        setWsConnected(connected === true);
        
        if (connected) {
          addError("WebSocket connected", "info");
        } else {
          addError("WebSocket disconnected - attempting to reconnect automatically", "warning");
          addError("Using historical data while reconnecting...", "info");
        }
      },
      onError: (message) => {
        // Only show error message but don't treat it as critical
        // as the reconnection will happen automatically
        addError(`WebSocket error: ${message}`, "warning");
      }
    });
    
    // Connect to socket service
    socketService.connect();
    
    // Cleanup
    return () => {
      // Only disconnect if we're connected
      if (socketService.isConnected()) {
        socketService.disconnect();
      }
    };
  }, [addError]);
  
  // Function to calculate chart statistics and set them
  const calculateChartStats = useCallback((candles: Candle[]) => {
    if (!candles || candles.length === 0) {
      setChartStats({
        realCount: 0,
        mockCount: 0,
        histCount: 0,
        totalCount: 0,
        timespan: 0
      });
      return;
    }
    
    // Count candles by source
    let realCount = 0;
    let mockCount = 0;
    let histCount = 0;
    
    candles.forEach(candle => {
      if (hasSourceProperty(candle)) {
        if (candle.source === 'real') realCount++;
        else if (candle.source === 'mock' || hasMockProperty(candle) && candle.isMock) mockCount++;
        else if (candle.source === 'historical' && !(hasMockProperty(candle) && candle.isMock)) histCount++;
      }
    });
    
    // Calculate timespan in hours - using internal ensureSeconds
    const firstTime = internalEnsureSeconds(candles[0].time);
    const lastTime = internalEnsureSeconds(candles[candles.length - 1].time);
    const timespan = (lastTime - firstTime) / 3600;
    
    setChartStats({
      realCount,
      mockCount,
      histCount,
      totalCount: candles.length,
      timespan
    });
  }, []);
  
  // Function to get appropriate data limit based on interval
  const getIntervalLimit = useCallback((timeInterval: TimeInterval): number => {
    const baseLimit = 100;
    
    // Increase limit for larger intervals to maintain sufficient data points
    switch (timeInterval) {
      case '1m': return baseLimit;
      case '5m': return baseLimit * 2;
      case '15m': return baseLimit * 3;
      case '30m': return baseLimit * 4;
      case '1h': return baseLimit * 6;
      case '4h': return baseLimit * 12;
      case '1d': return baseLimit * 24;
      default: return baseLimit;
    }
  }, []);
  
  // Update data when socket receives updates - with enhanced debugging
  const updateData = useCallback(() => {
    try {
      // Skip updates if loading or initializing
      if (isLoadingRef.current || dataInitializingRef.current) {
        return;
      }
      
      // Skip if params have changed
      if (
        exchange !== prevParamsRef.current.exchange ||
        symbol !== prevParamsRef.current.symbol ||
        interval !== prevParamsRef.current.interval
      ) {
        return;
      }
      
      if (!dataManagerInstance) {
        console.error('dataManagerInstance is not available in updateData');
        return;
      }
      
      const data = dataManagerInstance.getData(exchange, symbol, interval);
      if (data) {
        // Add detailed logging for updates
        console.log('Update received:', {
          exchange,
          symbol,
          interval,
          candleCount: data.spotCandles.length,
          lastCandle: data.spotCandles.length > 0 ? data.spotCandles[data.spotCandles.length - 1] : null
        });
        
        // Deep clone the data to ensure React detects changes in nested arrays
        const newData = {
          ...data,
          spotCandles: [...data.spotCandles],
          deltaVolume: [...(data.deltaVolume || [])],
          openInterest: [...(data.openInterest || [])],
          futuresCandles: [...(data.futuresCandles || [])]
        };
        
        // Convert the imported ChartData to our local ChartData format
        console.log('Setting new chart data with candles:', newData.spotCandles.length);
        setChartData(convertChartData(newData));
        
        // Calculate stats
        calculateChartStats(newData.spotCandles);
        
        // Force a small delay before next update to ensure render completes
        setTimeout(() => {
          isLoadingRef.current = false;
        }, 50);
      }
    } catch (error) {
      console.error('Error in updateData:', error);
    }
  }, [exchange, symbol, interval, calculateChartStats]);
  
  // Register update handler only when dataManager is ready
  useEffect(() => {
    if (!isDataManagerReady || !dataManagerInstance) return;
    
    try {
      // Safely register the update handler
      console.log(`Registering update handler for ${exchange}:${symbol}:${interval}`);
      dataManagerInstance.registerUpdateHandler(exchange, symbol, interval, updateData);
      
      // Explicitly trigger socket subscription for this pair
      socketService.subscribe(exchange, symbol, interval);
      
      // Cleanup
      return () => {
        try {
          if (dataManagerInstance) {
            console.log(`Unregistering update handler for ${exchange}:${symbol}:${interval}`);
            dataManagerInstance.unregisterUpdateHandler(exchange, symbol, interval, updateData);
            
            // Also explicitly unsubscribe from socket
            socketService.unsubscribe(exchange, symbol, interval);
          }
        } catch (error) {
          console.error('Error unregistering update handler:', error);
        }
      };
    } catch (error) {
      console.error('Error registering update handler:', error);
      addError(`Failed to register data updates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [exchange, symbol, interval, updateData, isDataManagerReady, addError]);

  // Explicitly fetch historical data for initial load
  const fetchInitialHistoricalData = useCallback(async () => {
    if (!isDataManagerReady || initialDataLoadedRef.current) return;
    
    try {
      setIsLoading(true);
      console.log(`Explicitly fetching historical data for ${exchange}:${symbol}:${interval}`);
      
      // Fetch historical data directly through the API
      const historicalData = await apiService.getHistoricalCandles(
        exchange, 
        symbol, 
        interval, 
        getIntervalLimit(interval) * 2 // Double the limit to ensure enough data
      );
      
      console.log(`Received ${historicalData.length} historical candles for ${symbol}`);
      
      // If we got data, create a simple chart data structure directly
      if (historicalData.length > 0) {
        // Create temporary chart data if DataManager doesn't have it yet
        const tempChartData: ChartData = {
          spotCandles: historicalData,
          deltaVolume: [], // Will be calculated later
          openInterest: [],
          futuresCandles: [],
          isAggregated: false
        };
        
        // Calculate delta volume data
        const deltaVolume = historicalData.map(candle => {
          const delta = candle.close - candle.open;
          return {
            time: candle.time,
            value: Math.abs(delta * candle.volume) / 100,
            color: delta >= 0 ? '#00E676' : '#FF5252' // Updated to Figma colors
          };
        });
        
        tempChartData.deltaVolume = deltaVolume;
        
        // Set this temporary data to show something while DataManager initializes
        setChartData(tempChartData);
        calculateChartStats(historicalData);
        
        // Mark that we've loaded initial data
        initialDataLoadedRef.current = true;
        
        addError(`Loaded ${historicalData.length} historical candles while waiting for real-time data`, 'info');
      }
    } catch (error) {
      console.error('Failed to fetch initial historical data:', error);
      addError(`Error loading historical data: ${error instanceof Error ? error.message : 'Unknown error'}`, 'warning');
    } finally {
      setIsLoading(false);
    }
  }, [addError, calculateChartStats, exchange, getIntervalLimit, interval, isDataManagerReady, symbol]);

  // Run the initial historical data fetch
  useEffect(() => {
    if (isDataManagerReady && !initialDataLoadedRef.current) {
      fetchInitialHistoricalData();
    }
  }, [fetchInitialHistoricalData, isDataManagerReady]);
  
  // Load data function
  const loadData = useCallback(async () => {
    if (!isDataManagerReady || !dataManagerInstance) return;
    
    try {
      // Set loading state
      setIsLoading(true);
      isLoadingRef.current = true;
      dataInitializingRef.current = true;
      clearErrors();
      
      console.log(`Loading data for ${exchange} ${symbol} ${interval}`);
      
      // Store current params for comparison
      prevParamsRef.current = { exchange, symbol, interval };
      
      // Calculate appropriate limit based on interval
      const limit = getIntervalLimit(interval);
      
      // Initialize data from data manager
      const data = await dataManagerInstance.initialize(exchange, symbol, interval, limit);
      
      // Log data received to debug
      console.log('Data received from initialize:', {
        exchange,
        symbol,
        interval,
        candlesReceived: data.spotCandles.length
      });
      
      // Only update if params haven't changed during loading and we have data
      if (
        exchange === prevParamsRef.current.exchange &&
        symbol === prevParamsRef.current.symbol &&
        interval === prevParamsRef.current.interval
      ) {
        if (data.spotCandles && data.spotCandles.length > 0) {
          // Update state with data, converting to our local format
          setChartData(convertChartData(data));
          
          // Calculate chart statistics
          calculateChartStats(data.spotCandles);

          // Mark that initial data has been loaded
          initialDataLoadedRef.current = true;
          
          // Add informational message about data
          addError(`Successfully loaded ${data.spotCandles.length} candles for ${symbol}`, 'info');
        } else {
          // Handle empty data case explicitly - try to load historical data directly
          addError(`No data available from DataManager, fetching historical data...`, 'warning');
          await fetchInitialHistoricalData();
        }
      } else {
        console.log('Params changed during loading, discarding results');
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      addError(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Try to fetch initial data as a fallback
      fetchInitialHistoricalData();
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
      dataInitializingRef.current = false;
    }
  }, [exchange, symbol, interval, isDataManagerReady, clearErrors, addError, getIntervalLimit, calculateChartStats, fetchInitialHistoricalData]);
  
  /**
   * Handle symbol selection with proper cleanup
   */
  const handleSymbolSelect = useCallback((newSymbol: string) => {
    // Only proceed if symbol actually changed
    if (symbol === newSymbol) return;
    
    console.log("Symbol selected:", newSymbol);
    
    // Clean up resources for current symbol before switching
    if (dataManagerInstance && isDataManagerReady) {
      try {
        dataManagerInstance.cleanup(exchange, symbol, interval);
        
        // Also explicitly unsubscribe from socket
        socketService.unsubscribe(exchange, symbol, interval);
      } catch (error) {
        console.error('Error cleaning up previous symbol data:', error);
      }
    }
    
    // Reset initial data loaded flag
    initialDataLoadedRef.current = false;
    
    // Update symbol
    setSymbol(newSymbol);
    setIsLoading(true);
    clearErrors();
  }, [symbol, exchange, interval, isDataManagerReady, clearErrors]);
  
  /**
   * Handle interval change with proper cleanup
   * IMPROVED: Better handling for interval changes to maintain proper candle count
   */
  const handleIntervalChange = useCallback((newInterval: TimeInterval) => {
    // Only proceed if interval actually changed
    if (interval === newInterval) return;
    
    console.log(`Changing interval from ${interval} to ${newInterval}`);
    
    // Clean up resources for current interval before switching
    if (dataManagerInstance && isDataManagerReady) {
      try {
        dataManagerInstance.cleanup(exchange, symbol, interval);
        
        // Also explicitly unsubscribe from socket
        socketService.unsubscribe(exchange, symbol, interval);
      } catch (error) {
        console.error('Error cleaning up previous interval data:', error);
      }
    }
    
    // Reset initial data loaded flag
    initialDataLoadedRef.current = false;
    
    // Update interval
    setInterval(newInterval);
    setIsLoading(true);
    clearErrors();
  }, [interval, exchange, symbol, isDataManagerReady, clearErrors]);
  
  /**
   * Handle exchange change with proper cleanup
   */
  const handleExchangeChange = useCallback((newExchange: Exchange) => {
    // Only proceed if exchange actually changed
    if (exchange === newExchange) return;
    
    console.log("Exchange selected:", newExchange);
    
    // Clean up resources for current exchange before switching
    if (dataManagerInstance && isDataManagerReady) {
      try {
        dataManagerInstance.cleanup(exchange, symbol, interval);
        
        // Also explicitly unsubscribe from socket
        socketService.unsubscribe(exchange, symbol, interval);
      } catch (error) {
        console.error('Error cleaning up previous exchange data:', error);
      }
    }
    
    // Reset initial data loaded flag
    initialDataLoadedRef.current = false;
    
    // Update exchange
    setExchange(newExchange);
    setIsLoading(true);
    clearErrors();
  }, [exchange, symbol, interval, isDataManagerReady, clearErrors]);
  
  
  // Function to check if a symbol is eligible for delta aggregation
  const isSymbolEligibleForAggregation = useCallback((symbol: string): boolean => {
    // List of base currencies that are eligible for delta aggregation
    const eligibleBaseCurrencies = [
      'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 
      'AAVE', 'UNI', 'LINK', 'DOT', 'ADA',
      'AVAX', 'MATIC', 'DOGE', 'SHIB'
    ];
    
    // Handle OKX format with hyphen (BTC-USDT)
    if (symbol.includes('-')) {
      const [base] = symbol.split('-');
      return eligibleBaseCurrencies.some(currency => 
        currency.toUpperCase() === base.toUpperCase()
      );
    }
    
    // For standard formats like BTCUSDT, first try direct matching with known currencies
    for (const currency of eligibleBaseCurrencies) {
      if (symbol.toUpperCase().startsWith(currency.toUpperCase())) {
        return true;
      }
    }
    
    // If direct matching fails, try regex extraction
    const baseRegex = /^([A-Z0-9]{3,})/;
    const match = symbol.match(baseRegex);
    
    if (!match) {
      return false;
    }
    
    const baseCurrency = match[1];
    
    // Check against eligible currencies
    return eligibleBaseCurrencies.some(currency => 
      currency.toUpperCase() === baseCurrency.toUpperCase()
    );
  }, []);

  // Toggle delta aggregation
  const toggleDeltaAggregation = useCallback(async () => {
    try {
      console.log("Delta button clicked!");
      const newState = !deltaAggregationEnabled;
      setDeltaAggregationEnabled(newState);
      console.log(`Delta aggregation ${newState ? 'enabled' : 'disabled'}`);
      
      // Extract base currency from symbol
      let baseCurrency = '';
      
      // Handle OKX format (BTC-USDT)
      if (symbol.includes('-')) {
        const [base] = symbol.split('-');
        baseCurrency = base;
      } else {
        // For standard formats like BTCUSDT
        const eligibleBaseCurrencies = [
          'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 
          'AAVE', 'UNI', 'LINK', 'DOT', 'ADA',
          'AVAX', 'MATIC', 'DOGE', 'SHIB'
        ];
        
        // Try to match with known currencies first - using case insensitive matching
        const matchedCurrency = eligibleBaseCurrencies.find(currency => 
          symbol.toUpperCase().startsWith(currency.toUpperCase())
        );
        
        if (matchedCurrency) {
          baseCurrency = matchedCurrency;
        } else {
          // Fallback to regex extraction
          const baseRegex = /^([A-Z0-9]{3,})/;
          const match = symbol.match(baseRegex);
          baseCurrency = match ? match[1] : 'BTC'; // Default to BTC if extraction fails
        }
      }
      
      console.log(`Extracted base currency: ${baseCurrency} from symbol: ${symbol}`);
      
      // Set loading state to true to inform user something is happening
      setIsLoading(true);
      
      // Reset chart data to show loading UI
      setChartData(null);
      
      // Load the aggregator service directly to avoid async issues with dynamic import
      const aggregatorService = await import('../services/exchanges/aggregator').then(m => m.default);
      
      // Also directly import deltaAggregation service to ensure consistent configuration
      const deltaAggregationService = await import('../services/exchanges/deltaAggregation').then(m => m.default);
      
      // Configure both services to ensure consistent configuration
      const config = {
        enabled: newState,
        baseCurrency: baseCurrency,
        quoteCurrencies: ['USDT', 'USDC', 'USD'],
        exchanges: [exchange] // Explicitly include current exchange
      };
      
      aggregatorService.setDeltaAggregationConfig(config);
      deltaAggregationService.setConfig(config);
      
      console.log(`Set delta aggregation config: enabled=${newState}, baseCurrency=${baseCurrency}, exchange=${exchange}`);
      
      // Add informational message about what's happening
      addError(`${newState ? 'Enabling' : 'Disabling'} delta aggregation for ${baseCurrency} pairs...`, 'info');
      
      // Reset historical data loaded flag to trigger reload
      initialDataLoadedRef.current = false;
      clearErrors();
      
      // Clean up previous data and subscriptions
      if (dataManagerInstance && isDataManagerReady) {
        // Clean up current resources first
        dataManagerInstance.cleanup(exchange, symbol, interval);
        
        // Also explicitly unsubscribe from socket
        socketService.unsubscribe(exchange, symbol, interval);
        
        // Create a small delay to ensure cleanup completes
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          // Reinitialize data with new delta aggregation setting
          const data = await dataManagerInstance.initialize(exchange, symbol, interval, getIntervalLimit(interval), newState);
          
          console.log(`Data reinitialized with delta aggregation ${newState ? 'enabled' : 'disabled'}`);
          console.log(`Aggregated data status: isAggregated=${data.isAggregated}, candles: ${data.spotCandles.length}`);
          
          if (data.spotCandles && data.spotCandles.length > 0) {
            // Update chart data with the new data including delta aggregation
            const newData = {
              ...data,
              spotCandles: [...data.spotCandles],
              deltaVolume: [...(data.deltaVolume || [])],
              openInterest: [...(data.openInterest || [])],
              futuresCandles: [...(data.futuresCandles || [])]
            };
            
            // Set the chart data with our new delta-aggregated data
            setChartData(convertChartData(newData));
            
            // Calculate statistics for the new data
            calculateChartStats(newData.spotCandles);
            
            // Add success message
            addError(`Delta aggregation ${newState ? 'enabled' : 'disabled'} successfully`, 'info');
          } else {
            // Handle empty data case - try one more approach before giving up
            addError(`No data available with standard approach, trying alternative method...`, 'info');
            
            // Try to get data directly from the aggregator service as a fallback
            try {
              // For the direct attempt, focus exclusively on the current symbol's base currency
              const directConfig = {
                enabled: newState,
                baseCurrency: baseCurrency,
                quoteCurrencies: ['USDT', 'USDC', 'USD'],
                exchanges: [exchange]
              };
              
              // Set the config on both services
              aggregatorService.setDeltaAggregationConfig(directConfig);
              deltaAggregationService.setConfig(directConfig);
              
              // Fetch data for this specific base currency directly
              const exchangeService = aggregatorService.getExchangeByName(exchange as Exchange);
              if (exchangeService) {
                // Get regular data first
                const regularData = await exchangeService.getCandles(symbol, interval, getIntervalLimit(interval));
                
                // Try to process it through delta aggregation
                if (regularData.length > 0) {
                  const directChartData = {
                    spotCandles: regularData,
                    deltaVolume: [],
                    openInterest: [],
                    futuresCandles: [],
                    isAggregated: false
                  };
                  
                  // Process the data with delta aggregation
                  const processedData = await deltaAggregationService.processChartData(
                    directChartData,
                    exchangeService,
                    symbol,
                    interval,
                    getIntervalLimit(interval)
                  );
                  
                  if (processedData.spotCandles.length > 0) {
                    // Update the UI with the processed data
                    setChartData(convertChartData(processedData));
                    calculateChartStats(processedData.spotCandles);
                    addError(`Delta aggregation ${newState ? 'enabled' : 'disabled'} with alternative method`, 'info');
                    
                    // Successfully applied alternative method
                    return;
                  }
                }
              }
              
              // If we get here, both methods failed, revert and show warning
              throw new Error("Could not get data with either method");
            } catch (alternativeError) {
              console.error('Alternative delta aggregation method also failed:', alternativeError);
              
              // All attempts failed, revert to original state
              addError(`No data available with delta aggregation ${newState ? 'enabled' : 'disabled'}`, 'warning');
              
              // Revert to original state if we got no data
              setDeltaAggregationEnabled(!newState);
              aggregatorService.setDeltaAggregationConfig({
                enabled: !newState,
                baseCurrency: baseCurrency,
                quoteCurrencies: ['USDT', 'USDC', 'USD']
              });
              
              // Try to load regular data again
              loadData();
            }
          }
        } catch (error) {
          console.error('Error reinitializing with delta aggregation:', error);
          addError(`Failed to apply delta aggregation: ${error instanceof Error ? error.message : 'Unknown error'}`, 'warning');
          
          // Revert to original state on error
          setDeltaAggregationEnabled(!newState);
          
          // Update configuration back to original state
          aggregatorService.setDeltaAggregationConfig({
            enabled: !newState,
            baseCurrency: baseCurrency,
            quoteCurrencies: ['USDT', 'USDC', 'USD']
          });
          
          // Try to load regular data again
          loadData();
        } finally {
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error('Error toggling delta aggregation:', error);
      addError('Failed to toggle delta aggregation. Please try again.', 'error');
      setIsLoading(false);
      
      // Revert the state if we encounter an error - fixed to use current state
      setDeltaAggregationEnabled(deltaAggregationEnabled); // Keep original state instead of referring to newState
    }
  }, [deltaAggregationEnabled, symbol, exchange, interval, isDataManagerReady, clearErrors, addError, getIntervalLimit, calculateChartStats, loadData]);
  
  // Load data when component mounts or params change
  useEffect(() => {
    if (!isDataManagerReady || !dataManagerInstance) return;
    
    const paramsChanged = 
      exchange !== prevParamsRef.current.exchange ||
      symbol !== prevParamsRef.current.symbol ||
      interval !== prevParamsRef.current.interval;
    
    if (paramsChanged) {
      // Reset initial data loaded flag
      initialDataLoadedRef.current = false;
      
      // Cleanup previous subscription if param changed
      const prevParams = prevParamsRef.current;
      if (isDataManagerReady && dataManagerInstance) {
        try {
          dataManagerInstance.unregisterUpdateHandler(
            prevParams.exchange, 
            prevParams.symbol, 
            prevParams.interval, 
            updateData
          );
          
          // Also explicitly unsubscribe from socket
          socketService.unsubscribe(
            prevParams.exchange, 
            prevParams.symbol, 
            prevParams.interval
          );
        } catch (error) {
          console.error('Error unregistering update handler during param change:', error);
        }
      }
      
      // Load new data
      loadData();
    } else if (!chartData && !isLoading) {
      // Initial load
      loadData();
    }
  }, [exchange, symbol, interval, loadData, updateData, chartData, isLoading, isDataManagerReady]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isDataManagerReady && dataManagerInstance) {
        try {
          dataManagerInstance.cleanup(exchange, symbol);
          
          // Also explicitly unsubscribe from socket
          socketService.unsubscribe(exchange, symbol, interval);
        } catch (error) {
          console.error('Error cleaning up dataManager on unmount:', error);
        }
      }
    };
  }, [exchange, symbol, interval, isDataManagerReady]);
  
  
  // Get the base currency from the symbol for display (used in the UI)
  const getBaseCurrency = (symbol: string): string => {
    // Handle OKX format (BTC-USDT)
    if (symbol.includes('-')) {
      const [base] = symbol.split('-');
      return base;
    }
    
    // For standard formats like BTCUSDT
    const eligibleBaseCurrencies = [
      'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 
      'AAVE', 'UNI', 'LINK', 'DOT', 'ADA',
      'AVAX', 'MATIC', 'DOGE', 'SHIB'
    ];
    
    // Try to match with known currencies first
    const matchedCurrency = eligibleBaseCurrencies.find(currency => 
      symbol.toUpperCase().startsWith(currency.toUpperCase())
    );
    
    if (matchedCurrency) {
      return matchedCurrency;
    }
    
    // Fallback to regex extraction
    const baseRegex = /^([A-Z0-9]{3,})/;
    const match = symbol.match(baseRegex);
    return match ? match[1] : 'BTC'; // Default to BTC if extraction fails
  };
  
  // This variable is used directly in the JSX now, so it's no longer unused
  const isAggregationEligible = isSymbolEligibleForAggregation(symbol);
  const isAggregated = chartData?.isAggregated || false;
  
  // If dataManager is not ready yet, show loading state
  if (!isDataManagerReady) {
    return (
      <div className="bg-[#131722] border border-[#2a2e39] rounded-lg overflow-hidden shadow-lg p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mr-3"></div>
          <p className="text-white text-xl">Loading chart components...</p>
        </div>
      </div>
    );
  }
  
  // Extract candles and other data from chartData
  const candles = chartData?.spotCandles || [];
  const deltaVolume = chartData?.deltaVolume || [];
  const openInterest = chartData?.openInterest || [];
  
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#131722]">
      {/* Top navigation bar */}
      <div className="bg-[#131722] border-b border-[#2a2e39] py-2 px-4 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <span className="text-xl font-bold text-white">Insiderdepth</span>
          <nav className="hidden md:flex space-x-6">
            <a href="#" className="text-white text-sm border-b-2 border-white pb-1">Bitcoin chart</a>
            <a href="#" className="text-[#afb5c4] hover:text-white text-sm">Ethereum chart</a>
            <a href="#" className="text-[#afb5c4] hover:text-white text-sm">My list</a>
            <a href="#" className="text-[#afb5c4] hover:text-white text-sm">Education</a>
            <a href="#" className="text-[#afb5c4] hover:text-white text-sm">Resources</a>
          </nav>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search alts"
              className="bg-[#1e222d] text-white text-sm px-4 py-1.5 rounded-md w-56 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <svg className="w-4 h-4 text-[#afb5c4] absolute right-3 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          <div>
            <svg className="w-5 h-5 text-[#afb5c4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          
          <button className="px-4 py-1.5 border border-[#2a2e39] text-white rounded-md text-sm hover:bg-[#1e222d]">
            Register
          </button>
          
          <button className="px-4 py-1.5 bg-[#1e222d] text-white rounded-md text-sm hover:bg-[#262b3c]">
            Log in
          </button>
        </div>
      </div>
      
      {/* Main content area with 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Symbol list */}
        {showSymbolSidebar && (
          <div className="w-64 border-r border-[#2a2e39] overflow-hidden">
            <SymbolSidebar onSymbolSelect={handleSymbolSelect} />
          </div>
        )}
        
        {/* Main content - Chart area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chart controls */}
          <div className="border-b border-[#2a2e39] p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
              <div className="w-full md:w-auto max-w-md">
                <AssetSearch onSelect={handleSymbolSelect} currentExchange={exchange} />
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <TimeframeSelector 
                  currentInterval={interval} 
                  onIntervalChange={handleIntervalChange}
                  showDeltaButton={isAggregationEligible}
                  deltaEnabled={deltaAggregationEnabled}
                  onDeltaToggle={toggleDeltaAggregation}
                />                
                <button 
                  className="bg-[#1c2030] text-[#afb5c4] px-3 py-1.5 rounded-md text-sm"
                  onClick={() => {}}
                >
                  Set alert
                </button>
                
                <div className="flex ml-2">
                  <button 
                    className="p-1.5 text-[#afb5c4] hover:text-white"
                    onClick={() => setShowSymbolSidebar(!showSymbolSidebar)}
                    title={showSymbolSidebar ? "Hide symbol sidebar" : "Show symbol sidebar"}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                  </button>
                  
                  <button 
                    className="p-1.5 text-[#afb5c4] hover:text-white"
                    onClick={() => setShowExchangePanels(!showExchangePanels)}
                    title={showExchangePanels ? "Hide exchange panels" : "Show exchange panels"}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="mt-3">
              <ExchangeSelector 
                currentExchange={exchange} 
                onExchangeChange={handleExchangeChange} 
              />
            </div>
          </div>
          
          {/* Error Display */}
          <ErrorDisplay errors={errors} />
          
          {/* Chart area */}
          <div className="flex-1 relative overflow-hidden">
            {/* BTC label */}
            <div className="absolute top-4 left-4 z-10">
              <span className="text-2xl font-bold text-white">{getBaseCurrency(symbol)}</span>
              {isAggregated && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-blue-900 text-blue-200 rounded-full">
                  Aggregated Delta
                </span>
              )}
            </div>
            
            {/* Connection status */}
            <div className="absolute top-4 right-4 z-10">
              <ConnectionStatus isLoading={isLoading} isConnected={wsConnected} />
            </div>
            
            {/* Chart display */}
<div className="h-full overflow-y-auto">
  {candles.length > 0 ? (
    (() => {
      // Process data for the three different delta chart types
      // Use original data for spot
      const spotDeltaData = [...deltaVolume];
      
      // Create perps data with blue for positive values
      const perpsDeltaData = deltaVolume.map(item => ({
        ...item,
        color: item.color.includes('red') || (item.color.toLowerCase().includes('ff') && !item.color.toLowerCase().includes('00ff')) 
          ? '#FF3A5C' // Red for negative
          : '#00A3FF'  // Blue for positive
      }));
      
      // For CVD, create cumulative data
      let sum = 0;
      const cvdDeltaData = deltaVolume.map(item => {
        const isNegative = item.color.includes('red') || (item.color.toLowerCase().includes('ff') && !item.color.toLowerCase().includes('00ff'));
        const multiplier = isNegative ? -1 : 1;
        sum += item.value * multiplier;
        return {
          time: item.time,
          value: sum,
          color: sum >= 0 ? '#7E57C2' : '#673AB7' // Purple colors for CVD
        };
      });
      
      return (
        <ChartPanelGroup 
  candles={candles} 
  openInterestData={openInterest} 
  deltaData={deltaVolume} 
  interval={interval} 
  isAggregated={isAggregated} 
  showOpenInterest={true}
/>
      );
    })()
  ) : (
    <div className="flex justify-center items-center h-full bg-[#131722] border border-dashed border-[#2a2e39] rounded mx-4 my-6">
      <div className="text-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-[#afb5c4] text-lg">Loading chart data...</p>
        <p className="text-[#6b7280] text-sm mt-2">Please wait while we retrieve the latest market information</p>
      </div>
    </div>
  )}
</div>
</div>
          
{/* Bottom info bar */}
<div className="border-t border-[#2a2e39] p-2 flex justify-between items-center text-xs text-[#9fa9bc]">
  <div className="flex items-center space-x-4">
    <div>Trades/m <span className="text-white">790</span></div>
    <div>Volume/m <span className="text-white">458.2K</span></div>
    <div>Liquidations/m <span className="text-white">58.2K</span></div>
  </div>
  <div>
    <span>Interval: {interval} • Candles: {chartStats.totalCount} • Timespan: {chartStats.timespan.toFixed(1)}h</span>
  </div>
</div>
</div>
        
{/* Right sidebar - Exchange panels */}
{showExchangePanels && (
  <div className="w-72 border-l border-[#2a2e39] overflow-y-auto">
    {exchangePanels.map((panel) => (
      <MiniChartPanel
        key={panel.id}
        exchangeName={panel.name}
        symbol={symbol}
        color={panel.color}
        height={120}
      />
    ))}
  </div>
)}
</div>
</div>
  );
};

export default ChartController;