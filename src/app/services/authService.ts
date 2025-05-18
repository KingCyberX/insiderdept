// src/services/authService.ts
interface User {
  id: string;
  email: string;
  displayName: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

class AuthService {
  private authState: AuthState = {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null
  };
  
  private listeners: ((state: AuthState) => void)[] = [];
  
  constructor() {
    // Check for existing session
    this.checkExistingSession();
  }
  
  private checkExistingSession(): void {
    const storedUser = localStorage.getItem('user');
    
    if (storedUser) {
      try {
        this.authState = {
          user: JSON.parse(storedUser),
          isAuthenticated: true,
          isLoading: false,
          error: null
        };
      } catch {
        this.authState = {
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null
        };
      }
    } else {
      this.authState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      };
    }
    
    this.notifyListeners();
  }
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async login(email: string, password: string): Promise<boolean> {
    this.authState = {
      ...this.authState,
      isLoading: true,
      error: null
    };
    
    this.notifyListeners();
    
    try {
      // Simulated API call - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For demo, accept any email/password
      // In a real app, you'd validate credentials with a backend
      const user: User = {
        id: Date.now().toString(),
        email,
        displayName: email.split('@')[0]
      };
      
      this.authState = {
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null
      };
      
      // Store in localStorage for persistence
      localStorage.setItem('user', JSON.stringify(user));
      
      this.notifyListeners();
      return true;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.authState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: 'Login failed. Please check your credentials.'
      };
      
      this.notifyListeners();
      return false;
    }
  }
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async register(email: string, password: string): Promise<boolean> {
    this.authState = {
      ...this.authState,
      isLoading: true,
      error: null
    };
    
    this.notifyListeners();
    
    try {
      // Simulated API call - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For demo, accept any email/password
      // In a real app, you'd register with a backend
      const user: User = {
        id: Date.now().toString(),
        email,
        displayName: email.split('@')[0]
      };
      
      this.authState = {
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null
      };
      
      // Store in localStorage for persistence
      localStorage.setItem('user', JSON.stringify(user));
      
      this.notifyListeners();
      return true;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.authState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: 'Registration failed. Please try again.'
      };
      
      this.notifyListeners();
      return false;
    }
  }
  
  logout(): void {
    localStorage.removeItem('user');
    
    this.authState = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    };
    
    this.notifyListeners();
  }
  
  getState(): AuthState {
    return { ...this.authState };
  }
  
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener);
    
    // Immediately notify with current state
    listener({ ...this.authState });
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  private notifyListeners(): void {
    const state = { ...this.authState };
    this.listeners.forEach(listener => listener(state));
  }
}

const authService = new AuthService();
export default authService;