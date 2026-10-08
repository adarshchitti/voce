import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-clip-padding font-medium whitespace-nowrap select-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "press border-2 border-ink bg-accent-solid text-white hover:bg-accent-hover",
        destructive: "press border-2 border-ink bg-destructive text-white hover:bg-destructive/90",
        outline: "press border-2 border-ink bg-white text-ink-2 hover:bg-paper-sunk",
        secondary: "press border-2 border-ink bg-paper-sunk text-ink-2 hover:bg-hairline",
        ghost: "text-ink-2 transition-colors hover:bg-paper-sunk hover:text-ink active:not-aria-[haspopup]:translate-y-px",
        link: "text-accent-solid transition-colors underline-offset-4 hover:underline active:not-aria-[haspopup]:translate-y-px",
      },
      size: {
        default: "h-9 gap-1.5 px-4 py-2 text-[13.5px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 text-[12px] in-data-[slot=button-group]:rounded-lg",
        lg: "h-10 gap-1.5 px-5 text-[14px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "h-8 w-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
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
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
