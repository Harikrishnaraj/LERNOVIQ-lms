import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Visible label — required (DESIGN.md §10). */
  label: string;
  /** Text of the empty option (e.g. "Any level"). Omit when a value is always required. */
  placeholder?: string;
  options: readonly { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, placeholder, options, id, className, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-text">
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        className={cn(
          "h-10 rounded-input border border-border bg-surface px-3 text-sm text-text",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
          className,
        )}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
});
