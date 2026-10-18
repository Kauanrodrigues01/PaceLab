import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Card({
  title,
  description,
  headerAction,
  children,
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-[#1E2942] bg-white dark:bg-[#131A2E] shadow-sm hover:shadow-md transition-shadow duration-200 p-5 sm:p-6 ${className}`}
      {...props}
    >
      {(title || description || headerAction) && (
        <div className="flex items-start justify-between gap-4 mb-5 border-b border-slate-100 dark:border-[#1E2942]/80 pb-4">
          <div>
            {title && (
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-[#FFFFFF] tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs sm:text-sm text-slate-500 dark:text-[#8E9BB0] mt-1">
                {description}
              </p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
