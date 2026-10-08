import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex h-7 items-center rounded-full border-2 border-ink px-3 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-accent-tint text-accent-solid",
        secondary: "bg-paper-sunk text-ink-3",
        destructive: "bg-destructive/10 text-destructive",
        outline: "text-ink-2",
        success: "bg-p-sage text-ink",
        warning: "bg-p-amber text-ink",
        corroborated: "bg-p-sage text-ink",
        flagged: "bg-p-coral text-ink",
        unverified: "bg-transparent border-dashed text-ink",
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
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
