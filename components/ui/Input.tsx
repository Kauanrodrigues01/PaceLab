import React, { useId } from "react";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  hint?: string;
  rightAddon?: React.ReactNode;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      rightAddon,
      id,
      className = "",
      containerClassName = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className={`w-full ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? errorId : hint ? hintId : undefined
            }
            className={`w-full rounded-xl border px-3.5 py-2.5 sm:py-3 text-sm sm:text-base text-slate-900 dark:text-[#FFFFFF] bg-white dark:bg-[#0B1020] placeholder:text-slate-400 dark:placeholder:text-[#8E9BB0]/70 focus:outline-none focus:ring-2 transition-all duration-150 ${
              rightAddon ? "pr-14" : ""
            } ${
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-200 dark:focus:ring-red-950/50"
                : "border-slate-300 dark:border-[#1E2942] focus:border-lime-500 dark:focus:border-[#B7F34A] focus:ring-lime-100 dark:focus:ring-[#B7F34A]/20"
            } ${
              disabled
                ? "bg-slate-100 dark:bg-[#131A2E]/60 cursor-not-allowed opacity-60"
                : ""
            } ${className}`}
            {...props}
          />
          {rightAddon && (
            <div className="absolute right-3.5 flex items-center pointer-events-none text-xs sm:text-sm font-medium text-slate-500 dark:text-[#8E9BB0] select-none">
              {rightAddon}
            </div>
          )}
        </div>
        {error ? (
          <p
            id={errorId}
            role="alert"
            className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-medium flex items-center gap-1"
          >
            {error}
          </p>
        ) : hint ? (
          <p
            id={hintId}
            className="text-xs text-slate-500 dark:text-[#8E9BB0] mt-1.5"
          >
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
