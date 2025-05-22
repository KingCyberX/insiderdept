/**
 * This file contains the updated CandlestickChart component with improved Open Interest visualization.
 * Key changes:
 * 1. Enhanced open interest display with better positioning and visibility
 * 2. Added proper price line labels showing OI value
 * 3. Improved scale margins for better visual hierarchy
 * 4. Fixed color coding and line thickness for better readability
 */

'use client';

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, UTCTimestamp, LineStyle } from 'lightweight-charts';
import PriceTag from './PriceTag';

// Update the Candle interface to include optional source and isMock properties
interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: 'real' | 'mock' | 'historical' | 'unknown';
  isMock?: boolean;
}

interface DeltaVolume {
  time: number;
  value: number;
  color: string;
}

interface OpenInterest {
  time: number;
  openInterest: number;
}

// Find the prop definition:
interface CandlestickChartProps {
  candles: Candle[];
  volumeData: DeltaVolume[];
  openInterestData: OpenInterest[];
  isAggregated?: boolean;
  interval?: string;
  onChartReady?: (chart: IChartApi, candleSeries: ISeriesApi<'Candlestick'>) => void;
  showOpenInterest?: boolean; // This prop controls OI visibility
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({
  candles,
  volumeData,
  openInterestData,
  isAggregated = false,
  interval = '1m',
  onChartReady,
  // Remove showOpenInterest from destructuring
}) => {
  // Force open interest to always be enabled
  const showOpenInterest = true; // Local constant that's always true



  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const oiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const resizeListenerRef = useRef<(() => void) | null>(null);
  const hasInitialized = useRef(false);
  const previousCandleCount = useRef(0);
  const previousIntervalRef = useRef(interval);
  const debugMode = useRef(true); // Enable debug mode to see more logs
  const currentIntervalRef = useRef<string>(interval); // Keep track of current interval
  
  // State for price tags
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceTagY, setPriceTagY] = useState<number | null>(null);
  
  // Add candle stats for debugging
  const [chartStats, setChartStats] = useState({
    realCount: 0,
    mockCount: 0,
    histCount: 0,
    totalCount: 0,
    timespan: 0
  });

