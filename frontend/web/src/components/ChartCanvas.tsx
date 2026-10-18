import { useEffect, useRef } from "react";
import type { ChartConfiguration, ChartType } from "chart.js";
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ChartCanvasProps<TType extends ChartType = ChartType> {
  type: TType;
  data: ChartConfiguration<TType>["data"];
  options?: ChartConfiguration<TType>["options"];
  className?: string;
  height?: number;
  width?: number;
}

export function ChartCanvas<TType extends ChartType = ChartType>({
  type,
  data,
  options,
  className,
  height = 250,
  width,
}: ChartCanvasProps<TType>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<TType> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Guard for jsdom/test environment
    if (typeof window === "undefined" || !("getContext" in canvas)) {
      return;
    }

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    chartRef.current = new Chart<TType>(ctx, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        ...options,
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [type, data, options]);

  return (
    <div className={className} style={{ height, width }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
