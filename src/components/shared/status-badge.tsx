'use client'

import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n'
import type { InvoiceStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const STYLES: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 border-transparent',
  PARTIAL:
    'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 border-transparent',
  UNPAID: 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 border-transparent',
  CANCELLED: 'bg-zinc-200 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 border-transparent line-through decoration-1',
}

export function StatusBadge({ status, className }: { status: InvoiceStatus | string; className?: string }) {
  const { t } = useI18n()
  return (
    <Badge variant="outline" className={cn(STYLES[status] ?? '', 'whitespace-nowrap', className)}>
      {t(`common.status.${status}`)}
    </Badge>
  )
}

export function MethodBadge({ method }: { method: string }) {
  const { t } = useI18n()
  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      {t(`common.method.${method}`)}
    </Badge>
  )
}

export default StatusBadge