  // Utility function to format large numbers (e.g., 29.65B)
  const formatNumber = (num: number): string => {
    if (num >= 1_000_000_000) {
      return (num / 1_000_000_000).toFixed(2) + 'B';
    } else if (num >= 1_000_000) {
      return (num / 1_000_000).toFixed(2) + 'M';
    } else if (num >= 1_000) {
      return (num / 1_000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
  };

  // Ensure all timestamps are in seconds format
  const ensureSecondsFormat = useCallback((timestamp: number): number => {
    return timestamp > 10000000000 ? Math.floor(timestamp / 1000) : timestamp;
  }, []);

  // Try to infer interval from data patterns
  const inferInterval = useCallback((candles: Candle[]): string => {
    if (candles.length < 2) return interval;
    
    // Get unique timestamps after normalization to seconds
    // This helps us detect the actual interval pattern without being affected by duplicates
    const timestamps = [...new Set(candles.map(c => ensureSecondsFormat(c.time)))].sort((a, b) => a - b);
    
    if (timestamps.length < 2) return interval;
    
    // Calculate time differences between consecutive unique timestamps
    const diffs: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      const diff = timestamps[i] - timestamps[i-1];
      if (diff > 0) diffs.push(diff);
    }
    
    if (diffs.length === 0) return interval;
    
    // Find the most common difference (mode)
    const diffCounts = diffs.reduce((acc, diff) => {
      acc[diff] = (acc[diff] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    
    // Sort by count (descending)
    const sortedDiffs = Object.entries(diffCounts)
      .sort((a, b) => b[1] - a[1])
      .map(entry => parseInt(entry[0]));
    
    const mostCommonDiff = sortedDiffs[0];
    
    // Map to interval
    if (mostCommonDiff >= 86000) return '1d';
    if (mostCommonDiff >= 13000) return '4h';
    if (mostCommonDiff >= 3000) return '1h';
    if (mostCommonDiff >= 1700) return '30m';
    if (mostCommonDiff >= 800) return '15m';
    if (mostCommonDiff >= 250) return '5m';
    return '1m';
  }, [ensureSecondsFormat, interval]);

  // Convert the timestamp to a UTCTimestamp format that the chart library requires
  const formatTimeToUTC = useCallback((time: number): UTCTimestamp => {
    // Always ensure time is in seconds (not milliseconds)
    const timeInSeconds = ensureSecondsFormat(time);
    return timeInSeconds as UTCTimestamp;
  }, [ensureSecondsFormat]);

  // Format time for chart - consistent handling
  const formatCandleTime = useCallback((candle: Candle): { time: UTCTimestamp } => {
    return {
      time: formatTimeToUTC(candle.time)
    };
  }, [formatTimeToUTC]);

  // Process candles for chart use - strictly handle duplicate timestamps
  const processCandles = useCallback((inputCandles: Candle[]): Candle[] => {
    if (!inputCandles || inputCandles.length === 0) return [];
    
    if (debugMode.current) {
      console.log(`Processing ${inputCandles.length} candles for interval ${interval}...`);
    }
    
    // Make a deep copy to avoid modifying original data
    const candles = JSON.parse(JSON.stringify(inputCandles));
    
    // Normalize all timestamps to seconds format
    const normalizedCandles = candles.map((c: Candle) => ({
      ...c,
      time: ensureSecondsFormat(c.time)
    }));
    
    // Sort candles by time
    const sortedCandles = [...normalizedCandles].sort((a, b) => a.time - b.time || 
      // Handle tied timestamps by prioritizing real > historical > mock
      (a.source === 'real' ? -1 : a.source === 'historical' ? 0 : 1) - 
      (b.source === 'real' ? -1 : b.source === 'historical' ? 0 : 1));
    
    // CRITICAL: Handle duplicate timestamps (required by lightweight-charts)
    // Use a map to deduplicate by exact time
    const uniqueCandlesMap = new Map<number, Candle>();
    
    for (const candle of sortedCandles) {
      // If this timestamp already exists, decide whether to keep the new one or not
      if (uniqueCandlesMap.has(candle.time)) {
        const existing = uniqueCandlesMap.get(candle.time)!;
        
        // Prioritize real data
        if (
          (candle.source === 'real' && existing.source !== 'real') ||
          (candle.source === 'historical' && existing.source === 'mock')
        ) {
          uniqueCandlesMap.set(candle.time, candle);
        }
        // If they're both the same source type, keep the one with higher volume for better visibility
        else if (candle.source === existing.source && candle.volume > existing.volume) {
          uniqueCandlesMap.set(candle.time, candle);
        }
      } else {
        // No conflict, add the candle
        uniqueCandlesMap.set(candle.time, candle);
      }
    }
    
    // Convert back to array and sort by time
    const uniqueCandles = Array.from(uniqueCandlesMap.values()).sort((a, b) => a.time - b.time);
    
    // Update interval reference if needed
    const detectedInterval = inferInterval(uniqueCandles);
    if (detectedInterval !== currentIntervalRef.current) {
      console.log(`Detected interval change: ${currentIntervalRef.current} → ${detectedInterval}`);
      currentIntervalRef.current = detectedInterval;
    }
    
    // Calculate stats for debugging
    const realCount = uniqueCandles.filter(c => c.source === 'real').length;
    const mockCount = uniqueCandles.filter(c => c.source === 'mock' || c.isMock).length;
    const histCount = uniqueCandles.filter(c => c.source === 'historical' && !c.isMock).length;
    
    // Calculate timespan
    let timespan = 0;
    if (uniqueCandles.length > 1) {
      const firstTime = uniqueCandles[0].time;
      const lastTime = uniqueCandles[uniqueCandles.length - 1].time;
      timespan = (lastTime - firstTime) / 3600; // In hours
    }
    
    // Update stats
    setChartStats({
      realCount,
      mockCount,
      histCount,
      totalCount: uniqueCandles.length,
      timespan
    });
    
    if (debugMode.current) {
      console.log(`Processed ${inputCandles.length} candles to ${uniqueCandles.length} unique candles`);
      
      // Log first and last candle times
      if (uniqueCandles.length > 0) {
        const firstTime = uniqueCandles[0].time;
        const lastTime = uniqueCandles[uniqueCandles.length - 1].time;
        
        console.log(`First candle: ${new Date(firstTime * 1000).toISOString()}, Last candle: ${new Date(lastTime * 1000).toISOString()}`);
        console.log(`Time range: ${timespan.toFixed(2)} hours`);
      }
      
      // Verify no duplicates - this is critical
      let hasDuplicates = false;
      for (let i = 1; i < uniqueCandles.length; i++) {
        if (uniqueCandles[i].time === uniqueCandles[i-1].time) {
          console.error(`DUPLICATE TIME FOUND: ${uniqueCandles[i].time} at indices ${i-1} and ${i}`);
          hasDuplicates = true;
        }
      }
      
      if (hasDuplicates) {
        console.error("⚠️ Chart may fail to render due to duplicate timestamps!");
      } else {
        console.log("✓ No duplicate timestamps found - chart should render correctly");
      }
    }
    
    return uniqueCandles;
  }, [ensureSecondsFormat, inferInterval, interval]);

  // Log candlestick data for debugging
  const logCandleDebug = useCallback((message: string, candleData: Candle[], limit: number = 3) => {
    if (!debugMode.current) return;
    
    console.log(`[Chart ${message}]`);
    const sampleCandles = candleData.slice(0, limit);
    
    sampleCandles.forEach((candle, index) => {
      console.log(`Candle ${index}:`, {
        time: candle.time,
        date: new Date(ensureSecondsFormat(candle.time) * 1000).toISOString(),
        open: candle.open?.toFixed(2),
        close: candle.close?.toFixed(2),
        source: candle.source || 'unknown'
      });
    });
  }, [ensureSecondsFormat]);

  // Memoize the candle data transformation for better performance
  const formattedCandles = useMemo(() => {
    // Process candles to ensure unique timestamps
    const processedCandles = processCandles(candles);
    
    if (debugMode.current) {
      logCandleDebug("Preparing formatted candles", processedCandles);
    }
    
    // Format candles for the chart library
    return processedCandles.map(c => ({
      ...formatCandleTime(c),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  }, [candles, formatCandleTime, logCandleDebug, processCandles]);

  // Memoize volume data transformation with amplification for better visibility
  const formattedVolumeData = useMemo(() => {
    if (!volumeData.length) return [];
    
    // Use a map to deduplicate by time
    const volumeMap = new Map<number, DeltaVolume>();
    
    volumeData.forEach(v => {
      const time = ensureSecondsFormat(v.time);
      // If we have multiple volume entries for the same time, keep the one with highest value
      if (!volumeMap.has(time) || v.value > volumeMap.get(time)!.value) {
        volumeMap.set(time, { ...v, time });
      }
    });
    
    // Convert back to array and ensure sorted by time
    return Array.from(volumeMap.values())
      .sort((a, b) => a.time - b.time)
      .map(d => {
        // Amplify volume values to make them more visible
        const amplifiedValue = Math.max(0.1, d.value * 8); // Multiply by 8 for better visibility (increased from 5)
        
        return {
          ...formatCandleTime({ time: d.time, open: 0, high: 0, low: 0, close: 0, volume: 0 }),
          value: amplifiedValue,
          color: d.color === '#26a69a' ? '#4CAF50' : 
                d.color === '#ef5350' ? '#FF5252' : 
                d.color || (d.value >= 0 ? '#4CAF50' : '#FF5252')
        };
      });
  }, [volumeData, formatCandleTime, ensureSecondsFormat]);

  // Memoize OI data transformation
  const formattedOIData = useMemo(() => {
    if (!openInterestData.length) return [];
    
    // Use a map to deduplicate by time
    const oiMap = new Map<number, OpenInterest>();
    
    openInterestData.forEach(oi => {
      const time = ensureSecondsFormat(oi.time);
      oiMap.set(time, { ...oi, time });
    });
    
    // Convert back to array and ensure sorted by time
    return Array.from(oiMap.values())
      .sort((a, b) => a.time - b.time)
      .map(d => ({
        ...formatCandleTime({ time: d.time, open: 0, high: 0, low: 0, close: 0, volume: 0 }),
        value: d.openInterest,
      }));
  }, [openInterestData, formatCandleTime, ensureSecondsFormat]);

  // Handle resize function
  const handleResize = useCallback(() => {
    if (chartContainerRef.current && chartInstanceRef.current) {
      chartInstanceRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
      });
      
      // Ensure we fit content after resize
      setTimeout(() => {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.timeScale().fitContent();
        }
      }, 100);
    }
  }, []);

  // Calculate appropriate bar spacing based on interval
  const calculateBarSpacing = useCallback((timeInterval: string): number => {
    // Increased spacing for all intervals to improve visibility
    if (timeInterval === '1d') return 20; // Was 15
    if (timeInterval === '4h') return 18; // Was 13
    if (timeInterval === '1h') return 16; // Was 11
    if (timeInterval === '30m') return 14; // Was 10
    if (timeInterval === '15m') return 12; // Was 9
    if (timeInterval === '5m') return 10; // Was 8
    return 8; // Default for 1m, was 6
  }, []);
  
  // Add zoom listeners to prevent excessive zooming
  const addZoomListeners = useCallback(() => {
    if (!chartInstanceRef.current) return;
    
    // Add listener for when the visible range changes
    chartInstanceRef.current.timeScale().subscribeVisibleTimeRangeChange(() => {
      const visibleRange = chartInstanceRef.current?.timeScale().getVisibleRange();
      if (!visibleRange) return;
      
      // If the visible range gets too small (zoomed in too much), expand it
      const from = (visibleRange.from as number);
      const to = (visibleRange.to as number);
      const visibleTimeRange = to - from;
      
      const currentInterval = currentIntervalRef.current;
      let minTimeRange = 20 * 60; // 20 minutes default for 1m
      
      // Adjust minimum time range based on interval
      if (currentInterval === '5m') minTimeRange = 100 * 60; // 100 minutes
      else if (currentInterval === '15m') minTimeRange = 300 * 60; // 5 hours
      else if (currentInterval === '30m') minTimeRange = 600 * 60; // 10 hours
      else if (currentInterval === '1h') minTimeRange = 24 * 60 * 60; // 24 hours
      else if (currentInterval === '4h') minTimeRange = 4 * 24 * 60 * 60; // 4 days
      else if (currentInterval === '1d') minTimeRange = 7 * 24 * 60 * 60; // 7 days
      
      // If time range is less than minimum, expand view
      if (visibleTimeRange < minTimeRange) {
        // Calculate a better range that shows more context
        const center = (from + to) / 2;
        const newFrom = center - (minTimeRange / 2);
        const newTo = center + (minTimeRange / 2);
        
        // Set the new range with animation
        chartInstanceRef.current?.timeScale().setVisibleRange({
          from: newFrom as UTCTimestamp,
          to: newTo as UTCTimestamp
        });
      }
    });
  }, []);

  // Function to handle crosshair move to update price tag position
  const handleCrosshairMove = useCallback((param: { point?: { x: number; y: number } }) => {
    if (!chartInstanceRef.current || !param || !param.point || param.point.x === undefined || param.point.y === undefined) {
      return;
    }
    
    // Get the current price from the crosshair position
    if (candleSeriesRef.current) {
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price !== null) {
        setCurrentPrice(price);
        setPriceTagY(param.point.y);
      }
    }
  }, []);

  // Reset the chart when interval changes
  useEffect(() => {
    if (interval !== previousIntervalRef.current) {
      console.log(`Interval changed from ${previousIntervalRef.current} to ${interval}`);
      previousIntervalRef.current = interval;
      currentIntervalRef.current = interval;
      
      // Force chart re-initialization
      if (chartInstanceRef.current) {
        try {
          chartInstanceRef.current.remove();
        } catch (e) {
          console.warn('Failed to remove chart on interval change:', e);
        }
        chartInstanceRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
        oiSeriesRef.current = null;
        hasInitialized.current = false;
      }
    }
  }, [interval]);

  useEffect(() => {
    if (!chartContainerRef.current || formattedCandles.length === 0) return;

    // Infer the interval from the candle data if needed
    const detectedInterval = inferInterval(candles);
    if (detectedInterval !== currentIntervalRef.current) {
      console.log(`Updating current interval from ${currentIntervalRef.current} to ${detectedInterval}`);
      currentIntervalRef.current = detectedInterval;
    }
    
    // Appropriate bar spacing based on interval
    const barSpacing = calculateBarSpacing(currentIntervalRef.current);
    
    // If chart already exists, update data
    if (chartInstanceRef.current && candleSeriesRef.current && hasInitialized.current) {
      try {
        // Update candlestick data using memoized formatted candles
        candleSeriesRef.current.setData(formattedCandles);
        
        // Update volume data if available
        if (volumeSeriesRef.current && formattedVolumeData.length > 0) {
          volumeSeriesRef.current.setData(formattedVolumeData);
          
          // IMPROVED: Adjust scale for volume histogram to be more visible
          chartInstanceRef.current?.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.7, bottom: 0.0 }, // Give volume 30% of chart height
            borderVisible: false,
            autoScale: true,
          });
        }
        
        // IMPROVED: Update open interest data if available and enabled
        if (showOpenInterest && oiSeriesRef.current && formattedOIData.length > 0) {
          oiSeriesRef.current.setData(formattedOIData);
          
          // Enhance open interest visualization and positioning
          chartInstanceRef.current?.priceScale('openInterest').applyOptions({
            scaleMargins: {
              top: 0.02,    // Move OI to the very top of the chart (was 0.05)
              bottom: 0.8,  // Leave space for candles below
            },
            borderVisible: false,
            visible: true,  // Ensure scale is visible
            autoScale: true,
          });
          
          // Update OI price line
          if (formattedOIData.length > 0) {
            const lastOI = formattedOIData[formattedOIData.length - 1];
            oiSeriesRef.current.createPriceLine({
              price: lastOI.value,
              color: '#FF9900',
              lineWidth: 2,
              lineStyle: 0, // Solid
              axisLabelVisible: true,
              title: `OI: ${formatNumber(lastOI.value)}`,
            });
          }
        } else if (oiSeriesRef.current && !showOpenInterest) {
          // Hide OI scale if disabled
          chartInstanceRef.current?.priceScale('openInterest').applyOptions({
            visible: false,
          });
        }
        
        // Update chart options based on timeframe
        chartInstanceRef.current.timeScale().applyOptions({
          barSpacing: barSpacing,
          rightBarStaysOnScroll: true, // Ensures all panes move together
        });
        
        // Always fit content when data changes significantly
        const significantChange = Math.abs(candles.length - previousCandleCount.current) > 5;
        if (significantChange) {
          previousCandleCount.current = candles.length;
          chartInstanceRef.current.timeScale().fitContent();
        }
        
        // Update current price for PriceTag from the last candle
        if (formattedCandles.length > 0) {
          const lastCandle = formattedCandles[formattedCandles.length - 1];
          setCurrentPrice(lastCandle.close);
        }
        
        // Force recalculation of scales for better visibility
        setTimeout(() => {
          if (chartInstanceRef.current) {
            // Force all price scales to update
            if (volumeSeriesRef.current) {
              chartInstanceRef.current.priceScale('volume').applyOptions({
                autoScale: true,
                scaleMargins: { top: 0.7, bottom: 0.0 },
              });
            }
            
            if (oiSeriesRef.current && showOpenInterest) {
              chartInstanceRef.current.priceScale('openInterest').applyOptions({
                autoScale: true,
                visible: true,
                scaleMargins: { top: 0.02, bottom: 0.8 },
              });
            }
            
            // Refit content
            chartInstanceRef.current.timeScale().fitContent();
          }
        }, 200);
        
        return;
      } catch (error) {
        console.error("[Chart] Error updating chart:", error);
        // If error updating, recreate the chart
      }
    }

    // Create or recreate chart
    if (resizeListenerRef.current) {
      window.removeEventListener('resize', resizeListenerRef.current);
      resizeListenerRef.current = null;
    }

    if (chartInstanceRef.current) {
      try {
        chartInstanceRef.current.remove();
      } catch (e) {
        console.warn('Chart was already disposed or failed to remove:', e);
      }
      chartInstanceRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      oiSeriesRef.current = null;
      hasInitialized.current = false;
    }

    // Create new chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: '#1c2030' },
        horzLines: { color: '#1c2030' },
      },
      crosshair: { 
        mode: 0,
        vertLine: {
          color: '#2962FF',
          width: 1,
          style: 1, // Solid line
          labelBackgroundColor: '#2962FF',
        },
        horzLine: {
          color: '#2962FF',
          width: 1,
          style: 1, // Solid line
          labelBackgroundColor: '#2962FF',
        },
      },
      rightPriceScale: { 
        borderColor: '#2a2e39',
        textColor: '#d1d4dc',
        scaleMargins: {
          top: 0.2,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: barSpacing,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
        rightOffset: 5,
        minBarSpacing: 2,
        rightBarStaysOnScroll: true, // This ensures all panes move together when scrolling/zooming
      },
    });

