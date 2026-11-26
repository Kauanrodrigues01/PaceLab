import React from "react";

export type BadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "lime"
  | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-[#131A2E] text-[#8E9BB0] border-[#1E2942]",
  primary:
    "bg-[#B7F34A]/15 text-[#B7F34A] border-[#B7F34A]/30",
  lime:
    "bg-[#B7F34A]/15 text-[#B7F34A] border-[#B7F34A]/30",
  success:
    "bg-emerald-950/60 text-emerald-300 border-emerald-800",
  warning:
    "bg-amber-950/60 text-amber-300 border-amber-800",
  danger:
    "bg-red-950/60 text-red-300 border-red-800",
  info:
    "bg-sky-950/60 text-sky-300 border-sky-800",
  outline:
    "bg-transparent border border-[#1E2942] text-[#8E9BB0]",
};

export function Badge({
  variant = "default",
  children,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
