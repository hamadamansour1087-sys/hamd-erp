'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 border border-dashed rounded-xl bg-muted/30">
      {Icon ? <Icon className="size-10 text-muted-foreground/50 mb-3" aria-hidden /> : null}
      <p className="font-medium">{title}</p>
      {hint ? <p className="text-sm text-muted-foreground mt-1 max-w-sm">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export default EmptyState
