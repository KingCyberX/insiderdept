"use client";

import React from 'react';

interface ConnectionStatusProps {
  isLoading: boolean;
  isConnected: boolean;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isLoading,
  isConnected
}) => {
  return (
    <div className="flex items-center">
      {isLoading && (
        <div className="flex items-center text-sm text-[#afb5c4]">
          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-r-2 border-[#2962ff] mr-2"></div>
          Loading...
        </div>
      )}
      
      {!isLoading && (
        <div className={`flex items-center text-sm ${isConnected ? 'text-green-500' : 'text-[#afb5c4]'}`}>
          <div className={`h-2 w-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`}></div>
          {isConnected ? 'Live' : 'Connecting...'}
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;