    chartInstanceRef.current = chart;
    
    // Subscribe to crosshair move for price tag positioning
    chart.subscribeCrosshairMove(handleCrosshairMove);
    
    // Add zoom listeners
    addZoomListeners();

    // First, add the open interest line at the top (if enabled)
    if (showOpenInterest && formattedOIData.length > 0) {
      try {
        // ENHANCED: Create OI series with improved styling
        const oiSeries = chart.addLineSeries({
          priceScaleId: 'openInterest',
          color: '#FF9900',          // Bright orange for better visibility
          lineWidth: 4,              // Thicker line (was 3)
          lastValueVisible: true,    // Show current value
          priceLineVisible: true,    // Show horizontal line at current value
          priceLineWidth: 2,         // Thickness of the price line
          lineStyle: 0,              // Solid line (was dotted)
          title: 'Open Interest',    // Label for the series
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 6,
          priceFormat: {
            type: 'volume',          // Format as volume number
            precision: 0,            // No decimal places for OI
          },
        });

        oiSeriesRef.current = oiSeries;

        // Position open interest at the very top of the chart
        chart.priceScale('openInterest').applyOptions({
          scaleMargins: {
            top: 0.02,     // Position at the top with minimal margin (was 0.05)
            bottom: 0.8,   // Leave 80% of the chart for candles
          },
          borderVisible: false,
          visible: true,   // Ensure scale is visible
          autoScale: true,
          entireTextOnly: true,
        });

        // Set open interest data
        oiSeries.setData(formattedOIData);
        
        // Add price line for the latest OI value with enhanced visibility
        if (formattedOIData.length > 0) {
          const lastOI = formattedOIData[formattedOIData.length - 1];
          oiSeries.createPriceLine({
            price: lastOI.value,
            color: '#FF9900',
            lineWidth: 2,
            lineStyle: 0, // Solid (was dotted)
            axisLabelVisible: true,
            title: `OI: ${formatNumber(lastOI.value)}`,
          });
          
          // Also add a line for maximum OI value for context if significantly different
          const maxOI = Math.max(...formattedOIData.map(d => d.value));
          if (maxOI > lastOI.value * 1.05) { // If max is at least 5% higher than current
            oiSeries.createPriceLine({
              price: maxOI,
              color: '#FF990080', // Semi-transparent orange
              lineWidth: 1,
              lineStyle: 2, // Dashed
              axisLabelVisible: true,
              title: `Max: ${formatNumber(maxOI)}`,
            });
          }
        }
      } catch (error) {
        console.error('Failed to create open interest chart:', error);
      }
    }

