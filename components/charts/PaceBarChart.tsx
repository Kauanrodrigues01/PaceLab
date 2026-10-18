"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatPace } from "@/lib/formatting/time";

export interface PaceChartDataPoint {
  label: string;
  paceSeconds: number;
  formatted?: string;
}

export interface PaceBarChartProps {
  data: PaceChartDataPoint[];
  fastestHighlight?: boolean;
  className?: string;
}

export function PaceBarChart({
  data,
  fastestHighlight = true,
  className = "",
}: PaceBarChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !data || data.length === 0) {
    return (
      <div
        className={`h-56 w-full flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-400 ${className}`}
      >
        Nenhum dado para exibir no gráfico
      </div>
    );
  }

  // Encontrar o pace mais rápido para destaque visual
  const minPace = Math.min(...data.map((d) => d.paceSeconds));

  return (
    <div className={`w-full h-56 sm:h-64 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
          />
          <YAxis
            reversed
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#cbd5e1" }}
            tickFormatter={(sec: number) => formatPace(sec)}
            domain={["dataMin - 30", "dataMax + 30"]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as PaceChartDataPoint;
                return (
                  <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg border border-slate-700">
                    <p className="font-bold">{item.label}</p>
                    <p className="text-blue-400 font-semibold mt-0.5">
                      Pace: {item.formatted || formatPace(item.paceSeconds)} min/km
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="paceSeconds" radius={[6, 6, 0, 0]}>
            {data.map((entry, index) => {
              const isFastest = fastestHighlight && entry.paceSeconds === minPace;
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={isFastest ? "#10b981" : "#3b82f6"}
                  className="transition-colors"
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
