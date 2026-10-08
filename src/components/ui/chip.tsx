"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Chip — the interactive sibling of Badge.
 *
 * Badge is a read-only status pill (`corroborated`, `flagged`, `unverified`).
 * Chip is for user-owned values that can be added and removed: banned words,
 * topics, hashtags, personal-context components, linked entities.
 *
 * Shape follows the system: pill, 2px ink border, the four data pastels as
 * fills, dashed border for anything provisional or unverified.
 */
const chipVariants = cva(
  "group/chip inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border-2 border-ink font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      tone: {
        neutral: "bg-paper-sunk text-ink",
        surface: "bg-surface text-ink",
        blue: "bg-p-blue text-ink",
        coral: "bg-p-coral text-ink",
        lilac: "bg-p-lilac text-ink",
        sage: "bg-p-sage text-ink",
        amber: "bg-p-amber text-ink",
        accent: "bg-accent-tint text-accent-solid",
      },
      /**
       * `dashed` carries the system-wide "provisional / unverified" meaning.
       * `ghost` is for low-emphasis metadata that should not compete with
       * the content next to it.
       */
      variant: {
        solid: "",
        dashed: "border-dashed bg-transparent text-ink",
        ghost: "border-transparent bg-transparent text-ink-2",
      },
      size: {
        sm: "h-6 px-2.5 text-[11px]",
        default: "h-7 px-3 text-[12px]",
        lg: "h-8 px-3.5 text-[13px]",
      },
      interactive: {
        true: "cursor-pointer hover:brightness-[0.97] active:translate-y-px",
        false: "",
      },
    },
    defaultVariants: {
      tone: "neutral",
      variant: "solid",
      size: "default",
      interactive: false,
    },
  },
)

export type ChipProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof chipVariants> & {
    /** Renders a trailing remove button. The chip itself stays a span. */
    onRemove?: () => void
    /** Accessible label for the remove button; defaults to "Remove <text>". */
    removeLabel?: string
    /** Small leading dot, for colour-coded categories. */
    dot?: boolean
  }

export function Chip({
  className,
  tone,
  variant,
  size,
  interactive,
  onRemove,
  removeLabel,
  dot,
  children,
  ...props
}: ChipProps) {
  const label =
    removeLabel ?? `Remove ${typeof children === "string" ? children : "item"}`

  return (
    <span
      data-slot="chip"
      className={cn(chipVariants({ tone, variant, size, interactive }), className)}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-ink"
        />
      )}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-solid"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  )
}

export { chipVariants }
export default Chip
