import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[10px] border-2 border-ink bg-surface px-3 py-2 text-[14px] text-ink transition-colors outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent-solid disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