    // Then add the candlestick chart in the middle
    const candleSeries = chart.addCandlestickSeries({
      upColor: isAggregated ? '#00A3FF' : '#00E676',     // Use Figma blue for up candles
      downColor: isAggregated ? '#FF3A5C' : '#FF5252',   // Use Figma red for down candles
      wickUpColor: isAggregated ? '#00A3FF' : '#00E676', // Match candle body colors for wicks
      wickDownColor: isAggregated ? '#FF3A5C' : '#FF5252',
      borderVisible: isAggregated,
      borderColor: isAggregated ? '#FFFFFF' : undefined,
      borderUpColor: isAggregated ? '#00F0FF' : undefined,
      borderDownColor: isAggregated ? '#FF00A3' : undefined,
      wickVisible: true,
    });

    candleSeriesRef.current = candleSeries;

    // Apply wider bar spacing for delta view
    if (isAggregated) {
      chart.timeScale().applyOptions({
        barSpacing: barSpacing * 1.2, // Make bars wider for delta view
      });
      
      // Log aggregation status for debugging
      console.log('Rendering chart in DELTA AGGREGATION mode with distinct styling');
    }

    // Log sample data for debugging
    logCandleDebug("Initial candles", candles);

    try {
      // Set initial data using memoized formatted candles
      candleSeries.setData(formattedCandles);
      previousCandleCount.current = candles.length;
      
      // Set current price from last candle
      if (formattedCandles.length > 0) {
        const lastCandle = formattedCandles[formattedCandles.length - 1];
        setCurrentPrice(lastCandle.close);
      }
    } catch (error) {
      console.error("[Chart] Error setting candle data:", error);
      console.error("This is likely due to duplicate timestamps in the data");
    }

