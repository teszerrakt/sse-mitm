import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-transparent",
        secondary:
          "bg-secondary text-secondary-foreground border-transparent",
        destructive:
          "bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/40",
        outline:
          "border-[var(--border)] text-[var(--text-muted)]",
        /* ── Orthrus semantic variants ─────────────────────────── */
        success:
          "text-[var(--success)] border-[var(--success)]/40 bg-transparent",
        warning:
          "text-[var(--warning)] border-[var(--warning)]/40 bg-transparent",
        danger:
          "text-[var(--danger)] border-[var(--danger)]/40 bg-transparent",
        accent:
          "text-[var(--accent)] bg-[var(--accent)] text-white border-transparent rounded-full",
        inject:
          "text-[var(--inject)] border-[var(--inject)]/40 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
