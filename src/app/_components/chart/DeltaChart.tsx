import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  IChartApi,
  LineStyle,
  UTCTimestamp,
} from "lightweight-charts";

interface DeltaVolume {
  time: number;
  value: number;
  color: string;
}

interface DeltaChartProps {
  data: DeltaVolume[];
  type: "spot" | "perps" | "cvd";
  height: number;
  cumulative?: boolean;
}

// Named export for better compatibility with different import styles
export const DeltaChart: React.FC<DeltaChartProps> = ({
  data,
  type,
  height,
  cumulative = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [containerHeight, setContainerHeight] = useState<number>(height || 150); // Default to 150px if height is not provided or is 0

  // Ensure all timestamps are in seconds format
  const ensureSecondsFormat = (timestamp: number): number => {
    // Convert milliseconds to seconds if needed
    return timestamp > 10000000000 ? Math.floor(timestamp / 1000) : timestamp;
  };

  // Get container dimensions
  useEffect(() => {
    if (containerRef.current) {
      // Set a minimum height directly on the container to ensure it has space to render
      containerRef.current.style.minHeight = `${Math.max(100, height)}px`;
      containerRef.current.style.height = `${Math.max(100, height)}px`;

      // Force the browser to calculate dimensions before creating the chart
      setTimeout(() => {
        if (containerRef.current) {
          const computedHeight = containerRef.current.clientHeight;
          if (computedHeight > 0) {
            setContainerHeight(computedHeight);
          } else {
            // Fall back to a reasonable minimum if clientHeight is still 0
            setContainerHeight(Math.max(100, height));

            // Additionally force the height on the container
            containerRef.current.style.height = `${Math.max(100, height)}px`;
            containerRef.current.style.minHeight = `${Math.max(100, height)}px`;
          }
        }
      }, 10);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newHeight = entry.contentRect.height;
          // Only update if greater than zero to avoid rendering issues
          if (newHeight > 0) {
            setContainerHeight(newHeight);

            // Update chart dimensions if chart exists
            if (chartRef.current) {
              chartRef.current.applyOptions({
                height: newHeight,
              });
              chartRef.current.timeScale().fitContent();
            }
          } else {
            // If height is 0, force it
            const containerElement = entry.target as HTMLElement;
            containerElement.style.height = `${Math.max(100, height)}px`;
            containerElement.style.minHeight = `${Math.max(100, height)}px`;
          }
        }
      });

      resizeObserver.observe(containerRef.current);

      return () => {
        const currentContainer = containerRef.current;
        if (currentContainer) {
          resizeObserver.unobserve(currentContainer);
        }
      };
    }
  }, [height]);

  useEffect(() => {
    // Log component mounting for debugging
    console.log(
      `DeltaChart mounted - type: ${type}, cumulative: ${cumulative}`
    );
    console.log(
      `Data points: ${
        data?.length || 0
      }, Container height: ${containerHeight}px`
    );

    if (!containerRef.current || !data || data.length === 0) {
      console.warn("DeltaChart: Container ref is null or data is empty");
      return;
    }

    if (containerHeight <= 0) {
      console.warn(
        "DeltaChart: Container height is 0 or negative, setting to minimum 100px"
      );
      // Force a minimum height
      setContainerHeight(Math.max(100, height));

      // Directly set style on the container
      if (containerRef.current) {
        containerRef.current.style.height = `${Math.max(100, height)}px`;
        containerRef.current.style.minHeight = `${Math.max(100, height)}px`;
      }

      return;
    }

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    try {
      // Use container width and dynamic height
      const containerWidth = containerRef.current.clientWidth;
      // Ensure we have a positive height value
      const chartHeight = Math.max(containerHeight, 100);

      // Create chart
      const chart = createChart(containerRef.current, {
        width: containerWidth,
        height: chartHeight,
        layout: {
          background: { color: "transparent" },
          textColor: "#d1d4dc",
          fontFamily: "Inter, sans-serif",
        },
        grid: {
          vertLines: { color: "#1c2030" },
          horzLines: { color: "#1c2030" },
        },
        rightPriceScale: {
          visible: true,
          borderColor: "#2a2e39",
          entireTextOnly: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        timeScale: {
          borderColor: "#2a2e39",
          timeVisible: true,
          secondsVisible: false,
          barSpacing: 4, // Small bars for delta panels
          tickMarkFormatter: (time: UTCTimestamp) => {
            const date = new Date(time * 1000);
            return (
              date.getHours().toString().padStart(2, "0") +
              ":" +
              date.getMinutes().toString().padStart(2, "0")
            );
          },
        },
        crosshair: {
          vertLine: {
            color: "#2962FF",
            width: 1,
            style: LineStyle.Solid,
            labelBackgroundColor: "#2962FF",
          },
          horzLine: {
            color: "#2962FF",
            width: 1,
            style: LineStyle.Solid,
            labelBackgroundColor: "#2962FF",
          },
        },
      });

      chartRef.current = chart;

      // Choose color scheme based on type
      let positiveColor, negativeColor;

      switch (type) {
        case "spot":
          positiveColor = "#00E676"; // Green
          negativeColor = "#FF3A5C"; // Red
          break;
        case "perps":
          positiveColor = "#00A3FF"; // Blue
          negativeColor = "#FF3A5C"; // Red
          break;
        case "cvd":
          positiveColor = "#7E57C2"; // Purple for positive
          negativeColor = "#673AB7"; // Darker purple for negative
          break;
        default:
          positiveColor = "#00E676"; // Default green
          negativeColor = "#FF3A5C"; // Default red
      }

      // Process the data
      if (!data || data.length === 0) {
        console.warn("No data available for DeltaChart");
        return;
      }

      // Create either histogram or area series based on cumulative flag
      if (cumulative) {
        console.log("Creating cumulative area series for CVD");
        // For cumulative data (like CVD), use an area series
        const areaSeries = chart.addAreaSeries({
          lineColor: "#7E57C2",
          topColor: "#7E57C280",
          bottomColor: "transparent",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          lastValueVisible: false,
          priceLineVisible: false,
        });

        // Process CVD data (cumulative sum of values)
        let cumulativeSum = 0;
        const processedData = data.map((item) => {
          // Determine if the value should be added or subtracted based on color
          const multiplier =
            item.color.includes("red") ||
            (item.color.toLowerCase().includes("ff") &&
              !item.color.toLowerCase().includes("00ff"))
              ? -1
              : 1;

          cumulativeSum += item.value * multiplier;

          return {
            time: ensureSecondsFormat(item.time) as UTCTimestamp,
            value: cumulativeSum,
          };
        });

        // Log the first few processed data points for debugging
        console.log("First 3 CVD data points:", processedData.slice(0, 3));

        areaSeries.setData(processedData);
      } else {
        console.log(`Creating histogram series for ${type}`);
        // For delta data, use a histogram
        const deltaSeries = chart.addHistogramSeries({
          color: "#808080", // Default color, will be overridden by individual bars
          priceFormat: {
            type: "volume",
          },
          lastValueVisible: false,
          priceScaleId: "delta",
        });

        // Set specific scale options for delta
        chart.priceScale("delta").applyOptions({
          scaleMargins: {
            top: 0.2,
            bottom: 0.2,
          },
          autoScale: true,
        });

        // Format data for chart
        const formattedData = data.map((item) => {
          // Determine color based on value and type
          let color = item.value >= 0 ? positiveColor : negativeColor;

          // If color is specified in the data, use it to determine positive/negative
          if (item.color) {
            color =
              item.color.includes("red") ||
              (item.color.toLowerCase().includes("ff") &&
                !item.color.toLowerCase().includes("00ff"))
                ? negativeColor
                : positiveColor;
          }

          return {
            time: ensureSecondsFormat(item.time) as UTCTimestamp,
            value: item.value !== 0 ? item.value : 0.01,
            color: color,
          };
        });

        // Log the first few formatted data points for debugging
        console.log(`First 3 ${type} data points:`, formattedData.slice(0, 3));

        deltaSeries.setData(formattedData);
      }

      // Fit content
      chart.timeScale().fitContent();

      // Handle resize
      const handleResize = () => {
        if (containerRef.current && chartRef.current) {
          const newWidth = containerRef.current.clientWidth;
          const newHeight =
            containerRef.current.clientHeight || Math.max(100, height);

          if (newWidth > 0 && newHeight > 0) {
            chartRef.current.applyOptions({
              width: newWidth,
              height: newHeight,
            });
            chartRef.current.timeScale().fitContent();
          }
        }
      };

      window.addEventListener("resize", handleResize);

      // Force fit content after a delay to ensure chart is visible
      setTimeout(() => {
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }, 100);

      return () => {
        window.removeEventListener("resize", handleResize);
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
      };
    } catch (error) {
      console.error("Error creating DeltaChart:", error);
    }
  }, [data, type, cumulative, containerHeight, height]);

  return (
    <div
      className="delta-chart-wrapper"
      style={{
        width: "100%",
        height: `${Math.max(100, height)}px`,
        minHeight: `${Math.max(100, height)}px`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        className="delta-chart"
        style={{
          width: "100%",
          height: "100%",
          minHeight: `${Math.max(100, height)}px`,
          position: "relative",
        }}
      />
    </div>
  );
};

// Also provide as default export for backward compatibility
export default DeltaChart;
