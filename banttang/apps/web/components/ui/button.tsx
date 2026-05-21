import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-foreground hover:bg-brand/90 disabled:bg-brand/50",
  secondary:
    "bg-foreground/5 text-foreground hover:bg-foreground/10 disabled:opacity-50",
  ghost:
    "bg-transparent text-foreground hover:bg-foreground/5 disabled:opacity-50",
  danger:
    "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
          "disabled:cursor-not-allowed",
          variantClass[variant],
          sizeClass[size],
          className,
        )}
        {...rest}
      />
    );
  },
);

Button.displayName = "Button";
