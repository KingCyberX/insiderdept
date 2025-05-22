// src/components/alerts/AlertsList.tsx
import React from 'react';
import { AlertEvent } from '../../types/alerts';

interface AlertsListProps {
  events: AlertEvent[];
  onMarkAllSeen: () => void;
  onClearAlerts: () => void;
}

const AlertsList: React.FC<AlertsListProps> = ({ 
  events, 
  onMarkAllSeen, 
  onClearAlerts 
}) => {
  if (events.length === 0) {
    return (
      <div className="bg-[#1c2030] rounded-md p-8 text-center">
        <p className="text-[#afb5c4] text-lg mb-4">No alerts yet</p>
        <p className="text-[#7f8596]">Configure alert conditions in the Settings tab</p>
      </div>
    );
  }
  
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };
  
  const getAlertTypeLabel = (type: string) => {
    switch (type) {
      case 'volumeSpike': return 'Volume Spike';
      case 'deltaSpike': return 'Delta Spike';
      default: return type;
    }
  };
  
  return (
    <div>
      <div className="flex justify-between mb-4">
        <h2 className="text-white text-lg font-medium">Recent Alerts</h2>
        <div className="space-x-2">
          <button
            onClick={onMarkAllSeen}
            className="bg-[#1c2030] hover:bg-[#262b3c] text-[#afb5c4] px-3 py-1 rounded-md text-sm"
          >
            Mark All Read
          </button>
          <button
            onClick={onClearAlerts}
            className="bg-[#331c1f] hover:bg-[#582a34] text-[#ff5370] px-3 py-1 rounded-md text-sm"
          >
            Clear All
          </button>
        </div>
      </div>
      
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {events.map(event => (
          <div 
            key={event.id}
            className={`p-4 rounded-md ${
              event.seen ? 'bg-[#1c2030]' : 'bg-[#1c293a] border-l-4 border-[#2962ff]'
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-white font-medium">{event.symbol}</div>
                <div className="text-[#afb5c4] text-sm">
                  {getAlertTypeLabel(event.type)} alert triggered
                </div>
              </div>
              <div className="text-[#7f8596] text-xs">
                {formatTime(event.timestamp)}
                <br />
                {formatDate(event.timestamp)}
              </div>
            </div>
            
            <div className="mt-2 text-sm">
              <div className="text-[#afb5c4]">
                Threshold: {event.threshold}% | Actual: {event.value.toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AlertsList;