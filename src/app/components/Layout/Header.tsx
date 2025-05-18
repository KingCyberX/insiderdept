import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import authService from '../../services/authService';
import AuthModal from '../auth/AuthModal';

const Header: React.FC = () => {
  const pathname = usePathname();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{id: string, email: string, displayName: string} | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  
  useEffect(() => {
    const unsubscribe = authService.subscribe(state => {
      setIsAuthenticated(state.isAuthenticated);
      setUser(state.user);
    });
    
    return unsubscribe;
  }, []);
  
  const handleLogout = () => {
    authService.logout();
    setShowUserMenu(false);
  };
  
  return (
    <header className="bg-[#131722] border-b border-[#2a2e39] px-6 py-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center">
          <Link href="/" className="text-white text-2xl font-extrabold mr-8">
            ATP Chart
          </Link>
          
          <nav className="hidden md:flex space-x-8">
            <Link 
              href="/chart" 
              className={`text-sm ${pathname === '/chart' ? 'text-white border-b-2 border-[#2962ff] pb-1' : 'text-[#afb5c4] hover:text-white'} transition-colors`}
            >
              Home
            </Link>
            <Link 
              href="/mylist" 
              className={`text-sm ${pathname === '/mylist' ? 'text-white border-b-2 border-[#2962ff] pb-1' : 'text-[#afb5c4] hover:text-white'} transition-colors`}
            >
              My List
            </Link>
            <Link 
              href="/alerts" 
              className={`text-sm ${pathname === '/alerts' ? 'text-white border-b-2 border-[#2962ff] pb-1' : 'text-[#afb5c4] hover:text-white'} transition-colors`}
            >
              Alerts
            </Link>
            <Link 
              href="/screener" 
              className={`text-sm ${pathname === '/screener' ? 'text-white border-b-2 border-[#2962ff] pb-1' : 'text-[#afb5c4] hover:text-white'} transition-colors`}
            >
              Screener
            </Link>
          </nav>
        </div>
        
        <div className="flex items-center">
          {isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center text-white hover:text-[#2962ff] transition-colors focus:outline-none"
              >
                <span className="bg-[#2962ff] rounded-full w-9 h-9 flex items-center justify-center text-white font-medium mr-2">
                  {user?.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="mr-1">{user?.displayName}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-[#1c2030] border border-[#2a2e39] rounded-md shadow-lg z-10">
                  <div className="py-1">
                    <Link 
                      href="/settings" 
                      className="block px-4 py-2 text-sm text-[#afb5c4] hover:bg-[#262b3c] hover:text-white"
                      onClick={() => setShowUserMenu(false)}
                    >
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-[#afb5c4] hover:bg-[#262b3c] hover:text-white"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="bg-[#2962ff] hover:bg-[#1e53e5] text-white px-5 py-2 rounded text-sm transition-colors"
            >
              Login
            </button>
          )}
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <div className="md:hidden mt-3 pb-2 border-t border-[#2a2e39] pt-3">
        <nav className="flex justify-around">
          <Link 
            href="/chart" 
            className={`text-sm ${pathname === '/chart' ? 'text-white' : 'text-[#afb5c4]'} flex flex-col items-center`}
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Home
          </Link>
          <Link 
            href="/mylist" 
            className={`text-sm ${pathname === '/mylist' ? 'text-white' : 'text-[#afb5c4]'} flex flex-col items-center`}
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            My List
          </Link>
          <Link 
            href="/alerts" 
            className={`text-sm ${pathname === '/alerts' ? 'text-white' : 'text-[#afb5c4]'} flex flex-col items-center`}
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            Alerts
          </Link>
          <Link 
            href="/screener" 
            className={`text-sm ${pathname === '/screener' ? 'text-white' : 'text-[#afb5c4]'} flex flex-col items-center`}
          >
            <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Screener
          </Link>
        </nav>
      </div>
      
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </header>
  );
};

export default Header;