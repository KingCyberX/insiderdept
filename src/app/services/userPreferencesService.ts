import authService from './authService';
import { Exchange } from '../types/market';

export interface UserPreferences {
  watchlist: string[];
  darkMode: boolean;
  defaultInterval: string;
  defaultSymbol: string;
  defaultExchange: Exchange;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  watchlist: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'],
  darkMode: true,
  defaultInterval: '1m',
  defaultSymbol: 'BTCUSDT',
  defaultExchange: 'Binance'
};

class UserPreferencesService {
  private preferences: UserPreferences = { ...DEFAULT_PREFERENCES };
  private listeners: ((prefs: UserPreferences) => void)[] = [];
  
  constructor() {
    // Load preferences on init
    this.loadPreferences();
    
    // Subscribe to auth changes to load preferences when user logs in
    authService.subscribe(state => {
      if (state.isAuthenticated && state.user) {
        this.loadPreferences();
      } else if (!state.isAuthenticated) {
        // Reset to defaults when logged out
        this.preferences = { ...DEFAULT_PREFERENCES };
        this.notifyListeners();
      }
    });
  }
  
  private loadPreferences(): void {
    const userId = authService.getState().user?.id;
    
    if (!userId) {
      this.preferences = { ...DEFAULT_PREFERENCES };
      this.notifyListeners();
      return;
    }
    
    try {
      const stored = localStorage.getItem(`prefs_${userId}`);
      
      if (stored) {
        this.preferences = {
          ...DEFAULT_PREFERENCES,
          ...JSON.parse(stored)
        };
      } else {
        this.preferences = { ...DEFAULT_PREFERENCES };
      }
      
      this.notifyListeners();
    } catch {
      this.preferences = { ...DEFAULT_PREFERENCES };
      this.notifyListeners();
    }
  }
  
  private savePreferences(): void {
    const userId = authService.getState().user?.id;
    
    if (!userId) return;
    
    try {
      localStorage.setItem(`prefs_${userId}`, JSON.stringify(this.preferences));
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  }
  
  getPreferences(): UserPreferences {
    return { ...this.preferences };
  }
  
  updatePreferences(updates: Partial<UserPreferences>): void {
    this.preferences = {
      ...this.preferences,
      ...updates
    };
    
    this.savePreferences();
    this.notifyListeners();
  }
  
  // Watchlist specific methods
  getWatchlist(): string[] {
    return [...this.preferences.watchlist];
  }
  
  addToWatchlist(symbol: string): boolean {
    // Don't add if already in watchlist
    if (this.preferences.watchlist.includes(symbol)) {
      return false;
    }
    
    this.preferences.watchlist.push(symbol);
    this.savePreferences();
    this.notifyListeners();
    return true;
  }
  
  removeFromWatchlist(symbol: string): boolean {
    const initialLength = this.preferences.watchlist.length;
    this.preferences.watchlist = this.preferences.watchlist.filter(s => s !== symbol);
    
    if (initialLength !== this.preferences.watchlist.length) {
      this.savePreferences();
      this.notifyListeners();
      return true;
    }
    
    return false;
  }
  
  // Exchange preferences
  getDefaultExchange(): Exchange {
    return this.preferences.defaultExchange;
  }
  
  setDefaultExchange(exchange: Exchange): void {
    this.preferences.defaultExchange = exchange;
    this.savePreferences();
    this.notifyListeners();
  }
  
  // Subscribe to preference changes
  subscribe(listener: (prefs: UserPreferences) => void): () => void {
    this.listeners.push(listener);
    
    // Immediately notify with current preferences
    listener({ ...this.preferences });
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  private notifyListeners(): void {
    const prefs = { ...this.preferences };
    this.listeners.forEach(listener => listener(prefs));
  }
}

const userPreferencesService = new UserPreferencesService();
export default userPreferencesService;