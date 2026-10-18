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
    "bg-slate-100 dark:bg-[#131A2E] text-slate-700 dark:text-[#8E9BB0] border-slate-200 dark:border-[#1E2942]",
  primary:
    "bg-blue-50 dark:bg-[#B7F34A]/15 text-blue-700 dark:text-[#B7F34A] border-blue-200 dark:border-[#B7F34A]/30",
  lime:
    "bg-lime-50 dark:bg-[#B7F34A]/15 text-lime-800 dark:text-[#B7F34A] border-lime-200 dark:border-[#B7F34A]/30",
  success:
    "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  warning:
    "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  danger:
    "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  info:
    "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
  outline:
    "bg-transparent border border-slate-200 dark:border-[#1E2942] text-slate-700 dark:text-[#8E9BB0]",
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
