"use client";

import React, { useMemo } from "react";
import { SplitDetail } from "@/types";
import { analyzeSplits, SplitsAnalysis } from "@/lib/math/splitsAnalysis";
import {
  Activity,
  HeartPulse,
  Mountain,
  TrendingDown,
  TrendingUp,
  Zap,
  Minus,
} from "lucide-react";

interface SplitsInsightsProps {
  splits?: SplitDetail[];
  analysis?: SplitsAnalysis;
  compact?: boolean;
  className?: string;
}

function getInsightIcon(
  id: SplitsAnalysis["insights"][number]["id"],
  strategy: SplitsAnalysis["strategy"]
) {
  switch (id) {
    case "strategy":
      if (strategy === "negative_split") {
        return <TrendingUp className="w-3.5 h-3.5 text-[#B7F34A]" />;
      }
      if (strategy === "positive_split") {
        return <TrendingDown className="w-3.5 h-3.5 text-amber-400" />;
      }
      return <Minus className="w-3.5 h-3.5 text-cyan-400" />;
    case "extremes":
      return <Zap className="w-3.5 h-3.5 text-[#B7F34A]" />;
    case "consistency":
      return <Activity className="w-3.5 h-3.5 text-emerald-400" />;
    case "heart_rate":
      return <HeartPulse className="w-3.5 h-3.5 text-rose-400" />;
    case "elevation":
      return <Mountain className="w-3.5 h-3.5 text-emerald-400" />;
  }
}

export function SplitsInsights({
  splits,
  analysis,
  compact = false,
  className = "",
}: SplitsInsightsProps) {
  const resolved = useMemo(
    () => analysis ?? analyzeSplits(splits),
    [analysis, splits]
  );

  if (!resolved.hasSplits || resolved.insights.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="splits-insights"
      className={`grid gap-2.5 ${
        compact
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      } ${className}`}
    >
      {resolved.insights.map((item) => {
        const toneClasses =
          item.tone === "positive"
            ? "border-[#B7F34A]/30 bg-[#0B1020]/90"
            : item.tone === "warning"
              ? "border-amber-500/30 bg-amber-950/20"
              : "border-[#1E2942] bg-[#0B1020]/80";

        return (
          <div
            key={item.id}
            data-testid={`split-insight-${item.id}`}
            className={`rounded-xl border p-3 space-y-1 ${toneClasses}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8E9BB0]">
              {getInsightIcon(item.id, resolved.strategy)}
              <span>{item.title}</span>
            </div>
            <div className="text-xs sm:text-sm font-black text-white">
              {item.value}
            </div>
            <p className="text-[11px] leading-relaxed text-[#8E9BB0]">
              {item.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
