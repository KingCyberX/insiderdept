// Create a new file at C:\Users\Raja Adil\Documents\realtime-charting-app\backend\exchanges\index.js
import BinanceConnector from './binanceConnector.js';
import OkxConnector from './okxConnector.js';
import BybitConnector from './bybitConnector.js';
import MexcConnector from './mexcConnector.js';

/**
 * Initialize all exchange connectors
 */
export function setupExchangeConnectors() {
  const binanceConnector = new BinanceConnector();
  const okxConnector = new OkxConnector();
  const bybitConnector = new BybitConnector();
  const mexcConnector = new MexcConnector();
  
  // Map exchange names to connectors (case-insensitive)
  return {
    'binance': binanceConnector,
    'okx': okxConnector,
    'bybit': bybitConnector,
    'mexc': mexcConnector
  };
}

// Also provide a default export in case that's what's being imported
const exchangeUtils = {
  setupExchangeConnectors
};

export default exchangeUtils;