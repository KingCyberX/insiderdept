"use client";

import React, { useState, useEffect } from 'react';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

// Stub components - modified to be empty
const Header = () => null;
const Footer = () => null;

// Define user preferences interface
interface UserPreferences {
  darkMode: boolean;
}

// Stub userPreferencesService
const userPreferencesService = {
  subscribe: (callback: (prefs: UserPreferences) => void) => {
    callback({ darkMode: true });
    return () => {};
  }
};

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  
  // Fix for hydration mismatch - only render client-specific content after mount
  useEffect(() => {
    setMounted(true);
    
    const unsubscribe = userPreferencesService.subscribe((prefs: UserPreferences) => {
      setDarkMode(prefs.darkMode);
    });
    
    return unsubscribe;
  }, []);
  
  // Only render client-specific content when the component is mounted
  const appClasses = mounted 
    ? `${inter.className} ${darkMode ? 'bg-[#0b0e11] text-white' : 'bg-[#f5f5f5] text-[#333]'} min-h-screen flex flex-col`
    : `${inter.className} min-h-screen flex flex-col`;
  
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>ATP Chart - Real-Time Cryptocurrency Trading Charts</title>
        <meta name="description" content="Professional-grade cryptocurrency trading charts with real-time updates, delta volume, and open interest tracking." />
      </head>
      <body className={appClasses}>
        {mounted && (
          <>
            <Header />
            <main className="flex-grow" style={{ padding: 0, margin: 0 }}>
              {children}
            </main>
            <Footer />
          </>
        )}
        {!mounted && (
          <div className="flex-grow"></div>
        )}
      </body>
    </html>
  );
}