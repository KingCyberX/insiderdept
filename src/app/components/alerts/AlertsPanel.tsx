// src/components/alerts/AlertsPanel.tsx
import React, { useState, useEffect } from 'react';
import { AlertCondition, AlertEvent } from '../../types/alerts';
import alertService from '../../services/alertService';
import AlertsList from './AlertsList';
import AlertsForm from './AlertsForm';

const AlertsPanel: React.FC = () => {
  const [conditions, setConditions] = useState<AlertCondition[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'alerts' | 'settings'>('alerts');
  
  useEffect(() => {
    // Load initial data
    setConditions(alertService.getConditions());
    setEvents(alertService.getEvents());
    
    // Set up event listener for new alerts
    const handleNewAlert = (event: AlertEvent) => {
      setEvents(prevEvents => [event, ...prevEvents]);
    };
    
    alertService.addEventListener(handleNewAlert);
    
    return () => {
      alertService.removeEventListener(handleNewAlert);
    };
  }, []);
  
  const handleAddCondition = (symbol: string, type: 'volumeSpike' | 'deltaSpike', threshold: number) => {
    const newCondition = alertService.addCondition(symbol, type, threshold);
    setConditions(prev => [...prev, newCondition]);
  };
  
  const handleUpdateCondition = (id: string, active: boolean) => {
    alertService.updateCondition(id, { active });
    setConditions(alertService.getConditions());
  };
  
  const handleDeleteCondition = (id: string) => {
    alertService.deleteCondition(id);
    setConditions(alertService.getConditions());
  };
  
  const handleMarkAllSeen = () => {
    alertService.markAllEventsSeen();
    setEvents(alertService.getEvents());
  };
  
  const handleClearAlerts = () => {
    alertService.clearAllEvents();
    setEvents([]);
  };
  
  return (
    <div className="bg-[#131722] border border-[#2a2e39] rounded-lg overflow-hidden shadow-lg">
      <div className="border-b border-[#2a2e39] p-4">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-4 py-2 rounded ${
              activeTab === 'alerts'
                ? 'bg-[#2962ff] text-white'
                : 'bg-[#1c2030] text-[#afb5c4] hover:bg-[#262b3c]'
            }`}
          >
            Alerts {events.filter(e => !e.seen).length > 0 && 
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {events.filter(e => !e.seen).length}
              </span>
            }
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded ${
              activeTab === 'settings'
                ? 'bg-[#2962ff] text-white'
                : 'bg-[#1c2030] text-[#afb5c4] hover:bg-[#262b3c]'
            }`}
          >
            Settings
          </button>
        </div>
      </div>
      
      <div className="p-4">
        {activeTab === 'alerts' ? (
          <AlertsList 
            events={events} 
            onMarkAllSeen={handleMarkAllSeen} 
            onClearAlerts={handleClearAlerts} 
          />
        ) : (
          <AlertsForm 
            conditions={conditions} 
            onAddCondition={handleAddCondition}
            onUpdateCondition={handleUpdateCondition}
            onDeleteCondition={handleDeleteCondition}
          />
        )}
      </div>
    </div>
  );
};

export default AlertsPanel;