    // Call onChartReady callback if provided
    if (onChartReady) onChartReady(chart, candleSeries);

    // Set up resize listener
    const resizeHandler = () => {
      handleResize();
      // After resize, ensure chart zooms properly
      chart.timeScale().fitContent();
    };
    
    window.addEventListener('resize', resizeHandler);
    resizeListenerRef.current = resizeHandler;

    // Then add the volume histogram at the bottom
    if (formattedVolumeData.length > 0) {
      try {
        const volumeSeries = chart.addHistogramSeries({
          priceScaleId: 'volume',
          base: 0,
          lastValueVisible: true,
          color: isAggregated ? '#888888' : '#4CAF50',
          priceFormat: {
            type: 'volume',
            precision: 0
          }
        });

        volumeSeriesRef.current = volumeSeries;

        // Position volume at the bottom of the chart
        chart.priceScale('volume').applyOptions({
          scaleMargins: { 
            top: 0.7,     // This gives the volume 30% of the chart height
            bottom: 0.0   // This positions volume bars at the very bottom of the chart
          },
          borderVisible: false,
          autoScale: true,
          entireTextOnly: true,
        });

        // Set volume data with amplified values for better visibility
        volumeSeries.setData(formattedVolumeData);
        
        // Add volume average line for better context
        if (formattedVolumeData.length > 0) {
          const volumes = formattedVolumeData.map(d => d.value);
          const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
          
          volumeSeries.createPriceLine({
            price: avgVolume,
            color: '#FFFFFF80', // Semi-transparent white
            lineWidth: 1,
            lineStyle: 1, // Solid
            axisLabelVisible: true,
            title: 'Avg Vol',
          });
        }
      } catch (error) {
        console.error('Failed to create volume histogram:', error);
      }
    }
    
