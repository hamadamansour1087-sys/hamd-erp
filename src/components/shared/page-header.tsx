'use client'

import * as React from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5 justify-between">
      <div className="flex items-start gap-3 min-w-0">
        {icon ? (
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold leading-tight truncate">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div> : null}
    </div>
  )
}

export default PageHeader
