// src/app/services/alertService.ts
// Instead of using uuid, we'll create a simple ID generator
// Remove import { v4 as uuidv4 } from 'uuid';

import { Candle, DeltaVolume } from '../types/market';

// Simple ID generator function to replace uuid
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

export type AlertType = 'volumeSpike' | 'deltaSpike';

export interface AlertCondition {
  id: string;
  symbol: string;
  type: AlertType;
  threshold: number; // Percentage threshold
  active: boolean;
  createdAt: number;
}

export interface AlertEvent {
  id: string;
  conditionId: string;
  symbol: string;
  type: AlertType;
  value: number; // Actual value that triggered alert
  threshold: number; // Threshold that was exceeded
  timestamp: number;
  seen: boolean;
}

class AlertService {
  private conditions: AlertCondition[] = [];
  private events: AlertEvent[] = [];
  private listeners: ((event: AlertEvent) => void)[] = [];
  
  // Load saved alerts from localStorage
  constructor() {
    this.loadFromStorage();
  }
  
  private loadFromStorage(): void {
    try {
      const savedConditions = localStorage.getItem('alertConditions');
      const savedEvents = localStorage.getItem('alertEvents');
      
      if (savedConditions) {
        this.conditions = JSON.parse(savedConditions);
      }
      
      if (savedEvents) {
        this.events = JSON.parse(savedEvents);
      }
    } catch (error) {
      console.error('Failed to load alerts from storage:', error);
    }
  }
  
  private saveToStorage(): void {
    try {
      localStorage.setItem('alertConditions', JSON.stringify(this.conditions));
      localStorage.setItem('alertEvents', JSON.stringify(this.events));
    } catch (error) {
      console.error('Failed to save alerts to storage:', error);
    }
  }
  
  // Add a new alert condition
  addCondition(symbol: string, type: AlertType, threshold: number): AlertCondition {
    const newCondition: AlertCondition = {
      id: generateId(),
      symbol,
      type,
      threshold,
      active: true,
      createdAt: Date.now()
    };
    
    this.conditions.push(newCondition);
    this.saveToStorage();
    
    return newCondition;
  }
  
  // Update an existing alert condition
  updateCondition(id: string, updates: Partial<Omit<AlertCondition, 'id' | 'createdAt'>>): boolean {
    const index = this.conditions.findIndex(c => c.id === id);
    
    if (index === -1) return false;
    
    this.conditions[index] = {
      ...this.conditions[index],
      ...updates
    };
    
    this.saveToStorage();
    return true;
  }
  
  // Delete an alert condition
  deleteCondition(id: string): boolean {
    const initialLength = this.conditions.length;
    this.conditions = this.conditions.filter(c => c.id !== id);
    
    if (initialLength !== this.conditions.length) {
      this.saveToStorage();
      return true;
    }
    
    return false;
  }
  
  // Get all alert conditions
  getConditions(): AlertCondition[] {
    return [...this.conditions];
  }
  
  // Get active alert conditions for a specific symbol
  getActiveConditionsForSymbol(symbol: string): AlertCondition[] {
    return this.conditions.filter(c => c.symbol === symbol && c.active);
  }
  
  // Get all alert events
  getEvents(): AlertEvent[] {
    return [...this.events];
  }
  
  // Mark an alert event as seen
  markEventAsSeen(id: string): boolean {
    const event = this.events.find(e => e.id === id);
    
    if (!event) return false;
    
    event.seen = true;
    this.saveToStorage();
    
    return true;
  }
  
  // Mark all events as seen
  markAllEventsSeen(): void {
    this.events.forEach(event => {
      event.seen = true;
    });
    
    this.saveToStorage();
  }
  
  // Delete an alert event
  deleteEvent(id: string): boolean {
    const initialLength = this.events.length;
    this.events = this.events.filter(e => e.id !== id);
    
    if (initialLength !== this.events.length) {
      this.saveToStorage();
      return true;
    }
    
    return false;
  }
  
  // Clear all events
  clearAllEvents(): void {
    this.events = [];
    this.saveToStorage();
  }
  
  // Check for volume spike alerts
  checkVolumeSpike(symbol: string, candles: Candle[]): void {
    if (candles.length < 2) return;
    
    const conditions = this.getActiveConditionsForSymbol(symbol)
      .filter(c => c.type === 'volumeSpike');
    
    if (conditions.length === 0) return;
    
    const latestCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];
    
    const volumePercentChange = ((latestCandle.volume - previousCandle.volume) / previousCandle.volume) * 100;
    
    conditions.forEach(condition => {
      if (volumePercentChange >= condition.threshold) {
        this.triggerAlert(condition, volumePercentChange);
      }
    });
  }
  
  // Check for delta spike alerts
  checkDeltaSpike(symbol: string, deltaVolumes: DeltaVolume[]): void {
    if (deltaVolumes.length < 2) return;
    
    const conditions = this.getActiveConditionsForSymbol(symbol)
      .filter(c => c.type === 'deltaSpike');
    
    if (conditions.length === 0) return;
    
    const latestDelta = deltaVolumes[deltaVolumes.length - 1];
    const previousDelta = deltaVolumes[deltaVolumes.length - 2];
    
    const deltaPercentChange = ((latestDelta.value - previousDelta.value) / previousDelta.value) * 100;
    
    conditions.forEach(condition => {
      if (deltaPercentChange >= condition.threshold) {
        this.triggerAlert(condition, deltaPercentChange);
      }
    });
  }
  
  // Trigger an alert
  private triggerAlert(condition: AlertCondition, value: number): void {
    const newEvent: AlertEvent = {
      id: generateId(),
      conditionId: condition.id,
      symbol: condition.symbol,
      type: condition.type,
      value,
      threshold: condition.threshold,
      timestamp: Date.now(),
      seen: false
    };
    
    this.events.push(newEvent);
    this.saveToStorage();
    
    // Play sound (if browser supports it)
    this.playAlertSound();
    
    // Notify listeners
    this.notifyListeners(newEvent);
  }
  
  // Play alert sound
  private playAlertSound(): void {
    try {
      const audio = new Audio('/alert.mp3');
      // Use promise.catch without saving the error to a variable
      audio.play().catch(() => console.log('Audio playback prevented'));
    } catch {
      console.log('Unable to play alert sound');
    }
  }
  
  // Add event listener
  addEventListener(listener: (event: AlertEvent) => void): void {
    this.listeners.push(listener);
  }
  
  // Remove event listener
  removeEventListener(listener: (event: AlertEvent) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }
  
  // Notify listeners of new alert event
  private notifyListeners(event: AlertEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch {
        // Removed the unused parameter
        console.error('Error in alert listener');
      }
    });
  }
}

const alertService = new AlertService();
export default alertService;