"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export interface ResultBlockProps {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
  secondaryText?: string;
  copyable?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function ResultBlock({
  label,
  value,
  unit,
  highlight = false,
  secondaryText,
  copyable = true,
  icon,
  className = "",
}: ResultBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const textToCopy = `${label}: ${value}${unit ? ` ${unit}` : ""}`;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silencioso caso clipboard API não esteja disponível
    }
  };

  return (
    <div
      className={`relative rounded-2xl p-4 sm:p-5 transition-all duration-200 ${
        highlight
          ? "bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-blue-500/5 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-blue-950/20 border-2 border-blue-500/40 dark:border-blue-500/50 shadow-sm"
          : "bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          {icon && <span className="text-blue-500">{icon}</span>}
          {label}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            title="Copiar resultado"
            aria-label={`Copiar ${label}`}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-black tracking-tight leading-none ${
            highlight
              ? "text-2xl sm:text-4xl text-blue-600 dark:text-blue-400"
              : "text-xl sm:text-3xl text-slate-900 dark:text-slate-100"
          }`}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
            {unit}
          </span>
        )}
      </div>

      {secondaryText && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
          {secondaryText}
        </p>
      )}
    </div>
  );
}
