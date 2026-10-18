import React from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  children?: React.ReactNode;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-lime-400 hover:bg-lime-500 active:bg-lime-600 text-slate-950 font-bold shadow-sm shadow-lime-500/20 focus-visible:ring-lime-400 dark:bg-[#B7F34A] dark:hover:bg-[#A3E332] dark:active:bg-[#8FCE20] dark:text-[#0B1020] dark:shadow-[#B7F34A]/25",
  secondary:
    "bg-slate-100 hover:bg-slate-200 active:bg-slate-300 dark:bg-[#131A2E] dark:hover:bg-[#1E2942] dark:active:bg-[#283556] text-slate-900 dark:text-slate-100 border border-transparent dark:border-[#1E2942] focus-visible:ring-slate-400",
  outline:
    "border border-slate-300 dark:border-[#1E2942] hover:bg-slate-50 dark:hover:bg-[#131A2E] active:bg-slate-100 dark:active:bg-[#1E2942] text-slate-800 dark:text-slate-200 focus-visible:ring-[#B7F34A]",
  ghost:
    "hover:bg-slate-100 active:bg-slate-200 dark:hover:bg-[#131A2E] dark:active:bg-[#1E2942] text-slate-700 dark:text-[#8E9BB0] dark:hover:text-[#FFFFFF] focus-visible:ring-[#B7F34A]",
  danger:
    "bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm shadow-red-500/20 focus-visible:ring-red-500",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 rounded-lg gap-1.5",
  md: "text-sm px-4 py-2.5 rounded-xl gap-2 font-medium",
  lg: "text-base px-5 py-3 rounded-xl gap-2.5 font-semibold",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      icon,
      iconPosition = "left",
      children,
      loading,
      disabled,
      className = "",
      type = "button",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-medium transition-all duration-150 select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 cursor-pointer ${
          variantStyles[variant]
        } ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          icon && iconPosition === "left" && <span className="shrink-0">{icon}</span>
        )}
        {children && <span>{children}</span>}
        {!loading && icon && iconPosition === "right" && (
          <span className="shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
