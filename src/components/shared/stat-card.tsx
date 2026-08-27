'use client'

import { Card, CardContent } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONES: Record<string, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  info: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
  onClick,
}: {
  label: string
  value: string
  sub?: string
  icon?: LucideIcon
  tone?: keyof typeof TONES | string
  onClick?: () => void
}) {
  return (
    <Card
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick()
      }}
      className={cn(
        'py-3 md:py-4 shadow-sm hover:shadow-md transition-shadow h-full',
        onClick && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring outline-none'
      )}
    >
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs md:text-sm text-muted-foreground truncate">{label}</p>
            <p className={cn('num-ltr font-bold tracking-tight mt-1', onClick ? 'text-lg md:text-xl' : 'text-xl md:text-2xl')}>
              {value}
            </p>
            {sub ? <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p> : null}
          </div>
          {Icon ? (
            <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', TONES[tone] ?? TONES.default)}>
              <Icon className="size-5" aria-hidden />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default StatCard
