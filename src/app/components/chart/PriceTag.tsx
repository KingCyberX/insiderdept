// src/components/chart/PriceTag.tsx

import React, { useEffect, useRef } from 'react';

interface PriceTagProps {
  price: number;
  yCoordinate: number;
  color?: string;
  rightOffset?: number;
  type?: 'spot' | 'perp' | 'delta';
  exchange?: string;
}

const PriceTag: React.FC<PriceTagProps> = ({ 
  price, 
  yCoordinate, 
  color = '#00E676',
  rightOffset = 5,
  type = 'spot',
  exchange
}) => {
  const formatPrice = (price: number): string => {
    // Format the price based on its magnitude
    if (price > 1000) {
      return price.toFixed(0);
    } else if (price > 100) {
      return price.toFixed(1);
    } else if (price > 10) {
      return price.toFixed(2);
    } else {
      return price.toFixed(3);
    }
  };
  
  // Calculate the width based on the price text length
  const priceText = formatPrice(price);
  const width = Math.max(priceText.length * 8 + 16, 60);
  
  // Generate a label based on type and exchange
  const getLabel = (): string => {
    if (!exchange) {
      return type.charAt(0).toUpperCase() + type.slice(1);
    }
    return `${exchange} ${type}`;
  };
  
  return (
    <div 
      className="absolute flex items-center pointer-events-none"
      style={{
        top: `${yCoordinate}px`,
        right: `${rightOffset}px`,
        transform: 'translateY(-50%)'
      }}
    >
      {/* Horizontal line */}
      <div 
        className="h-px w-full absolute"
        style={{ 
          backgroundColor: color,
          opacity: 0.4,
          right: '-100vw',
          width: '100vw'
        }}
      />
      
      {/* Price tag */}
      <div 
        className="flex items-center px-2 py-1 text-xs font-medium shadow-md z-10"
        style={{ 
          backgroundColor: color,
          color: '#131722',
          borderRadius: '3px',
          width: `${width}px`
        }}
      >
        {exchange && (
          <span className="mr-1 text-xxs opacity-80">{getLabel()}:</span>
        )}
        <span>{priceText}</span>
      </div>
    </div>
  );
};

export default PriceTag;