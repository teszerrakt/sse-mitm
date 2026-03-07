import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-sm font-mono text-[var(--text)] transition-colors outline-none placeholder:text-[var(--text-dim)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:border-[var(--accent)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
