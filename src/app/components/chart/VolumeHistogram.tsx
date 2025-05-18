// Updated VolumeHistogram.tsx with enhanced visibility

import React, { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

// Define DeltaVolume type locally since the import might fail
interface DeltaVolume {
  time: number;
  value: number;
  color: string;
}

interface VolumeHistogramProps {
  chart: IChartApi;
  data: DeltaVolume[];
  onSeriesCreated?: (series: ISeriesApi<'Histogram'>) => void;
  isAggregated?: boolean;
}

const VolumeHistogram: React.FC<VolumeHistogramProps> = ({
  chart,
  data,
  onSeriesCreated,
  isAggregated = false
}) => {
  const seriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  
  // Ensure all timestamps are in seconds format
  const ensureSecondsFormat = (timestamp: number): number => {
    return timestamp > 10000000000 ? Math.floor(timestamp / 1000) : timestamp;
  };

  useEffect(() => {
    if (!chart || !data || data.length === 0) return;
    
    // Clean up any existing series
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    
    try {
      // Create volume histogram series with enhanced settings
      const volumeSeries = chart.addHistogramSeries({
        priceScaleId: 'volume',
        base: 0,
        lastValueVisible: true, // Show the last value
        priceFormat: {
          type: 'volume',
          precision: 0, // No decimal places for volume
        },
        // Ensure default color is visible even if data doesn't specify colors
        color: isAggregated ? '#888888' : '#4CAF50',
      });
      
      // *** KEY CHANGE: Adjust scale margins to make volume bars TALLER ***
      const volumePriceScale = chart.priceScale('volume');
      volumePriceScale.applyOptions({
        scaleMargins: {
          // These values control the height of the volume bars
          top: 0.7,     // This was 0.85 - lowered to give more space to volume (30% of height now)
          bottom: 0.0,  // Align to the bottom of the chart
        },
        borderVisible: false,
        autoScale: true,
        entireTextOnly: true,
      });
      
      // Format data for the histogram with ENHANCED values
      const formattedData = data.map(item => {
        // Determine color
        let color = item.color;
        if (!color || color === '') {
          // Default colors if none specified
          color = item.value >= 0 ? '#4CAF50' : '#FF5252';
        } else if (color === '#26a69a') {
          color = '#4CAF50'; // Brighter green
        } else if (color === '#ef5350') {
          color = '#FF5252'; // Brighter red
        }
        
        // *** KEY CHANGE: Amplify volume values to make them more visible ***
        // Calculate an enhanced value that's more visible while preserving proportions
        const baseValue = Math.max(0.1, Math.abs(item.value));
        const enhancedValue = item.value === 0 ? 0.1 : baseValue;
        
        return {
          time: ensureSecondsFormat(item.time) as UTCTimestamp,
          value: enhancedValue,
          color: color
        };
      });
      
      // Set data to the series
      volumeSeries.setData(formattedData);
      seriesRef.current = volumeSeries;
      
      // Call callback if provided
      if (onSeriesCreated) {
        onSeriesCreated(volumeSeries);
      }
      
      // *** NEW: Add volume annotation line for context ***
      if (formattedData.length > 0) {
        // Find average volume for a reference line
        const volumes = formattedData.map(d => d.value);
        const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
        
        // Add a line to show average volume
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
    
    return () => {
      // Clean up on unmount or when data changes
      if (seriesRef.current && chart) {
        try {
          chart.removeSeries(seriesRef.current);
        } catch (e) {
          console.warn('Error removing volume series:', e);
        }
        seriesRef.current = null;
      }
    };
  }, [chart, data, isAggregated, onSeriesCreated]);
  
  return null; // This is a logical component, not a visual one
};

export default VolumeHistogram;