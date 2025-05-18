// C:\Users\Raja Adil\Documents\realtime-charting-app\backend\exchanges\connectors.js
import BinanceConnector from './binanceConnector.js';
import OkxConnector from './okxConnector.js';
import BybitConnector from './bybitConnector.js';
import MexcConnector from './mexcConnector.js';

// Export the function directly
export function setupExchangeConnectors() {
  const binanceConnector = new BinanceConnector();
  const okxConnector = new OkxConnector();
  const bybitConnector = new BybitConnector();
  const mexcConnector = new MexcConnector();
  
  return {
    'binance': binanceConnector,
    'okx': okxConnector,
    'bybit': bybitConnector,
    'mexc': mexcConnector
  };
}