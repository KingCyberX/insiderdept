/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable React StrictMode if you're experiencing issues
  reactStrictMode: true,
  
  // TypeScript and build configurations
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Image optimization configurations
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },

  // CORS and headers configuration
  async headers() {
    return [
      {
        source: '/api/proxy',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },

  // Add redirects for incorrect URLs
  async redirects() {
    return [
      {
        source: '/pages/screener',
        destination: '/screener',
        permanent: false,
      },
    ];
  },

  // Add proxy rewrites for backend API only
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5000/api/:path*',
      }
    ];
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_WS_SERVER_URL: process.env.NEXT_PUBLIC_WS_SERVER_URL || 'ws://localhost:5000',
    NEXT_PUBLIC_API_SERVER_URL: process.env.NEXT_PUBLIC_API_SERVER_URL || 'http://localhost:5000/api'
  },

  // Webpack configuration
  webpack: (config) => {
    config.resolve.fallback = { 
      fs: false, 
      net: false, 
      tls: false 
    };

    return config;
  },
};

module.exports = nextConfig;