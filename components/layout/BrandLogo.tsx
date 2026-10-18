"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Activity } from "lucide-react";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
  variant?: "icon" | "full";
}

export function BrandLogo({
  size = "md",
  showText = true,
  className = "",
  variant = "icon",
}: BrandLogoProps) {
  const [imageError, setImageError] = useState(false);

  // Dimensões do ícone/logo por tamanho
  const dimensions = {
    sm: { width: 28, height: 28, boxClass: "w-7 h-7 rounded-lg", iconClass: "w-4 h-4", textClass: "text-base" },
    md: { width: 36, height: 36, boxClass: "w-9 h-9 rounded-xl", iconClass: "w-5 h-5", textClass: "text-lg sm:text-xl" },
    lg: { width: 48, height: 48, boxClass: "w-12 h-12 rounded-2xl", iconClass: "w-6 h-6", textClass: "text-2xl sm:text-3xl" },
  }[size];

  const imageSrc = variant === "full" ? "/images/logo.png" : "/images/ico.png";

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {!imageError ? (
        <div className={`relative ${dimensions.boxClass} flex items-center justify-center overflow-hidden shrink-0`}>
          <Image
            src={imageSrc}
            alt="PaceLab Logo"
            width={dimensions.width}
            height={dimensions.height}
            className="object-contain w-full h-full"
            onError={() => {
              setImageError(true);
            }}
            priority={size !== "sm"}
            unoptimized
          />
        </div>
      ) : (
        <div
          data-testid="brand-logo-fallback"
          className={`${dimensions.boxClass} bg-[#B7F34A] flex items-center justify-center text-[#0B1020] font-black shrink-0`}
        >
          <Activity className={dimensions.iconClass} />
        </div>
      )}

      {showText && variant !== "full" && (
        <span className={`font-black tracking-tight text-white ${dimensions.textClass}`}>
          Pace<span className="text-[#B7F34A]">Lab</span>
        </span>
      )}
    </div>
  );
}
