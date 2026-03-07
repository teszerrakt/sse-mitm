import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-[var(--danger)] text-white hover:bg-[var(--danger)]/80",
        outline:
          "border border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-[var(--bg-hover)] hover:text-[var(--text)] text-[var(--text-muted)]",
        link: "text-primary underline-offset-4 hover:underline",
        /* ── Orthrus semantic variants ─────────────────────────── */
        success:
          "text-[var(--success)] border border-[var(--success)]/40 bg-transparent hover:bg-[var(--success)]/10 transition-colors",
        warning:
          "text-[var(--warning)] border border-[var(--warning)]/40 bg-transparent hover:bg-[var(--warning)]/10 transition-colors",
        danger:
          "text-[var(--danger)] border border-[var(--danger)]/40 bg-transparent hover:bg-[var(--danger)]/10 transition-colors",
        accent:
          "text-[var(--accent)] border border-[var(--accent)]/40 bg-transparent hover:bg-[var(--accent)]/10 transition-colors",
        inject:
          "text-[var(--inject)] border border-[var(--inject)]/40 bg-transparent hover:bg-[var(--inject)]/10 transition-colors",
        "success-solid":
          "bg-[var(--success)] text-white hover:bg-[var(--success)]/90",
        "warning-solid":
          "bg-[var(--warning)] text-black hover:opacity-90",
        "inject-solid":
          "bg-[var(--inject)] text-white hover:opacity-90",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 rounded-md px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
