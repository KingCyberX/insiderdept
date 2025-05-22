"use client";

import React from "react";
import Link from "next/link";
import ChartController from "./_components/ChartController";

export default function ChartPage() {
  return (
    <div className="chart-page min-h-screen bg-[#0f172a] text-white">
      {/* Back to Home link positioned absolutely to maintain navigation without a header */}
      <div className="absolute top-4 right-4 z-50"></div>

      {/* Main content without header offset */}
      <main className="container mx-auto px-0">
        {/* Chart container with explicit dimensions */}
        <div className="chart-container">
          <ChartController />
        </div>
      </main>

      {/* Critical inline styles to ensure proper display */}
      <style jsx global>{`
        body,
        html {
          overflow-y: auto !important;
          height: 100%;
          margin: 0;
          padding: 0;
        }

        .chart-container {
          display: block !important;
          height: auto !important;
          min-height: 1000px !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        .candlestick-chart-wrapper {
          height: 500px !important;
          min-height: 500px !important;
        }

        .chart-panel {
          height: 200px !important;
          min-height: 200px !important;
          margin-bottom: 24px !important;
        }

        .delta-chart {
          height: 160px !important;
        }

        main {
          padding: 0 !important;
          margin: 0 !important;
          min-height: 100vh !important;
        }

        .section-divider {
          margin: 32px 0 !important;
        }

        canvas {
          width: 100% !important;
        }

        .container {
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }
      `}</style>
    </div>
  );
}
