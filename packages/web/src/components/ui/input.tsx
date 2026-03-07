import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 py-1 text-sm font-mono text-foreground transition-colors outline-none placeholder:text-dim disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:border-accent",
        className
      )}
      {...props}
    />
  )
}

export { Input }
