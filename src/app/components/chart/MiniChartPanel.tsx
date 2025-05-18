// src/app/components/chart/MiniChartPanel.tsx

import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, UTCTimestamp } from 'lightweight-charts';

interface MiniChartPanelProps {
  exchangeName: string;
  symbol: string;
  color: string;
  height: number;
  data?: {
    candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  };
}

const MiniChartPanel: React.FC<MiniChartPanelProps> = ({ 
  exchangeName, 
  symbol, 
  color, 
  height,
  data
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Create chart
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      rightPriceScale: {
        visible: true,
        borderColor: '#2a2e39',
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 4, // Make bars narrower for mini panels
      },
    });
    
    // Add series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00E676',
      downColor: '#FF5252',
      wickUpColor: '#00E676',
      wickDownColor: '#FF5252',
      borderVisible: false,
    });
    
    const volumeSeries = chart.addHistogramSeries({
      color: color,
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    
    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.3, // Give more space for volume
      },
    });
    
    // Load data
    if (data && data.candles && data.candles.length > 0) {
      setIsLoading(false);
      
      // Format data for chart
      const formattedCandles = data.candles.map(c => ({
        time: (c.time as number) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      
      const formattedVolumes = data.candles.map(c => ({
        time: (c.time as number) as UTCTimestamp,
        value: c.volume,
        color: c.close > c.open ? '#00E676' : '#FF5252',
      }));
      
      // Set data
      candleSeries.setData(formattedCandles);
      volumeSeries.setData(formattedVolumes);
      
      // Fit content
      chart.timeScale().fitContent();
    } else {
      // Create some dummy data for preview
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - 60 * 60; // 1 hour
      const dummyData: Array<{
        time: UTCTimestamp;
        open: number;
        high: number;
        low: number;
        close: number;
      }> = [];
      
      const volumeData: Array<{
        time: UTCTimestamp;
        value: number;
        color: string;
      }> = [];
      
      let price = 65000 + Math.random() * 2000 - 1000;
      
      for (let time = startTime; time <= endTime; time += 60) {
        const open = price;
        const high = open * (1 + Math.random() * 0.005);
        const low = open * (1 - Math.random() * 0.005);
        const close = low + Math.random() * (high - low);
        
        dummyData.push({
          time: time as UTCTimestamp,
          open,
          high,
          low,
          close,
        });
        
        volumeData.push({
          time: time as UTCTimestamp,
          value: Math.random() * 100,
          color: close > open ? '#00E676' : '#FF5252',
        });
        
        price = close;
      }
      
      candleSeries.setData(dummyData);
      volumeSeries.setData(volumeData);
      chart.timeScale().fitContent();
      
      setIsLoading(false);
    }
    
    chartRef.current = chart;
    
    // Handle resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, [exchangeName, symbol, color, height, data]);
  
  return (
    <div className="border-b border-[#2a2e39] p-2">
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center">
          <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: color, color: '#fff' }}>
            {exchangeName}
          </span>
        </div>
        <span className="text-xs text-[#afb5c4]">Live</span>
      </div>
      <div ref={containerRef} className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#131722]/50">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MiniChartPanel;