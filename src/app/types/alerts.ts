// src/types/alerts.ts
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