    // Add price lines for key levels if we have candles
    if (candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      
      // Add last price line
      candleSeries.createPriceLine({
        price: lastCandle.close,
        color: lastCandle.close >= lastCandle.open ? '#00E676' : '#FF5252',
        lineWidth: 2,
        lineStyle: 1, // Solid
        axisLabelVisible: true,
        title: 'Current',
      });
      
      // Optional: Add support/resistance levels
      // This is placeholder - in a real app, these would be calculated or retrieved from API
      if (candles.length > 50) {
        // Simple moving average as placeholder
        const ma20 = candles.slice(-20).reduce((sum, c) => sum + c.close, 0) / 20;
        const ma50 = candles.slice(-50).reduce((sum, c) => sum + c.close, 0) / 50;
        
        // Add MA lines
        candleSeries.createPriceLine({
          price: ma20,
          color: '#64B5F6', // Light blue
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: 'MA20',
        });
        
        candleSeries.createPriceLine({
          price: ma50,
          color: '#7E57C2', // Purple
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: 'MA50',
        });
      }
    }

    // Fit content to display all data
    chart.timeScale().fitContent();
    hasInitialized.current = true;

    // Force resize after rendering and add an additional scale recalculation for better visibility
    setTimeout(() => {
      if (chartInstanceRef.current) {
        handleResize();
        
        // Force all price scales to update for optimal visibility
        if (volumeSeriesRef.current) {
          chartInstanceRef.current.priceScale('volume').applyOptions({
            autoScale: true,
            scaleMargins: { top: 0.7, bottom: 0.0 },
          });
        }
        
        if (oiSeriesRef.current && showOpenInterest) {
          chartInstanceRef.current.priceScale('openInterest').applyOptions({
            autoScale: true,
            visible: true,
            scaleMargins: { top: 0.02, bottom: 0.8 },
          });
        }
        
        chartInstanceRef.current.timeScale().fitContent();
      }
    }, 200);

