// src/components/ChartController.tsx

import React, { useState, useEffect, useCallback, useRef } from "react";
import TimeframeSelector from "./controls/TimeframeSelector";
import AssetSearch from "./controls/AssetSearch";
import ConnectionStatus from "./controls/ConnectionStatus";
import ErrorDisplay from "./controls/ErrorDisplay";
import ExchangeSelector from "./controls/ExchangeSelector";
import MiniChartPanel from "./chart/MiniChartPanel";
import SymbolSidebar from "./sidebar/SymbolSidebar";
import ChartPanelGroup from "./chart/ChartPanelGroup";
import dataManagerImport, { dataManager } from "../services/dataManager";
import socketService from "../services/socketService";
import apiService from "../services/apiService";
// Commented out to fix ESLint warning since it's only used in specific functions via dynamic imports
// import aggregatorService from '../services/exchanges/aggregator';
import type { ChartData as ImportedChartData } from "../types/market";
import Link from "next/link";
import Header from "./Layout/Header";

// Ensure we have a valid dataManager instance
const dataManagerInstance = dataManager || dataManagerImport;

// Internal utility function for timestamp handling to avoid dependency issues
const internalEnsureSeconds = (time: number): number => {
  return time > 10000000000 ? Math.floor(time / 1000) : time;
};

// Define a simple error type
interface Error {
  message: string;
  severity?: "info" | "warning" | "error";
  timestamp?: number;
}

// Create a simple error handler hook
function useSimpleErrorHandler() {
  const [errors, setErrors] = useState<Error[]>([]);

  const addError = useCallback(
    (message: string, severity: "info" | "warning" | "error" = "error") => {
      setErrors((prev) => [
        ...prev,
        {
          message,
          severity,
          timestamp: Date.now(),
        },
      ]);

      // Also log to console
      if (severity === "error") {
        console.error(message);
      } else if (severity === "warning") {
        console.warn(message);
      } else {
        console.info(message);
      }
    },
    []
  );

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return { errors, addError, clearErrors };
}

type TimeInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
type Exchange = "Binance" | "OKX" | "Bybit" | "MEXC";

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
  source?: "real" | "mock" | "historical" | "unknown";
  isMock?: boolean;
}

// Type guard function to safely check for extended properties
function hasSourceProperty(candle: Candle): candle is ExtendedCandle {
  return "source" in candle;
}

function hasMockProperty(candle: Candle): candle is ExtendedCandle {
  return "isMock" in candle;
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
    isAggregated: !!data.isAggregated, // Convert undefined/boolean to boolean
  };
}

