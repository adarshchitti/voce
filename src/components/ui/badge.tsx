import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]",
        secondary: "bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]",
        destructive: "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]",
        outline: "border border-[#E5E7EB] text-[#374151]",
        success: "bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]",
        warning: "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]",
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
