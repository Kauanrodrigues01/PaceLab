"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button, ButtonProps } from "./Button";

export interface CopyButtonProps extends Omit<ButtonProps, "onClick"> {
  textToCopy: string;
  label?: string;
  copiedLabel?: string;
}

export function CopyButton({
  textToCopy,
  label = "Copiar",
  copiedLabel = "Copiado!",
  variant = "outline",
  size = "sm",
  className = "",
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      icon={
        copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )
      }
      className={className}
      {...props}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}
