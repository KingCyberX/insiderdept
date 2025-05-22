import React, { useState, useEffect, useRef } from 'react';
import aggregatorService from '../../services/exchanges/aggregator';
import { Exchange } from '../../types/market';

interface AssetSearchProps {
  onSelect: (symbol: string) => void;
  currentExchange?: Exchange;
}

interface Symbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

const AssetSearch: React.FC<AssetSearchProps> = ({
  onSelect,
  currentExchange = 'Binance' as Exchange,
}) => {
  const [query, setQuery] = useState('');
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [filteredSymbols, setFilteredSymbols] = useState<Symbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const mockSymbols: Symbol[] = [
    { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
    { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
    { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT' },
    { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT' },
    { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT' },
    { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT' },
  ];

  useEffect(() => {
    const fetchSymbols = async () => {
      setLoading(true);
      try {
        const exchangeService = aggregatorService.getExchangeByName(currentExchange);
        if (exchangeService) {
          const symbolsData = await exchangeService.getSymbols();
          setSymbols(symbolsData);
        } else {
          setSymbols(mockSymbols);
        }
      } catch {
        setSymbols(mockSymbols);
      } finally {
        setLoading(false);
      }
    };

    fetchSymbols();

    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [currentExchange]);

  useEffect(() => {
    if (query.trim()) {
      const filtered = symbols.filter(
        (s) =>
          s.symbol.toLowerCase().includes(query.toLowerCase()) ||
          s.baseAsset.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredSymbols(filtered.slice(0, 20));
      setShowDropdown(true);
    } else {
      setFilteredSymbols([]);
      setShowDropdown(false);
    }
  }, [query, symbols]);

  const handleSelect = (symbol: string) => {
    onSelect(symbol);
    setQuery('');
    setShowDropdown(false);
  };

  const renderSymbolButton = (symbol: Symbol | string) => {
    const symStr = typeof symbol === 'string' ? symbol : symbol.symbol;
    return (
      <button
        key={symStr}
        onClick={() => handleSelect(symStr)}
        className="symbol-button"
        type="button"
        aria-label={`Select symbol ${symStr}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelect(symStr);
          }
        }}
      >
        {symStr}
      </button>
    );
  };

  return (
    <>
      <div ref={searchRef} className="asset-search">
        <div className="input-wrapper">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query && setShowDropdown(true)}
            placeholder="Search for a crypto asset..."
            className="input"
            aria-label="Search for a crypto asset"
            autoComplete="off"
          />
          <svg
            className="icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {!showDropdown && !query && (
          <div className="symbols-container popular-symbols">
            {mockSymbols.map(renderSymbolButton)}
          </div>
        )}

        {showDropdown && (
          <div className="symbols-container dropdown" role="listbox" aria-label="Search results">
            {loading ? (
              <div className="loading">
                <div className="loading-spinner" aria-hidden="true"></div>
                <span>Loading assets...</span>
              </div>
            ) : filteredSymbols.length > 0 ? (
              filteredSymbols.map(renderSymbolButton)
            ) : (
              <div className="no-results">No assets found matching &quot;{query}&quot;</div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .asset-search {
          position: relative;
          width: 100%;
          max-width: auto;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          user-select: none;
          padding:20px;
        }
        .input-wrapper {
          position: relative;
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.6);
          border-radius: 12px;
          overflow: hidden;
        }
        .input {
          width: 100%;
          padding: 1rem 1rem 1rem 3.2rem;
          background-color: #1c2030;
          border: 3px solid #2a2e39;
          border-radius: 12px;
          font-size: 1rem;
          color: #e0e7ff;
          caret-color: #2962ff;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
          box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.3);
          outline-offset: 3px;
        }
        .input::placeholder {
          color: #757c8a;
          font-weight: 500;
        }
        .input:focus {
          border-color: #2962ff;
          box-shadow: 0 0 14px #2962ff;
          outline: none;
          background-color: #222838;
        }
        .icon {
          position: absolute;
          left: 1.15rem;
          top: 50%;
          transform: translateY(-50%);
          width: 22px;
          height: 22px;
          stroke: #757c8a;
          pointer-events: none;
        }
        .symbols-container {
          margin-top: 1rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          justify-content: center;
          user-select: none;
        }
        .popular-symbols {
          box-shadow: none;
        }
        .dropdown {
          background-color: #1c2030;
          border: 3px solid #2a2e39;
          border-radius: 14px;
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.75);
          max-height: 320px;
          overflow-y: auto;
          padding: 0.75rem 1rem;
          justify-content: flex-start;
        }
        .symbol-button {
          background: linear-gradient(135deg, #334158, #2a3041);
          color: #a3adb8;
          font-size: 0.875rem;
          padding: 0.5rem 1.2rem;
          border-radius: 24px;
          border: none;
          cursor: pointer;
          box-shadow: 0 2px 7px rgba(0, 0, 0, 0.4);
          font-weight: 600;
          transition:
            background 0.3s ease,
            color 0.3s ease,
            box-shadow 0.3s ease,
            transform 0.1s ease;
          user-select: none;
          white-space: nowrap;
          text-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
          outline-offset: 3px;
        }
        .symbol-button:hover,
        .symbol-button:focus-visible {
          background: #2962ff;
          color: white;
          box-shadow: 0 0 18px 3px #2962ff;
          outline: none;
          transform: translateY(-2px);
        }
        .symbol-button:active {
          background: #1e40ff;
          box-shadow: 0 0 12px #1e40ff;
          transform: translateY(0);
        }
        .loading {
          padding: 1rem 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #a3adb8;
          gap: 0.75rem;
          font-weight: 600;
          font-size: 1rem;
        }
        .loading-spinner {
          border: 4px solid transparent;
          border-top-color: #2962ff;
          border-right-color: #2962ff;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .no-results {
          padding: 1rem 0;
          color: #a3adb8;
          text-align: center;
          font-weight: 600;
          font-style: italic;
          user-select: none;
        }
           .symbol-button {
    background: linear-gradient(135deg, #334158, #2a3041);
    color: #a3adb8;
    font-size: 0.875rem;
    padding: 0.5rem 1.2rem;
    border-radius: 24px;
    border: none;
    cursor: pointer;
    box-shadow: 0 2px 7px rgba(0, 0, 0, 0.4);
    font-weight: 600;
    transition:
      background 0.3s ease,
      color 0.3s ease,
      box-shadow 0.3s ease,
      transform 0.1s ease,
      -webkit-text-stroke-color 0.3s ease;
    user-select: none;
    white-space: nowrap;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
    outline-offset: 3px;

    -webkit-text-stroke: 0;
  }

  .symbol-button:hover,
  .symbol-button:focus-visible {
    background: linear-gradient(135deg, #334158, #2a3041);
    color: transparent;
    -webkit-text-stroke-width: 1px;
    -webkit-text-stroke-color: #2962ff;
    box-shadow: 0 0 18px 3px #2962ff;
    outline: none;
    transform: translateY(-2px);
  }

  .symbol-button:active {
    background: #2962ff;
    color: white;
    -webkit-text-stroke: 0;
    box-shadow: 0 0 12px #1e40ff;
    transform: translateY(0);
  }
      `}</style>
    </>
  );
};

export default AssetSearch;