const ChartController: React.FC<ChartControllerProps> = ({
  initialSymbol = "BTCUSDT",
  initialInterval = "1m",
  initialExchange = "Binance",
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
    { name: "Binance Spot", id: "binance-spot", color: "#f06292" },
    { name: "Coinbase", id: "coinbase", color: "#64b5f6" },
    { name: "Bitfinex Spot", id: "bitfinex-spot", color: "#f06292" },
    { name: "Bybit Spot", id: "bybit-spot", color: "#f06292" },
    { name: "OKEx Spot", id: "okex-spot", color: "#ce93d8" },
    { name: "Binance Perps", id: "binance-perps", color: "#4fc3f7" },
    { name: "Bybit Perps", id: "bybit-perps", color: "#4fc3f7" },
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
    timespan: 0,
  });

  // Using our simple error handler
  const { errors, addError, clearErrors } = useSimpleErrorHandler();

  // Effect to check and set dataManager readiness
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("ChartController dataManager check:", {
        defaultImport: typeof dataManagerImport,
        namedImport: typeof dataManager,
        instance: typeof dataManagerInstance,
        hasRegisterMethod:
          dataManagerInstance &&
          typeof dataManagerInstance.registerUpdateHandler === "function",
      });
    }

    // Set dataManager ready status based on actual instance availability
    if (
      dataManagerInstance &&
      typeof dataManagerInstance.registerUpdateHandler === "function"
    ) {
      setIsDataManagerReady(true);
      console.log("dataManager is properly initialized");
    } else {
      // Try again after a short delay
      const timer = setTimeout(() => {
        if (
          dataManagerInstance &&
          typeof dataManagerInstance.registerUpdateHandler === "function"
        ) {
          setIsDataManagerReady(true);
        } else {
          console.error("DataManager still not available after delay");
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
          addError(
            "WebSocket disconnected - attempting to reconnect automatically",
            "warning"
          );
          addError("Using historical data while reconnecting...", "info");
        }
      },
      onError: (message) => {
        // Only show error message but don't treat it as critical
        // as the reconnection will happen automatically
        addError(`WebSocket error: ${message}`, "warning");
      },
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
        timespan: 0,
      });
      return;
    }

    // Count candles by source
    let realCount = 0;
    let mockCount = 0;
    let histCount = 0;

    candles.forEach((candle) => {
      if (hasSourceProperty(candle)) {
        if (candle.source === "real") realCount++;
        else if (
          candle.source === "mock" ||
          (hasMockProperty(candle) && candle.isMock)
        )
          mockCount++;
        else if (
          candle.source === "historical" &&
          !(hasMockProperty(candle) && candle.isMock)
        )
          histCount++;
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
      timespan,
    });
  }, []);

  // Function to get appropriate data limit based on interval
  const getIntervalLimit = useCallback((timeInterval: TimeInterval): number => {
    const baseLimit = 100;

    // Increase limit for larger intervals to maintain sufficient data points
    switch (timeInterval) {
      case "1m":
        return baseLimit;
      case "5m":
        return baseLimit * 2;
      case "15m":
        return baseLimit * 3;
      case "30m":
        return baseLimit * 4;
      case "1h":
        return baseLimit * 6;
      case "4h":
        return baseLimit * 12;
      case "1d":
        return baseLimit * 24;
      default:
        return baseLimit;
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
        console.error("dataManagerInstance is not available in updateData");
        return;
      }

      const data = dataManagerInstance.getData(exchange, symbol, interval);
      if (data) {
        // Add detailed logging for updates
        console.log("Update received:", {
          exchange,
          symbol,
          interval,
          candleCount: data.spotCandles.length,
          lastCandle:
            data.spotCandles.length > 0
              ? data.spotCandles[data.spotCandles.length - 1]
              : null,
        });

        // Deep clone the data to ensure React detects changes in nested arrays
        const newData = {
          ...data,
          spotCandles: [...data.spotCandles],
          deltaVolume: [...(data.deltaVolume || [])],
          openInterest: [...(data.openInterest || [])],
          futuresCandles: [...(data.futuresCandles || [])],
        };

        // Convert the imported ChartData to our local ChartData format
        console.log(
          "Setting new chart data with candles:",
          newData.spotCandles.length
        );
        setChartData(convertChartData(newData));

        // Calculate stats
        calculateChartStats(newData.spotCandles);

        // Force a small delay before next update to ensure render completes
        setTimeout(() => {
          isLoadingRef.current = false;
        }, 50);
      }
    } catch (error) {
      console.error("Error in updateData:", error);
    }
  }, [exchange, symbol, interval, calculateChartStats]);

  // Register update handler only when dataManager is ready
  useEffect(() => {
    if (!isDataManagerReady || !dataManagerInstance) return;

    try {
      // Safely register the update handler
      console.log(
        `Registering update handler for ${exchange}:${symbol}:${interval}`
      );
      dataManagerInstance.registerUpdateHandler(
        exchange,
        symbol,
        interval,
        updateData
      );

      // Explicitly trigger socket subscription for this pair
      socketService.subscribe(exchange, symbol, interval);

      // Cleanup
      return () => {
        try {
          if (dataManagerInstance) {
            console.log(
              `Unregistering update handler for ${exchange}:${symbol}:${interval}`
            );
            dataManagerInstance.unregisterUpdateHandler(
              exchange,
              symbol,
              interval,
              updateData
            );

            // Also explicitly unsubscribe from socket
            socketService.unsubscribe(exchange, symbol, interval);
          }
        } catch (error) {
          console.error("Error unregistering update handler:", error);
        }
      };
    } catch (error) {
      console.error("Error registering update handler:", error);
      addError(
        `Failed to register data updates: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }, [exchange, symbol, interval, updateData, isDataManagerReady, addError]);

  // Explicitly fetch historical data for initial load
  const fetchInitialHistoricalData = useCallback(async () => {
    if (!isDataManagerReady || initialDataLoadedRef.current) return;

    try {
      setIsLoading(true);
      console.log(
        `Explicitly fetching historical data for ${exchange}:${symbol}:${interval}`
      );

      // Fetch historical data directly through the API
      const historicalData = await apiService.getHistoricalCandles(
        exchange,
        symbol,
        interval,
        getIntervalLimit(interval) * 2 // Double the limit to ensure enough data
      );

      console.log(
        `Received ${historicalData.length} historical candles for ${symbol}`
      );

      // If we got data, create a simple chart data structure directly
      if (historicalData.length > 0) {
        // Create temporary chart data if DataManager doesn't have it yet
        const tempChartData: ChartData = {
          spotCandles: historicalData,
          deltaVolume: [], // Will be calculated later
          openInterest: [],
          futuresCandles: [],
          isAggregated: false,
        };

        // Calculate delta volume data
        const deltaVolume = historicalData.map((candle) => {
          const delta = candle.close - candle.open;
          return {
            time: candle.time,
            value: Math.abs(delta * candle.volume) / 100,
            color: delta >= 0 ? "#00E676" : "#FF5252", // Updated to Figma colors
          };
        });

        tempChartData.deltaVolume = deltaVolume;

        // Set this temporary data to show something while DataManager initializes
        setChartData(tempChartData);
        calculateChartStats(historicalData);

        // Mark that we've loaded initial data
        initialDataLoadedRef.current = true;

        addError(
          `Loaded ${historicalData.length} historical candles while waiting for real-time data`,
          "info"
        );
      }
    } catch (error) {
      console.error("Failed to fetch initial historical data:", error);
      addError(
        `Error loading historical data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "warning"
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    addError,
    calculateChartStats,
    exchange,
    getIntervalLimit,
    interval,
    isDataManagerReady,
    symbol,
  ]);

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
      const data = await dataManagerInstance.initialize(
        exchange,
        symbol,
        interval,
        limit
      );

      // Log data received to debug
      console.log("Data received from initialize:", {
        exchange,
        symbol,
        interval,
        candlesReceived: data.spotCandles.length,
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
          addError(
            `Successfully loaded ${data.spotCandles.length} candles for ${symbol}`,
            "info"
          );
        } else {
          // Handle empty data case explicitly - try to load historical data directly
          addError(
            `No data available from DataManager, fetching historical data...`,
            "warning"
          );
          await fetchInitialHistoricalData();
        }
      } else {
        console.log("Params changed during loading, discarding results");
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      addError(
        `Failed to load data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );

      // Try to fetch initial data as a fallback
      fetchInitialHistoricalData();
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
      dataInitializingRef.current = false;
    }
  }, [
    exchange,
    symbol,
    interval,
    isDataManagerReady,
    clearErrors,
    addError,
    getIntervalLimit,
    calculateChartStats,
    fetchInitialHistoricalData,
  ]);

  /**
   * Handle symbol selection with proper cleanup
   */
  const handleSymbolSelect = useCallback(
    (newSymbol: string) => {
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
          console.error("Error cleaning up previous symbol data:", error);
        }
      }

      // Reset initial data loaded flag
      initialDataLoadedRef.current = false;

      // Update symbol
      setSymbol(newSymbol);
      setIsLoading(true);
      clearErrors();
    },
    [symbol, exchange, interval, isDataManagerReady, clearErrors]
  );

  /**
   * Handle interval change with proper cleanup
   * IMPROVED: Better handling for interval changes to maintain proper candle count
   */
  const handleIntervalChange = useCallback(
    (newInterval: TimeInterval) => {
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
          console.error("Error cleaning up previous interval data:", error);
        }
      }

      // Reset initial data loaded flag
      initialDataLoadedRef.current = false;

      // Update interval
      setInterval(newInterval);
      setIsLoading(true);
      clearErrors();
    },
    [interval, exchange, symbol, isDataManagerReady, clearErrors]
  );

  /**
   * Handle exchange change with proper cleanup
   */
  const handleExchangeChange = useCallback(
    (newExchange: Exchange) => {
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
          console.error("Error cleaning up previous exchange data:", error);
        }
      }

      // Reset initial data loaded flag
      initialDataLoadedRef.current = false;

      // Update exchange
      setExchange(newExchange);
      setIsLoading(true);
      clearErrors();
    },
    [exchange, symbol, interval, isDataManagerReady, clearErrors]
  );

  // Function to check if a symbol is eligible for delta aggregation
  const isSymbolEligibleForAggregation = useCallback(
    (symbol: string): boolean => {
      // List of base currencies that are eligible for delta aggregation
      const eligibleBaseCurrencies = [
        "BTC",
        "ETH",
        "SOL",
        "BNB",
        "XRP",
        "AAVE",
        "UNI",
        "LINK",
        "DOT",
        "ADA",
        "AVAX",
        "MATIC",
        "DOGE",
        "SHIB",
      ];

      // Handle OKX format with hyphen (BTC-USDT)
      if (symbol.includes("-")) {
        const [base] = symbol.split("-");
        return eligibleBaseCurrencies.some(
          (currency) => currency.toUpperCase() === base.toUpperCase()
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
      return eligibleBaseCurrencies.some(
        (currency) => currency.toUpperCase() === baseCurrency.toUpperCase()
      );
    },
    []
  );

  // Toggle delta aggregation
  const toggleDeltaAggregation = useCallback(async () => {
    try {
      console.log("Delta button clicked!");
      const newState = !deltaAggregationEnabled;
      setDeltaAggregationEnabled(newState);
      console.log(`Delta aggregation ${newState ? "enabled" : "disabled"}`);

      // Extract base currency from symbol
      let baseCurrency = "";

      // Handle OKX format (BTC-USDT)
      if (symbol.includes("-")) {
        const [base] = symbol.split("-");
        baseCurrency = base;
      } else {
        // For standard formats like BTCUSDT
        const eligibleBaseCurrencies = [
          "BTC",
          "ETH",
          "SOL",
          "BNB",
          "XRP",
          "AAVE",
          "UNI",
          "LINK",
          "DOT",
          "ADA",
          "AVAX",
          "MATIC",
          "DOGE",
          "SHIB",
        ];

        // Try to match with known currencies first - using case insensitive matching
        const matchedCurrency = eligibleBaseCurrencies.find((currency) =>
          symbol.toUpperCase().startsWith(currency.toUpperCase())
        );

        if (matchedCurrency) {
          baseCurrency = matchedCurrency;
        } else {
          // Fallback to regex extraction
          const baseRegex = /^([A-Z0-9]{3,})/;
          const match = symbol.match(baseRegex);
          baseCurrency = match ? match[1] : "BTC"; // Default to BTC if extraction fails
        }
      }

      console.log(
        `Extracted base currency: ${baseCurrency} from symbol: ${symbol}`
      );

      // Set loading state to true to inform user something is happening
      setIsLoading(true);

      // Reset chart data to show loading UI
      setChartData(null);

      // Load the aggregator service directly to avoid async issues with dynamic import
      const aggregatorService = await import(
        "../services/exchanges/aggregator"
      ).then((m) => m.default);

      // Also directly import deltaAggregation service to ensure consistent configuration
      const deltaAggregationService = await import(
        "../services/exchanges/deltaAggregation"
      ).then((m) => m.default);

      // Configure both services to ensure consistent configuration
      const config = {
        enabled: newState,
        baseCurrency: baseCurrency,
        quoteCurrencies: ["USDT", "USDC", "USD"],
        exchanges: [exchange], // Explicitly include current exchange
      };

      aggregatorService.setDeltaAggregationConfig(config);
      deltaAggregationService.setConfig(config);

      console.log(
        `Set delta aggregation config: enabled=${newState}, baseCurrency=${baseCurrency}, exchange=${exchange}`
      );

      // Add informational message about what's happening
      addError(
        `${
          newState ? "Enabling" : "Disabling"
        } delta aggregation for ${baseCurrency} pairs...`,
        "info"
      );

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
        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          // Reinitialize data with new delta aggregation setting
          const data = await dataManagerInstance.initialize(
            exchange,
            symbol,
            interval,
            getIntervalLimit(interval),
            newState
          );

          console.log(
            `Data reinitialized with delta aggregation ${
              newState ? "enabled" : "disabled"
            }`
          );
          console.log(
            `Aggregated data status: isAggregated=${data.isAggregated}, candles: ${data.spotCandles.length}`
          );

          if (data.spotCandles && data.spotCandles.length > 0) {
            // Update chart data with the new data including delta aggregation
            const newData = {
              ...data,
              spotCandles: [...data.spotCandles],
              deltaVolume: [...(data.deltaVolume || [])],
              openInterest: [...(data.openInterest || [])],
              futuresCandles: [...(data.futuresCandles || [])],
            };

            // Set the chart data with our new delta-aggregated data
            setChartData(convertChartData(newData));

            // Calculate statistics for the new data
            calculateChartStats(newData.spotCandles);

            // Add success message
            addError(
              `Delta aggregation ${
                newState ? "enabled" : "disabled"
              } successfully`,
              "info"
            );
          } else {
            // Handle empty data case - try one more approach before giving up
            addError(
              `No data available with standard approach, trying alternative method...`,
              "info"
            );

            // Try to get data directly from the aggregator service as a fallback
            try {
              // For the direct attempt, focus exclusively on the current symbol's base currency
              const directConfig = {
                enabled: newState,
                baseCurrency: baseCurrency,
                quoteCurrencies: ["USDT", "USDC", "USD"],
                exchanges: [exchange],
              };

              // Set the config on both services
              aggregatorService.setDeltaAggregationConfig(directConfig);
              deltaAggregationService.setConfig(directConfig);

              // Fetch data for this specific base currency directly
              const exchangeService = aggregatorService.getExchangeByName(
                exchange as Exchange
              );
              if (exchangeService) {
                // Get regular data first
                const regularData = await exchangeService.getCandles(
                  symbol,
                  interval,
                  getIntervalLimit(interval)
                );

                // Try to process it through delta aggregation
                if (regularData.length > 0) {
                  const directChartData = {
                    spotCandles: regularData,
                    deltaVolume: [],
                    openInterest: [],
                    futuresCandles: [],
                    isAggregated: false,
                  };

                  // Process the data with delta aggregation
                  const processedData =
                    await deltaAggregationService.processChartData(
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
                    addError(
                      `Delta aggregation ${
                        newState ? "enabled" : "disabled"
                      } with alternative method`,
                      "info"
                    );

                    // Successfully applied alternative method
                    return;
                  }
                }
              }

              // If we get here, both methods failed, revert and show warning
              throw new Error("Could not get data with either method");
            } catch (alternativeError) {
              console.error(
                "Alternative delta aggregation method also failed:",
                alternativeError
              );

              // All attempts failed, revert to original state
              addError(
                `No data available with delta aggregation ${
                  newState ? "enabled" : "disabled"
                }`,
                "warning"
              );

              // Revert to original state if we got no data
              setDeltaAggregationEnabled(!newState);
              aggregatorService.setDeltaAggregationConfig({
                enabled: !newState,
                baseCurrency: baseCurrency,
                quoteCurrencies: ["USDT", "USDC", "USD"],
              });

              // Try to load regular data again
              loadData();
            }
          }
        } catch (error) {
          console.error("Error reinitializing with delta aggregation:", error);
          addError(
            `Failed to apply delta aggregation: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            "warning"
          );

          // Revert to original state on error
          setDeltaAggregationEnabled(!newState);

          // Update configuration back to original state
          aggregatorService.setDeltaAggregationConfig({
            enabled: !newState,
            baseCurrency: baseCurrency,
            quoteCurrencies: ["USDT", "USDC", "USD"],
          });

          // Try to load regular data again
          loadData();
        } finally {
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error("Error toggling delta aggregation:", error);
      addError(
        "Failed to toggle delta aggregation. Please try again.",
        "error"
      );
      setIsLoading(false);

      // Revert the state if we encounter an error - fixed to use current state
      setDeltaAggregationEnabled(deltaAggregationEnabled); // Keep original state instead of referring to newState
    }
  }, [
    deltaAggregationEnabled,
    symbol,
    exchange,
    interval,
    isDataManagerReady,
    clearErrors,
    addError,
    getIntervalLimit,
    calculateChartStats,
    loadData,
  ]);

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
          console.error(
            "Error unregistering update handler during param change:",
            error
          );
        }
      }

      // Load new data
      loadData();
    } else if (!chartData && !isLoading) {
      // Initial load
      loadData();
    }
  }, [
    exchange,
    symbol,
    interval,
    loadData,
    updateData,
    chartData,
    isLoading,
    isDataManagerReady,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isDataManagerReady && dataManagerInstance) {
        try {
          dataManagerInstance.cleanup(exchange, symbol);

          // Also explicitly unsubscribe from socket
          socketService.unsubscribe(exchange, symbol, interval);
        } catch (error) {
          console.error("Error cleaning up dataManager on unmount:", error);
        }
      }
    };
  }, [exchange, symbol, interval, isDataManagerReady]);

  // Get the base currency from the symbol for display (used in the UI)
  const getBaseCurrency = (symbol: string): string => {
    // Handle OKX format (BTC-USDT)
    if (symbol.includes("-")) {
      const [base] = symbol.split("-");
      return base;
    }

    // For standard formats like BTCUSDT
    const eligibleBaseCurrencies = [
      "BTC",
      "ETH",
      "SOL",
      "BNB",
      "XRP",
      "AAVE",
      "UNI",
      "LINK",
      "DOT",
      "ADA",
      "AVAX",
      "MATIC",
      "DOGE",
      "SHIB",
    ];

    // Try to match with known currencies first
    const matchedCurrency = eligibleBaseCurrencies.find((currency) =>
      symbol.toUpperCase().startsWith(currency.toUpperCase())
    );

    if (matchedCurrency) {
      return matchedCurrency;
    }

    // Fallback to regex extraction
    const baseRegex = /^([A-Z0-9]{3,})/;
    const match = symbol.match(baseRegex);
    return match ? match[1] : "BTC"; // Default to BTC if extraction fails
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
      <style>
        {`
  .navbar {
    background-color: #161A23;
    border-bottom: 1px solid #2a2e39;
    padding: 12px 24px; /* increased padding */
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: sans-serif;
  }
  .left-group {
    display: flex;
    align-items: center;
    gap: 32px; /* increased gap */
  }
  .logo {
    font-size: 1.5rem; /* bigger font */
    font-weight: 700;
    color: white;
    user-select: none;
    cursor: default;
  }
  .nav-links {
    display: flex;
    gap: 32px; /* increased gap */
  }
  .nav-links a {
    font-size: 1rem; /* bigger font */
    color: #afb5c4;
    text-decoration: none;
    padding-bottom: 6px; /* more padding */
    transition: color 0.3s ease;
    cursor: pointer;
  }
  .nav-links a.active {
    color: white;
    border-bottom: 3px solid white; /* thicker border */
  }
  .nav-links a:hover {
    color: white;
  }
  .right-group {
    display: flex;
    align-items: center;
    gap: 20px; /* increased gap */
  }
  .search-wrapper {
    position: relative;
  }
  .search-input {
    background-color: #1e222d;
    color: white;
    font-size: 1rem; /* bigger font */
    padding: 10px 20px 10px 14px; /* increased padding */
    border-radius: 8px; /* slightly larger radius */
    border: none;
    outline: none;
    width: 280px; /* wider input */
    box-sizing: border-box;
  }
  .search-input:focus {
    outline: none;
    box-shadow: 0 0 0 2px #3b82f6;
  }
  .search-icon {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    stroke: #afb5c4;
    pointer-events: none;
  }
  .bell-icon {
    width: 24px;
    height: 24px;
    stroke: #afb5c4;
    cursor: pointer;
  }
  .btn-register {
    padding: 10px 20px;
    border: 1px solid #2a2e39;
    background-color: transparent;
    color: white;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.3s ease;
  }
  .btn-register:hover {
    background-color: #1e222d;
  }
  .btn-login {
    padding: 10px 20px;
    background-color: #1e222d;
    color: white;
    border-radius: 8px;
    font-size: 1rem;
    border: none;
    cursor: pointer;
    transition: background-color 0.3s ease;
  }
  .btn-login:hover {
    background-color: #262b3c;
  }

  /* Responsive: hide nav links on small screens like 'hidden md:flex' */
  @media (max-width: 768px) {
    .nav-links {
      display: none;
    }
  }
  @media (min-width: 769px) {
    .nav-links {
      display: flex;
    }
  }
`}
      </style>

      {/* <div className="navbar">
        <div className="left-group">
          <span className="logo">
            {" "}
            <svg
              width="159"
              height="55"
              viewBox="0 0 159 55"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M17.062 19.3098H13.9674V36.2173H17.062V19.3098Z"
                fill="white"
              />
              <path
                d="M24.7868 24.0542C23.0752 24.0542 21.6243 24.6587 20.4316 25.8668C19.239 27.0748 18.6433 28.5526 18.6433 30.2991V36.2173H21.7379V30.3037C21.7379 29.4464 22.0374 28.7177 22.6354 28.1188C23.2334 27.5199 23.955 27.2182 24.7979 27.2182C25.6409 27.2182 26.3391 27.5222 26.9371 28.1302C27.5351 28.7382 27.8346 29.4623 27.8346 30.3037V36.2173H30.9292V30.2991C30.9292 28.5526 30.3334 27.0748 29.1408 25.8668C27.9482 24.6587 26.4972 24.0542 24.7857 24.0542H24.7868Z"
                fill="white"
              />
              <path
                d="M38.929 28.934C37.9814 28.7461 37.4769 28.6448 37.4157 28.6289C36.6206 28.4103 36.2242 28.1438 36.2242 27.8307V27.7841C36.2242 27.126 36.713 26.7969 37.6908 26.7969C38.3177 26.7969 38.8979 27.0782 39.4324 27.6406L41.4947 25.7426C41.0971 25.2121 40.4245 24.7817 39.478 24.4538C38.6529 24.1726 37.8578 24.0405 37.0939 24.0553C36.36 24.0713 35.6797 24.2432 35.0538 24.5711C33.6329 25.3054 32.9225 26.4076 32.9225 27.8752C32.9225 29.3427 33.6173 30.4767 35.0082 31.0859C35.4814 31.2885 36.0627 31.4604 36.7498 31.6016C37.2999 31.7109 37.6585 31.7815 37.8266 31.8123C38.2542 31.9682 38.4914 32.2267 38.5371 32.5853V32.6787C38.5371 33.0225 38.3388 33.2878 37.9413 33.4757C37.6351 33.6157 37.2921 33.6863 36.9101 33.6863H36.8411C35.9091 33.6863 35.0305 33.2878 34.2053 32.4908L32.486 34.7645C33.0205 35.2336 33.712 35.6241 34.5605 35.9361C35.4091 36.2481 36.1919 36.4131 36.9101 36.428C38.713 36.4746 40.1038 35.8871 41.0816 34.6655C41.5704 34.0552 41.8154 33.3732 41.8154 32.6218V32.5512C41.8154 30.5155 40.8533 29.3097 38.9279 28.9329L38.929 28.934Z"
                fill="white"
              />
              <path
                d="M44.9579 19.484C44.4378 19.484 43.9991 19.6639 43.6405 20.0226C43.2808 20.3823 43.1015 20.8275 43.1015 21.3581C43.1015 21.8886 43.2808 22.3384 43.6405 22.7061C43.9991 23.0739 44.4389 23.2572 44.9579 23.2572C45.4768 23.2572 45.9122 23.0739 46.2641 22.7061C46.6159 22.3395 46.7908 21.8898 46.7908 21.3581C46.7908 20.8264 46.6115 20.4017 46.2518 20.0339C45.8921 19.6673 45.4612 19.4829 44.9567 19.4829L44.9579 19.484Z"
                fill="white"
              />
              <path
                d="M46.5168 24.0542H43.4222V36.2173H46.5168V24.0542Z"
                fill="white"
              />
              <path
                d="M57.2672 30.3003C57.2672 31.1553 56.9732 31.8885 56.383 32.4954C55.7962 33.1022 55.0812 33.4051 54.2394 33.4051C53.3975 33.4051 52.6826 33.1022 52.0858 32.4954C51.4889 31.8885 51.1927 31.1553 51.1927 30.3003C51.1927 29.4452 51.4889 28.7154 52.0858 28.1177C52.6826 27.5176 53.3998 27.2171 54.2394 27.2171C54.9253 27.2171 55.5311 27.4254 56.0578 27.8433V24.3274C55.4777 24.1453 54.8708 24.053 54.2394 24.053C52.529 24.053 51.078 24.6565 49.8843 25.8667C48.6939 27.0736 48.0981 28.5515 48.0981 30.2991C48.0981 32.0468 48.6883 33.5474 49.8753 34.7543C51.0591 35.9646 52.5134 36.568 54.2394 36.568C55.9654 36.568 57.4008 35.9577 58.5845 34.7418C59.7682 33.5246 60.3618 32.0445 60.3618 30.2957V19.3098H57.2672V30.2991V30.3003Z"
                fill="white"
              />
              <path
                d="M68.0854 24.0542C66.3739 24.0542 64.9229 24.6587 63.7303 25.8667C62.5377 27.0747 61.9419 28.5526 61.9419 30.2991C61.9419 32.0457 62.5343 33.5474 63.718 34.7554C64.9018 35.9634 66.3572 36.568 68.0843 36.568C69.7045 36.568 71.1021 35.9976 72.2791 34.8567L70.3994 32.3018C69.7881 33.0362 69.0164 33.4028 68.0843 33.4028C67.4117 33.4028 66.8082 33.2036 66.2737 32.8051C65.738 32.4066 65.3717 31.8794 65.1735 31.2225H74.1354C74.1811 30.9117 74.2045 30.5997 74.2045 30.2877C74.2045 28.5435 73.612 27.0679 72.4283 25.8611C71.2435 24.6542 69.7959 24.0508 68.0843 24.0508L68.0854 24.0542ZM65.404 28.8577C65.9697 27.7647 66.8627 27.2171 68.0854 27.2171C69.3081 27.2171 70.1789 27.7636 70.7446 28.8577H65.404Z"
                fill="white"
              />
              <path
                d="M92.6584 30.3003C92.6584 31.1553 92.3622 31.8885 91.7742 32.4954C91.1841 33.1022 90.4691 33.4051 89.6306 33.4051C88.7921 33.4051 88.0705 33.1022 87.477 32.4954C86.8801 31.8885 86.5806 31.1553 86.5806 30.3003C86.5806 29.4452 86.8801 28.7154 87.477 28.1177C88.0705 27.5176 88.791 27.2171 89.6306 27.2171C90.3166 27.2171 90.9224 27.4254 91.4491 27.8433V24.3274C90.8689 24.1453 90.262 24.053 89.6306 24.053C87.9202 24.053 86.4692 24.6565 85.2766 25.8667C84.084 27.0736 83.4871 28.5515 83.4871 30.2991C83.4871 32.0468 84.0806 33.5474 85.2644 34.7543C86.4481 35.9646 87.9057 36.568 89.6317 36.568C91.3578 36.568 92.7898 35.9577 93.9769 34.7418C95.1606 33.5246 95.7541 32.0445 95.7541 30.2957V19.3098H92.6595V30.2991L92.6584 30.3003Z"
                fill="white"
              />
              <path
                d="M103.476 24.0542C101.764 24.0542 100.313 24.6587 99.1204 25.8667C97.9289 27.0747 97.332 28.5526 97.332 30.2991C97.332 32.0457 97.9244 33.5474 99.1082 34.7554C100.292 35.9634 101.747 36.568 103.474 36.568C105.095 36.568 106.492 35.9976 107.669 34.8567L105.79 32.3018C105.178 33.0362 104.406 33.4028 103.474 33.4028C102.802 33.4028 102.198 33.2036 101.664 32.8051C101.128 32.4066 100.762 31.8794 100.564 31.2225H109.526C109.571 30.9117 109.595 30.5997 109.595 30.2877C109.595 28.5435 109.002 27.0679 107.818 25.8611C106.634 24.6542 105.186 24.0508 103.474 24.0508L103.476 24.0542ZM100.794 28.8577C101.359 27.7647 102.253 27.2171 103.476 27.2171C104.698 27.2171 105.569 27.7636 106.135 28.8577H100.794Z"
                fill="white"
              />
              <path
                d="M117.344 24.0542C115.614 24.0542 114.16 24.6576 112.976 25.8576C111.793 27.0611 111.199 28.5458 111.199 30.3128V41.3112H114.294V30.3128C114.294 29.452 114.593 28.7211 115.187 28.1211C115.784 27.5176 116.501 27.2171 117.344 27.2171C118.187 27.2171 118.897 27.5176 119.487 28.1211C120.074 28.7211 120.368 29.452 120.368 30.3128C120.368 31.1735 120.074 31.9011 119.487 32.5011C118.897 33.1045 118.182 33.4051 117.344 33.4051C116.646 33.4051 116.033 33.2002 115.503 32.7823V36.289C116.087 36.4746 116.702 36.5691 117.344 36.5691C119.054 36.5691 120.502 35.9623 121.686 34.752C122.869 33.5417 123.463 32.0616 123.463 30.3128C123.463 28.564 122.869 27.0804 121.686 25.8702C120.502 24.6599 119.054 24.053 117.344 24.053V24.0542Z"
                fill="white"
              />
              <path
                d="M128.139 17.6794H125.044V29.9678C125.044 31.7155 125.64 33.1945 126.833 34.4036C128.024 35.6127 129.476 36.2173 131.188 36.2173V33.0533C130.347 33.0533 129.629 32.7527 129.033 32.1516C128.437 31.5504 128.139 30.8194 128.139 29.9598V26.7491H131.188V24.0542H128.139V17.6794Z"
                fill="white"
              />
              <path
                d="M143.244 25.8667C142.053 24.6587 140.601 24.0542 138.889 24.0542C137.804 24.0542 136.788 24.3206 135.84 24.8512V17.6794H132.746V36.2173H135.84V30.3037C135.84 29.4464 136.14 28.7177 136.738 28.1188C137.336 27.5199 138.057 27.2182 138.9 27.2182C139.743 27.2182 140.441 27.5222 141.039 28.1302C141.637 28.7382 141.937 29.4623 141.937 30.3037V36.2173H145.031V30.2991C145.031 28.5526 144.436 27.0747 143.243 25.8667H143.244Z"
                fill="white"
              />
              <path
                d="M84.8869 24.053H81.9515C80.24 24.053 78.789 24.6587 77.5975 25.8667C76.406 27.0747 75.8091 28.5526 75.8091 30.2991V36.2173H78.9037V30.2991C78.9037 29.4418 79.2021 28.7131 79.7979 28.112C80.3936 27.512 81.1119 27.2114 81.9515 27.2114V27.2171H82.4782C82.858 26.2846 83.4292 25.4398 84.153 24.7088C84.3858 24.4743 84.6319 24.2523 84.8869 24.053Z"
                fill="white"
              />
              <path
                d="M26.5373 31.5174C26.2756 31.5174 26.0629 31.7348 26.0629 32.0024C26.0629 32.27 26.2756 32.4874 26.5373 32.4874C26.799 32.4874 27.0117 32.27 27.0117 32.0024C27.0117 31.7348 26.799 31.5174 26.5373 31.5174Z"
                fill="white"
              />
            </svg>
          </span>
          <nav className="nav-links">
            <a href="#" className="active">
              Bitcoin chart
            </a>
            <Link href="/">Ethereum chart</Link>
            <Link href="#">My list</Link>
            <Link href="#">Education</Link>
            <Link href="#">Resources</Link>
          </nav>
        </div>

        <div className="right-group">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Search alts"
              className="search-input"
            />
            <svg
              className="search-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          <svg
            className="bell-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>

          <button className="btn-register">Register</button>
          <button className="btn-login">Log in</button>
        </div>
      </div> */}
      <Header />
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
                <AssetSearch
                  onSelect={handleSymbolSelect}
                  currentExchange={exchange}
                />
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
                    title={
                      showSymbolSidebar
                        ? "Hide symbol sidebar"
                        : "Show symbol sidebar"
                    }
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h7"
                      />
                    </svg>
                  </button>

                  <button
                    className="p-1.5 text-[#afb5c4] hover:text-white"
                    onClick={() => setShowExchangePanels(!showExchangePanels)}
                    title={
                      showExchangePanels
                        ? "Hide exchange panels"
                        : "Show exchange panels"
                    }
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                      />
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
          {/* <div className="flex-1 w-50 relative overflow-hidden">
            <ErrorDisplay errors={errors} />
          </div> */}

          {/* Chart area */}
          <div className="flex-1 relative overflow-hidden">
            {/* BTC label */}
            <div className="absolute top-4 left-4 z-10">
              <span className="text-2xl font-bold text-white">
                {getBaseCurrency(symbol)}
              </span>
              {isAggregated && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-blue-900 text-blue-200 rounded-full">
                  Aggregated Delta
                </span>
              )}
            </div>

            {/* Connection status */}
            <div className="absolute top-4 right-4 z-10">
              <ConnectionStatus
                isLoading={isLoading}
                isConnected={wsConnected}
              />
            </div>

            {/* Chart display */}
            <div className="h-full overflow-y-auto">
              {candles.length > 0 ? (
                (() => {
                  // Process data for the three different delta chart types
                  // Use original data for spot
                  const spotDeltaData = [...deltaVolume];

                  // Create perps data with blue for positive values
                  const perpsDeltaData = deltaVolume.map((item) => ({
                    ...item,
                    color:
                      item.color.includes("red") ||
                      (item.color.toLowerCase().includes("ff") &&
                        !item.color.toLowerCase().includes("00ff"))
                        ? "#FF3A5C" // Red for negative
                        : "#00A3FF", // Blue for positive
                  }));

                  // For CVD, create cumulative data
                  let sum = 0;
                  const cvdDeltaData = deltaVolume.map((item) => {
                    const isNegative =
                      item.color.includes("red") ||
                      (item.color.toLowerCase().includes("ff") &&
                        !item.color.toLowerCase().includes("00ff"));
                    const multiplier = isNegative ? -1 : 1;
                    sum += item.value * multiplier;
                    return {
                      time: item.time,
                      value: sum,
                      color: sum >= 0 ? "#7E57C2" : "#673AB7", // Purple colors for CVD
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
                    <p className="text-[#afb5c4] text-lg">
                      Loading chart data...
                    </p>
                    <p className="text-[#6b7280] text-sm mt-2">
                      Please wait while we retrieve the latest market
                      information
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom info bar */}
          <div className="border-t border-[#2a2e39] p-2 flex justify-between items-center text-xs text-[#9fa9bc]">
            <div className="flex items-center space-x-4">
              <div>
                Trades/m <span className="text-white">790</span>
              </div>
              <div>
                Volume/m <span className="text-white">458.2K</span>
              </div>
              <div>
                Liquidations/m <span className="text-white">58.2K</span>
              </div>
            </div>
            <div>
              <span>
                Interval: {interval} • Candles: {chartStats.totalCount} •
                Timespan: {chartStats.timespan.toFixed(1)}h
              </span>
            </div>
          </div>
        </div>

        {/* Right sidebar - Exchange panels */}
        {showExchangePanels && (
          <div
            style={{ width: "300px" }}
            className="w-72 border-l border-[#2a2e39] overflow-y-auto"
          >
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
        {showSymbolSidebar && (
          <div className="w-64 border-r border-[#2a2e39] overflow-hidden">
            <SymbolSidebar onSymbolSelect={handleSymbolSelect} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChartController;
