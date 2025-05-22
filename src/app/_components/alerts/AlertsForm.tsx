// src/components/alerts/AlertsForm.tsx
import React, { useState } from 'react';
import { AlertCondition, AlertType } from '../../types/alerts';

interface AlertsFormProps {
  conditions: AlertCondition[];
  onAddCondition: (symbol: string, type: AlertType, threshold: number) => void;
  onUpdateCondition: (id: string, active: boolean) => void;
  onDeleteCondition: (id: string) => void;
}

const AlertsForm: React.FC<AlertsFormProps> = ({
  conditions,
  onAddCondition,
  onUpdateCondition,
  onDeleteCondition
}) => {
  const [symbol, setSymbol] = useState('');
  const [alertType, setAlertType] = useState<AlertType>('volumeSpike');
  const [threshold, setThreshold] = useState(20);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    if (!symbol.trim()) {
      setErrorMessage('Please enter a symbol');
      return;
    }
    
    if (threshold <= 0) {
      setErrorMessage('Threshold must be greater than 0');
      return;
    }
    
    // Add the condition
    onAddCondition(symbol.toUpperCase(), alertType, threshold);
    
    // Reset form
    setSymbol('');
    setThreshold(20);
    setErrorMessage(null);
  };
  
  const formatConditionType = (type: string) => {
    switch (type) {
      case 'volumeSpike': return 'Volume Spike';
      case 'deltaSpike': return 'Delta Spike';
      default: return type;
    }
  };
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <div>
      <h2 className="text-white text-lg font-medium mb-4">Alert Settings</h2>
      
      <form onSubmit={handleSubmit} className="bg-[#1c2030] p-4 rounded-md mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="symbol" className="block text-[#afb5c4] mb-1 text-sm">Symbol</label>
            <input
              id="symbol"
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. BTCUSDT"
              className="w-full p-2 bg-[#131722] border border-[#2a2e39] rounded-md text-white focus:outline-none focus:border-[#2962ff]"
            />
          </div>
          
          <div>
            <label htmlFor="alertType" className="block text-[#afb5c4] mb-1 text-sm">Alert Type</label>
            <select
              id="alertType"
              value={alertType}
              onChange={(e) => setAlertType(e.target.value as AlertType)}
              className="w-full p-2 bg-[#131722] border border-[#2a2e39] rounded-md text-white focus:outline-none focus:border-[#2962ff]"
            >
              <option value="volumeSpike">Volume Spike</option>
              <option value="deltaSpike">Delta Spike</option>
            </select>
          </div>
        </div>
        
        <div className="mb-4">
          <label htmlFor="threshold" className="block text-[#afb5c4] mb-1 text-sm">
            Threshold ({threshold}%)
          </label>
          <input
            id="threshold"
            type="range"
            min="1"
            max="100"
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-[#7f8596]">
            <span>1%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
        
        {errorMessage && (
          <div className="mb-4 p-2 bg-[#331c1f] text-[#ff5370] border border-[#582a34] rounded-md text-sm">
            {errorMessage}
          </div>
        )}
        
        <button
          type="submit"
          className="bg-[#2962ff] hover:bg-[#1e53e5] text-white px-4 py-2 rounded-md transition-colors"
        >
          Add Alert
        </button>
      </form>
      
      <h3 className="text-white font-medium mb-2">Your Alert Conditions</h3>
      
      {conditions.length === 0 ? (
        <div className="bg-[#1c2030] rounded-md p-4 text-center text-[#afb5c4]">
          No alert conditions set up yet
        </div>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {conditions.map(condition => (
            <div key={condition.id} className="bg-[#1c2030] p-3 rounded-md">
              <div className="flex justify-between">
                <div>
                  <span className="text-white font-medium">{condition.symbol}</span>
                  <span className="text-[#afb5c4] ml-2">
                    {formatConditionType(condition.type)}
                  </span>
                </div>
                <div className="flex items-center">
                  <label className="inline-flex items-center mr-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={condition.active}
                      onChange={(e) => onUpdateCondition(condition.id, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-10 h-5 bg-[#262b3c] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#2962ff]"></div>
                  </label>
                  <button
                    onClick={() => onDeleteCondition(condition.id)}
                    className="text-[#7f8596] hover:text-[#ff5370]"
                    aria-label="Delete condition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="mt-1 flex justify-between text-sm">
                <div className="text-[#afb5c4]">
                  Threshold: <span className="text-white">{condition.threshold}%</span>
                </div>
                <div className="text-[#7f8596]">
                  Created: {formatDate(condition.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertsForm;