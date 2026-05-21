import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-md border border-foreground/15 bg-background px-3 text-sm",
          "placeholder:text-foreground/40",
          "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30",
          "disabled:opacity-50",
          className,
        )}
        {...rest}
      />
    );
  },
);

Input.displayName = "Input";
