// src/app/components/chart/ChartPanelGroup.tsx - Fixed version

import React, { useEffect, useMemo } from 'react';
import CandlestickChart from './CandlestickChart';
import OpenInterestChart from './OpenInterestChart';
import { DeltaChart } from './DeltaChart';  // Use named import instead of default import

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

interface ChartPanelGroupProps {
  candles: Candle[];
  openInterestData: OpenInterest[];
  deltaData: DeltaVolume[];
  interval: string;
  isAggregated?: boolean;
  showOpenInterest?: boolean;
}

const ChartPanelGroup: React.FC<ChartPanelGroupProps> = ({
  candles,
  openInterestData,
  deltaData,
  interval,
  isAggregated = false,
  showOpenInterest = true
}) => {
  // Log debug info on mount to help with troubleshooting
  useEffect(() => {
    console.log('ChartPanelGroup mounted');
    console.log('Delta data sample:', deltaData?.slice(0, 3) || 'No delta data');
    console.log('Delta data count:', deltaData?.length || 0);
  }, [deltaData]);

  // Determine if components are available for rendering
  const canRenderCandlestick = typeof CandlestickChart === 'function';
  const canRenderOpenInterest = typeof OpenInterestChart === 'function';
  const canRenderDelta = typeof DeltaChart === 'function';

  // Fallback component for any missing charts
  const FallbackChart = ({ label }: { label: string }) => (
    <div className="bg-[#131722] text-white p-4 h-full flex items-center justify-center">
      <div className="text-center">
        <p>{label} component unavailable</p>
        <p className="text-xs text-gray-400">Check console for import errors</p>
      </div>
    </div>
  );

  // Ensure we have data before rendering
  const hasDeltaData = Array.isArray(deltaData) && deltaData.length > 0;
  const hasOpenInterestData = Array.isArray(openInterestData) && openInterestData.length > 0;

  // Generate derived datasets from deltaData for different chart types
  // This creates three distinct datasets from our single source
  const { spotDeltaData, perpsDeltaData, cvdDeltaData } = useMemo(() => {
    if (!hasDeltaData) return { spotDeltaData: [], perpsDeltaData: [], cvdDeltaData: [] };
    
    // For spot - just use the original data
    const spotData = [...deltaData];
    
    // For perps - Use blue color for positive values
    const perpsData = deltaData.map(item => ({
      ...item,
      color: item.color.includes('red') || 
             (item.color.toLowerCase().includes('ff') && !item.color.toLowerCase().includes('00ff')) 
               ? '#FF3A5C' : '#00A3FF' // Blue for positive values
    }));

    // For CVD - Generate cumulative data
    let sum = 0;
    const cvdData = deltaData.map(item => {
      const isNegative = item.color.includes('red') || 
                         (item.color.toLowerCase().includes('ff') && !item.color.toLowerCase().includes('00ff'));
      const multiplier = isNegative ? -1 : 1;
      sum += item.value * multiplier;
      return {
        time: item.time,
        value: sum,
        color: sum >= 0 ? '#7E57C2' : '#673AB7' // Purple colors for CVD
      };
    });

    return { spotDeltaData: spotData, perpsDeltaData: perpsData, cvdDeltaData: cvdData };
  }, [deltaData, hasDeltaData]);

  return (
    <div className="relative flex flex-col" style={{ minHeight: "1100px" }}>
      {/* Main Chart Container - This stays fixed at the top */}
      <div className="sticky top-0 z-10 bg-[#0f172a] pb-4">
        <div className="candlestick-chart-wrapper border border-[#2a2e39] bg-[#131722] rounded-md overflow-hidden" style={{ height: '500px' }}>
          {canRenderCandlestick ? (
            <CandlestickChart
              candles={candles}
              volumeData={deltaData}
              openInterestData={openInterestData}
              isAggregated={isAggregated}
              interval={interval}
              showOpenInterest={showOpenInterest}
            />
          ) : (
            <FallbackChart label="Candlestick Chart" />
          )}
        </div>
      </div>

      {/* Delta Charts Section - This scrolls with explicit styling to ensure visibility */}
      <div className="delta-charts-section" style={{ paddingTop: "16px", paddingBottom: "40px", overflow: "visible" }}>
        {/* Delta Spot Panel with clear label */}
        {hasDeltaData && (
          <div className="chart-panel" style={{ 
            height: '240px', 
            minHeight: '240px',
            marginBottom: '24px',
            border: '1px solid #2a2e39',
            borderRadius: '4px',
            backgroundColor: '#131722',
            overflow: 'hidden',
            display: 'block',
            visibility: 'visible',
            opacity: 1,
            width: '100%'
          }}>
            {/* Explicit panel header with distinct branding */}
            <div style={{
              height: '40px',
              backgroundColor: '#131722',
              borderBottom: '1px solid #2a2e39',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ 
                  color: '#ffffff', 
                  fontWeight: 'bold', 
                  fontSize: '14px' 
                }}>DELTA SPOT</span>
              </div>
              <div style={{ 
                backgroundColor: 'rgba(0, 230, 118, 0.1)', 
                color: '#00E676', 
                padding: '2px 8px', 
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>SPOT</div>
            </div>
            <div style={{ height: 'calc(100% - 40px)' }}>
              {canRenderDelta && (
                <DeltaChart 
                  data={spotDeltaData} 
                  type="spot" 
                  height={200}
                  cumulative={false}
                />
              )}
            </div>
          </div>
        )}
        
        {/* Delta Perps Panel with clear label */}
        {hasDeltaData && (
          <div className="chart-panel" style={{ 
            height: '240px', 
            minHeight: '240px',
            marginBottom: '24px',
            border: '1px solid #2a2e39',
            borderRadius: '4px',
            backgroundColor: '#131722',
            overflow: 'hidden',
            display: 'block',
            visibility: 'visible',
            opacity: 1,
            width: '100%'
          }}>
            {/* Explicit panel header with distinct branding */}
            <div style={{
              height: '40px',
              backgroundColor: '#131722',
              borderBottom: '1px solid #2a2e39',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ 
                  color: '#ffffff', 
                  fontWeight: 'bold', 
                  fontSize: '14px' 
                }}>DELTA PERPETUALS</span>
              </div>
              <div style={{ 
                backgroundColor: 'rgba(0, 163, 255, 0.1)', 
                color: '#00A3FF', 
                padding: '2px 8px', 
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>PERP</div>
            </div>
            <div style={{ height: 'calc(100% - 40px)' }}>
              {canRenderDelta && (
                <DeltaChart 
                  data={perpsDeltaData} 
                  type="perps" 
                  height={200}
                  cumulative={false}
                />
              )}
            </div>
          </div>
        )}
        
        {/* CVD Panel with clear label */}
        {hasDeltaData && (
          <div className="chart-panel" style={{ 
            height: '240px', 
            minHeight: '240px',
            marginBottom: '24px',
            border: '1px solid #2a2e39',
            borderRadius: '4px',
            backgroundColor: '#131722',
            overflow: 'hidden',
            display: 'block',
            visibility: 'visible',
            opacity: 1,
            width: '100%'
          }}>
            {/* Explicit panel header with distinct branding */}
            <div style={{
              height: '40px',
              backgroundColor: '#131722',
              borderBottom: '1px solid #2a2e39',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ 
                  color: '#ffffff', 
                  fontWeight: 'bold', 
                  fontSize: '14px' 
                }}>CUMULATIVE VOLUME DELTA</span>
              </div>
              <div style={{ 
                backgroundColor: 'rgba(126, 87, 194, 0.1)', 
                color: '#7E57C2', 
                padding: '2px 8px', 
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>CVD</div>
            </div>
            <div style={{ height: 'calc(100% - 40px)' }} id="cvd-chart-container">
              {canRenderDelta && (
                <DeltaChart 
                  data={cvdDeltaData} 
                  type="cvd" 
                  height={200}
                  cumulative={true}
                />
              )}
            </div>
          </div>
        )}
        
        {/* Footer space to ensure scrolling works */}
        <div className="h-16"></div>
      </div>
    </div>
  );
};

export default ChartPanelGroup;