    // Clean up on unmount
    return () => {
      if (resizeListenerRef.current) {
        window.removeEventListener('resize', resizeListenerRef.current);
        resizeListenerRef.current = null;
      }
      if (chartInstanceRef.current) {
        try {
          chartInstanceRef.current.remove();
        } catch (e) {
          console.warn('Failed to remove chart on cleanup:', e);
        }
        chartInstanceRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
        oiSeriesRef.current = null;
        hasInitialized.current = false;
      }
    };
  }, [candles, volumeData, openInterestData, isAggregated, onChartReady, showOpenInterest,
      formatCandleTime, logCandleDebug, formattedCandles, formattedVolumeData, 
      formattedOIData, handleResize, inferInterval, calculateBarSpacing, 
      addZoomListeners, ensureSecondsFormat, handleCrosshairMove]);

  // Additional effect to ensure charts are visible after initial render
  useEffect(() => {
    // Add a delayed force-recalculation to ensure proper scaling
    const timer = setTimeout(() => {
      if (chartInstanceRef.current) {
        // Log chart dimensions and data sizes to help with debugging
        console.log('Chart dimensions check:', {
          containerWidth: chartContainerRef.current?.clientWidth,
          containerHeight: chartContainerRef.current?.clientHeight,
          candles: formattedCandles.length,
          volumeData: formattedVolumeData.length,
          openInterestData: formattedOIData.length,
        });
        
        // Force recalculation for volume histogram
        if (volumeSeriesRef.current && formattedVolumeData.length > 0) {
          chartInstanceRef.current.priceScale('volume').applyOptions({
            autoScale: true,
            scaleMargins: { top: 0.7, bottom: 0.0 },
          });
          
          // Apply any additional styling or scaling needed
          console.log('Forcing volume scale recalculation');
        }
        
        // Force recalculation for open interest line
        if (oiSeriesRef.current && formattedOIData.length > 0 && showOpenInterest) {
          chartInstanceRef.current.priceScale('openInterest').applyOptions({
            autoScale: true,
            visible: true,
            scaleMargins: { top: 0.02, bottom: 0.8 },
          });
          
          console.log('Forcing OI scale recalculation');
        }
        
        // Ensure everything fits properly
        chartInstanceRef.current.timeScale().fitContent();
      }
    }, 1000); // Longer delay to ensure everything is fully rendered
    
    return () => clearTimeout(timer);
  }, [formattedCandles.length, formattedVolumeData.length, formattedOIData.length, showOpenInterest]);

  return (
    <div className="w-full h-full relative min-h-[500px]">
      <div ref={chartContainerRef} className="w-full h-full min-h-[500px] candlestick-chart" />
      
      {/* Price tag at current price level */}
      {currentPrice !== null && priceTagY !== null && (
        <PriceTag 
          price={currentPrice} 
          yCoordinate={priceTagY} 
          color={isAggregated ? '#00A3FF' : '#00E676'}
        />
      )}
      
      {/* Exchange tags for multi-exchange view */}
      {isAggregated && (
        <div className="absolute top-4 right-4 z-10">
          <div className="px-3 py-1 bg-[#00A3FF20] rounded-md flex items-center">
            <div className="w-3 h-3 rounded-full bg-[#00A3FF] mr-2"></div>
            <span className="text-[#00A3FF] text-xs">Delta Spot</span>
          </div>
          <div className="px-3 py-1 bg-[#FF3A5C20] rounded-md flex items-center">
            <div className="w-3 h-3 rounded-full bg-[#FF3A5C] mr-2"></div>
            <span className="text-[#FF3A5C] text-xs">Delta Perps</span>
          </div>
        </div>
      )}
      
      {/* Open Interest indicator */}
      {showOpenInterest && (
        <div className="absolute top-4 right-4 z-10">
          <div className="px-3 py-1 bg-[#FF990020] rounded-md flex items-center">
            <div className="w-3 h-3 rounded-full bg-[#FF9900] mr-2"></div>
            <span className="text-[#FF9900] text-xs">Open Interest</span>
          </div>
        </div>
      )}
      
      {/* Add a legend to distinguish data sources */}
      <div className="flex items-center justify-between mt-2 gap-4 text-xs text-gray-400">
        {/* Delta aggregation indicator */}
        {isAggregated && (
          <div className="flex items-center">
            <span className="inline-block px-2 py-1 mr-2 bg-blue-900 text-blue-200 rounded">
              Delta Aggregation Mode
            </span>
          </div>
        )}
        
        {/* OI indicator */}
        {showOpenInterest && (
          <div className="flex items-center">
            <span className="inline-block px-2 py-1 mr-2 bg-orange-900 text-orange-200 rounded">
              Open Interest Enabled
            </span>
          </div>
        )}
        
        <div className="flex items-center gap-4">
          {chartStats.realCount > 0 && (
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 mr-1 rounded-sm" 
                style={{ backgroundColor: isAggregated ? '#00A3FF' : '#26a69a' }}></span>
              <span>Real Data ({chartStats.realCount})</span>
            </div>
          )}
          {chartStats.histCount > 0 && (
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 mr-1 rounded-sm opacity-70"
                style={{ backgroundColor: isAggregated ? '#00D6FF' : '#3E98FF' }}></span>
              <span>Historical Data ({chartStats.histCount})</span>
            </div>
          )}
          {chartStats.mockCount > 0 && (
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 mr-1 bg-yellow-500 rounded-sm opacity-70"></span>
              <span>Simulated Data ({chartStats.mockCount})</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Debug info about the current interval */}
      <div className="text-xs text-gray-500 text-right mt-1">
        Interval: {currentIntervalRef.current} • Candles: {chartStats.totalCount} • Timespan: {chartStats.timespan.toFixed(1)}h
      </div>
    </div>
  );
};

export default CandlestickChart;