import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[80px] w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm",
        "placeholder:text-foreground/40",
        "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30",
        "disabled:opacity-50 resize-none",
        className,
      )}
      {...rest}
    />
  );
});

Textarea.displayName = "Textarea";
