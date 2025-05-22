import React from 'react';
import { Exchange } from '../../types/market';

interface ExchangeFeature {
  name: string;
  description: string;
  supportedBy: Exchange[];
}

const ExchangeFeatures: React.FC = () => {
  const features: ExchangeFeature[] = [
    {
      name: 'Spot Trading',
      description: 'View spot market price data',
      supportedBy: ['Binance', 'OKX', 'Bybit', 'MEXC']
    },
    {
      name: 'Futures Trading',
      description: 'View futures contract price data',
      supportedBy: ['Binance', 'OKX', 'Bybit']
    },
    {
      name: 'Open Interest',
      description: 'View open interest data for futures contracts',
      supportedBy: ['Binance', 'Bybit']
    },
    {
      name: 'WebSocket Real-time Updates',
      description: 'Real-time price updates via WebSocket connection',
      supportedBy: ['Binance', 'OKX', 'Bybit', 'MEXC']
    },
    {
      name: 'Delta Volume',
      description: 'Volume-weighted price change indicator',
      supportedBy: ['Binance', 'OKX', 'Bybit', 'MEXC']
    }
  ];
  
  return (
    <div className="bg-[#131722] border border-[#2a2e39] rounded-lg overflow-hidden shadow-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-4">Exchange Feature Support</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#1c2030] text-[#afb5c4]">
              <th className="px-4 py-3 text-left">Feature</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-left">Binance</th>
              <th className="px-4 py-3 text-left">OKX</th>
              <th className="px-4 py-3 text-left">Bybit</th>
              <th className="px-4 py-3 text-left">MEXC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2e39]">
            {features.map((feature) => (
              <tr key={feature.name} className="hover:bg-[#1c2030]">
                <td className="px-4 py-3 text-white">{feature.name}</td>
                <td className="px-4 py-3 text-[#afb5c4]">{feature.description}</td>
                <td className="px-4 py-3">
                  {feature.supportedBy.includes('Binance') ? (
                    <span className="text-green-500">✓</span>
                  ) : (
                    <span className="text-red-500">✗</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {feature.supportedBy.includes('OKX') ? (
                    <span className="text-green-500">✓</span>
                  ) : (
                    <span className="text-red-500">✗</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {feature.supportedBy.includes('Bybit') ? (
                    <span className="text-green-500">✓</span>
                  ) : (
                    <span className="text-red-500">✗</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {feature.supportedBy.includes('MEXC') ? (
                    <span className="text-green-500">✓</span>
                  ) : (
                    <span className="text-red-500">✗</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExchangeFeatures;