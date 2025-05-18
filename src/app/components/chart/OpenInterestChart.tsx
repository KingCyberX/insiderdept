import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, LineStyle, UTCTimestamp } from 'lightweight-charts';

interface OpenInterest {
  time: number;
  openInterest: number;
}

interface OpenInterestChartProps {
  data: OpenInterest[];
  height: number;
  color?: string;
  chart?: IChartApi;
  onSeriesCreated?: (series: import('lightweight-charts').ISeriesApi<'Line'>) => void;
}

const OpenInterestChart: React.FC<OpenInterestChartProps> = ({ 
  data, 
  height,
  color = '#FF9900', // Orange color by default
  chart: existingChart,
  onSeriesCreated
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<import('lightweight-charts').ISeriesApi<'Line'> | null>(null);
  
  // Ensure all timestamps are in seconds format
  const ensureSecondsFormat = (timestamp: number): number => {
    return timestamp > 10000000000 ? Math.floor(timestamp / 1000) : timestamp;
  };
  
  useEffect(() => {
    // Set a minimum height directly on the container
    if (containerRef.current) {
      containerRef.current.style.minHeight = '150px'; // Increased from 120px
    }
    
    // If we're using an existing chart (backward compatibility with your current implementation)
    if (existingChart) {
      // Create open interest series if not exists
      if (!seriesRef.current) {
        const series = existingChart.addLineSeries({
          priceScaleId: 'openInterest',
          title: 'Open Interest',
          color: color,
          lineWidth: 3, // Increased from 2 for better visibility
          lineStyle: LineStyle.Solid, // Changed from Dotted to Solid
          priceFormat: {
            type: 'volume',
          },
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineWidth: 2,
          priceLineColor: color,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 6,
        });
        
        // Configure open interest scale
        existingChart.priceScale('openInterest').applyOptions({
          scaleMargins: {
            top: 0.2,  // More room for the line series (was 0.1)
            bottom: 0.6, // Push to middle portion to be more visible (was 0.7)
          },
          borderVisible: false,
          visible: true,
          alignLabels: true,
          autoScale: true,
        });
        
        seriesRef.current = series;
        
        // Call onSeriesCreated callback if provided
        if (onSeriesCreated) {
          onSeriesCreated(series);
        }
      }
      
      // Format data for the chart
      const formattedData = data.map(item => ({
        time: ensureSecondsFormat(item.time) as UTCTimestamp,
        value: item.openInterest
      }));
      
      // Set the data
      if (seriesRef.current && formattedData.length > 0) {
        seriesRef.current.setData(formattedData);
        
        // Add prominent price line for the latest value
        const lastPoint = formattedData[formattedData.length - 1];
        seriesRef.current.createPriceLine({
          price: lastPoint.value,
          color: color,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `OI: ${formatLargeNumber(lastPoint.value)}`,
        });
      }
      
      return () => {
        // Clean up on unmount
        if (seriesRef.current && existingChart) {
          existingChart.removeSeries(seriesRef.current);
          seriesRef.current = null;
        }
      };
    }
    
    // If we need to create our own chart (new implementation)
    if (!containerRef.current || !data || data.length === 0) return;
    
    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    
    // Determine chart height - use parameter height, or fallback to container height, or use minimum 150px
    const effectiveHeight = height > 0 
      ? height 
      : (containerRef.current.clientHeight > 0 
          ? containerRef.current.clientHeight 
          : 150);
    
    // Create chart
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: effectiveHeight,
      layout: {
        background: { color: 'transparent' },
        textColor: '#d1d4dc',
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: '#1c2030' },
        horzLines: { color: '#1c2030' },
      },
      rightPriceScale: {
        visible: true,
        borderColor: '#2a2e39',
        entireTextOnly: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 4,
        tickMarkFormatter: (time: UTCTimestamp) => {
          const date = new Date(time * 1000);
          return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
        },
      },
      crosshair: {
        vertLine: {
          color: '#2962FF',
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: '#2962FF',
        },
        horzLine: {
          color: '#2962FF',
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: '#2962FF',
        },
      },
    });
    
    chartRef.current = chart;
    
    // Add a line series for Open Interest
    const oiSeries = chart.addLineSeries({
      color: color,
      lineWidth: 3, // Increased from 2
      lineStyle: LineStyle.Solid, // Changed from dotted to solid
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineWidth: 2,
      priceLineColor: color,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      priceFormat: {
        type: 'volume',
      },
    });
    
    seriesRef.current = oiSeries;
    
    if (onSeriesCreated) {
      onSeriesCreated(oiSeries);
    }
    
    // Format data for chart
    const formattedData = data.map(item => ({
      time: ensureSecondsFormat(item.time) as UTCTimestamp,
      value: item.openInterest
    }));
    
    // Set data
    oiSeries.setData(formattedData);
    
    // Optional: Add labels for open interest values
    if (formattedData.length > 0) {
      // Add a price line for the current OI value
      const lastPoint = formattedData[formattedData.length - 1];
      oiSeries.createPriceLine({
        price: lastPoint.value,
        color: color,
        lineWidth: 2,
        lineStyle: LineStyle.Solid, // Changed from Dotted to Solid
        axisLabelVisible: true,
        title: `OI: ${formatLargeNumber(lastPoint.value)}`,
      });
      
      // Find maximum OI value for context
      const maxOI = Math.max(...formattedData.map(d => d.value));
      // Only add if significantly different from current
      if (maxOI > lastPoint.value * 1.1) {
        oiSeries.createPriceLine({
          price: maxOI,
          color: color, // Remove transparency for better visibility
          lineWidth: 1,
          lineStyle: LineStyle.Solid, // Changed from Dotted to Solid
          axisLabelVisible: true,
          title: `Max: ${formatLargeNumber(maxOI)}`,
        });
      }
    }
    
    // Fit content
    chart.timeScale().fitContent();
    
    // Handle resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight || 150; // Minimum 150px
        
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({
            width: width,
            height: height,
          });
          chartRef.current.timeScale().fitContent();
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Set up ResizeObserver for more accurate size tracking
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length > 0 && chartRef.current) {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
          chartRef.current.timeScale().fitContent();
        }
      }
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data, height, color, existingChart, onSeriesCreated]);
  
  // Utility function to format large numbers (e.g., 29.65B)
  const formatLargeNumber = (num: number): string => {
    if (num >= 1_000_000_000) {
      return (num / 1_000_000_000).toFixed(2) + 'B';
    } else if (num >= 1_000_000) {
      return (num / 1_000_000).toFixed(2) + 'M';
    } else if (num >= 1_000) {
      return (num / 1_000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
  };
  
  // If using existing chart, return null, otherwise return container
  if (existingChart) {
    return null;
  }
  
  return (
    <div className="w-full h-full open-interest-chart-container">
      <div 
        ref={containerRef} 
        className="w-full h-full open-interest-chart" 
        style={{ minHeight: '150px' }} 
      />
    </div>
  );
};

export default OpenInterestChart;