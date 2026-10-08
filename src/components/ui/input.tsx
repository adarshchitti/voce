import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-[10px] border-2 border-ink bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-accent-solid disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
        className
      )}
      {...props}
    />
  )
}

export { Input }
