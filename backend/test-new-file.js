// test-bin-export.js
import * as binanceModule from './exchanges/binanceConnector.js';

console.log('BinanceConnector exports:', Object.keys(binanceModule));
console.log('Default export:', binanceModule.default);

for (const key in binanceModule) {
  console.log(`  ${key}:`, typeof binanceModule[key]);
}