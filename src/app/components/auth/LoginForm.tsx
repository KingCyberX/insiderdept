// src/components/auth/LoginForm.tsx
import React, { useState } from 'react';
import authService from '../../services/authService';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    
    try {
      const success = await authService.login(email, password);
      
      if (success) {
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setErrorMessage('Login failed. Please check your credentials.');
      }
    } catch {
      // No parameter defined in the catch block
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="bg-[#131722] border border-[#2a2e39] rounded-lg p-6 shadow-lg w-full max-w-md mx-auto">
      <h2 className="text-2xl font-semibold text-white mb-6">Log In</h2>
      
      {errorMessage && (
        <div className="mb-4 p-3 bg-[#331c1f] text-[#ff5370] border border-[#582a34] rounded-md text-sm">
          {errorMessage}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="email" className="block text-[#afb5c4] mb-2">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full p-3 bg-[#1c2030] border border-[#2a2e39] rounded-md text-white focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff]"
            placeholder="Enter your email"
          />
        </div>
        
        <div className="mb-6">
          <label htmlFor="password" className="block text-[#afb5c4] mb-2">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full p-3 bg-[#1c2030] border border-[#2a2e39] rounded-md text-white focus:outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff]"
            placeholder="Enter your password"
          />
        </div>
        
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#2962ff] hover:bg-[#1e53e5] text-white py-3 px-4 rounded-md transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-r-2 border-white mr-2"></span>
              Logging in...
            </span>
          ) : (
            'Log In'
          )}
        </button>
      </form>
      
      <div className="mt-4 text-center text-[#afb5c4]">
        Don&apos;t have an account?{' '}
        <button
          onClick={onSwitchToRegister}
          className="text-[#2962ff] hover:underline"
        >
          Sign up
        </button>
      </div>
    </div>
  );
};

export default LoginForm;