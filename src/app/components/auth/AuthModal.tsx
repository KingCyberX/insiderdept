// src/components/auth/AuthModal.tsx
import React, { useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [showLogin, setShowLogin] = useState(true);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md p-2 mx-auto">
        <div className="bg-[#131722] border border-[#2a2e39] rounded-lg shadow-xl overflow-hidden">
          <div className="flex justify-end p-2">
            <button
              onClick={onClose}
              className="text-[#7f8596] hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="p-6">
            {showLogin ? (
              <LoginForm
                onSuccess={onClose}
                onSwitchToRegister={() => setShowLogin(false)}
              />
            ) : (
              <RegisterForm
                onSuccess={onClose}
                onSwitchToLogin={() => setShowLogin(true)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;