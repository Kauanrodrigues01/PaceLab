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
          ? "bg-[#B7F34A]/10 border-2 border-[#B7F34A]/50 shadow-sm"
          : "bg-[#0B1020] border border-[#1E2942]"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-[#8E9BB0] flex items-center gap-1.5">
          {icon && <span className="text-[#B7F34A]">{icon}</span>}
          {label}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            title="Copiar resultado"
            aria-label={`Copiar ${label}`}
            className="text-[#8E9BB0] hover:text-[#FFFFFF] p-1 rounded-md hover:bg-[#1E2942] transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[#B7F34A]" />
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
              ? "text-2xl sm:text-4xl text-[#B7F34A]"
              : "text-xl sm:text-3xl text-[#FFFFFF]"
          }`}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs sm:text-sm font-semibold text-[#8E9BB0]">
            {unit}
          </span>
        )}
      </div>

      {secondaryText && (
        <p className="text-xs text-[#8E9BB0] mt-2 font-medium">
          {secondaryText}
        </p>
      )}
    </div>
  );
}
