import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        colored: "border-transparent",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface BadgeProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean
  /** Render as a clickable button with hover/active feedback. */
  interactive?: boolean
  /** Visual indicator that this badge is the active filter. */
  active?: boolean
}

function Badge({
  className,
  variant = "default",
  asChild = false,
  interactive = false,
  active = false,
  ...props
}: BadgeProps) {
  const interactiveClasses = interactive
    ? "cursor-pointer hover:brightness-125 active:scale-[0.97] select-none"
    : undefined;
  const activeClasses = active
    ? "ring-2 ring-current/40 brightness-110"
    : undefined;

  if (asChild) {
    return (
      <Slot.Root
        data-slot="badge"
        data-variant={variant}
        className={cn(badgeVariants({ variant }), interactiveClasses, activeClasses, className)}
        {...props}
      />
    )
  }

  if (interactive) {
    return (
      <button
        type="button"
        data-slot="badge"
        data-variant={variant}
        className={cn(badgeVariants({ variant }), interactiveClasses, activeClasses, className)}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      />
    )
  }

  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...(props as React.HTMLAttributes<HTMLSpanElement>)}
    />
  )
}

export { Badge, badgeVariants }
export type { BadgeProps }
