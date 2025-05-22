import React from 'react';
import Link from 'next/link';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-[#131722] border-t border-[#2a2e39] py-10 px-6 text-[#afb5c4]">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 gap-y-6">
          <div>
            <h3 className="text-white text-base font-medium mb-4">ATP Chart</h3>
            <p className="text-sm mb-4">
              Professional-grade cryptocurrency trading charts with real-time updates, delta volume, and open interest tracking.
            </p>
          </div>
          
          <div>
            <h4 className="text-white font-medium mb-4">Features</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  Real-time Charts
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  Delta Volume Analysis
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  Multi-Exchange Support
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  Custom Alerts
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-white font-medium mb-4">Exchanges</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  Binance
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  OKX
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  Bybit
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  MEXC
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-white font-medium mb-4">Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/chart" className="hover:text-white transition-colors">
                  Charts
                </Link>
              </li>
              <li>
                <Link href="/exchanges" className="hover:text-white transition-colors">
                  Exchanges
                </Link>
              </li>
              <li>
                <Link href="/settings" className="hover:text-white transition-colors">
                  Settings
                </Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-[#2a2e39] mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm mb-4 md:mb-0">
            &copy; {currentYear} ATP Chart. All rights reserved.
          </p>
          
          <div className="flex space-x-6">
            <Link href="/" className="text-sm hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="/" className="text-sm hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/" className="text-sm hover:text-white transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;