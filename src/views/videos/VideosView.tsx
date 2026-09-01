'use client'

/**
 * Video tutorials gallery (videos tab).
 * Inline players for the 10-part Arabic tutorial series + per-video download.
 * Watched state persisted in localStorage. Available to all roles.
 */

import * as React from 'react'
import { Download, PlayCircle } from 'lucide-react'

import PageHeader from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'

interface TutorialVideo {
  src: string
  titleKey: string
  descKey: string
}

const VIDEOS: TutorialVideo[] = [
  { src: '/videos/01-register.mp4', titleKey: 'videos.v01.t', descKey: 'videos.v01.d' },
  { src: '/videos/02-mobile-app.mp4', titleKey: 'videos.v02.t', descKey: 'videos.v02.d' },
  { src: '/videos/03-desktop-app.mp4', titleKey: 'videos.v03.t', descKey: 'videos.v03.d' },
  { src: '/videos/04-setup.mp4', titleKey: 'videos.v04.t', descKey: 'videos.v04.d' },
  { src: '/videos/05-sales.mp4', titleKey: 'videos.v05.t', descKey: 'videos.v05.d' },
  { src: '/videos/06-stock-reports.mp4', titleKey: 'videos.v06.t', descKey: 'videos.v06.d' },
  { src: '/videos/07-customers.mp4', titleKey: 'videos.v07.t', descKey: 'videos.v07.d' },
  { src: '/videos/08-vouchers.mp4', titleKey: 'videos.v08.t', descKey: 'videos.v08.d' },
  { src: '/videos/09-users.mp4', titleKey: 'videos.v09.t', descKey: 'videos.v09.d' },
  { src: '/videos/10-offline.mp4', titleKey: 'videos.v10.t', descKey: 'videos.v10.d' },
]

const WATCHED_KEY = 'tijara-videos-watched'

function loadWatched(): Set<string> {
  try {
    const raw = localStorage.getItem(WATCHED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export default function VideosView() {
  const { t, num } = useI18n()
  const [watched, setWatched] = React.useState<Set<string>>(() =>
    typeof window === 'undefined' ? new Set() : loadWatched()
  )

  const markWatched = React.useCallback((src: string) => {
    setWatched((prev) => {
      if (prev.has(src)) return prev
      const next = new Set(prev)
      next.add(src)
      try {
        localStorage.setItem(WATCHED_KEY, JSON.stringify([...next]))
      } catch {}
      return next
    })
  }, [])

  const total = VIDEOS.length

  return (
    <div>
      <PageHeader
        icon={<PlayCircle className="size-5" />}
        title={t('videos.title')}
        subtitle={t('videos.sub')}
        actions={<Badge variant="secondary" className="text-sm">{t('videos.count', { n: num(total) })}</Badge>}
      />

      <div className="grid gap-5 md:grid-cols-2">
        {VIDEOS.map((v, i) => {
          const isWatched = watched.has(v.src)
          return (
            <Card key={v.src} className="overflow-hidden">
              <video
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full bg-black"
                src={v.src}
                onEnded={() => markWatched(v.src)}
              />
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold leading-snug">
                    <span className="text-primary">{num(i + 1)}.</span> {t(v.titleKey)}
                  </h3>
                  {isWatched ? (
                    <Badge variant="outline" className="shrink-0 text-emerald-600 border-emerald-600/40">
                      {t('videos.watched')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      {t('videos.orderHint', { n: num(i + 1), total: num(total) })}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-3">{t(v.descKey)}</p>
                <Button asChild variant="outline" size="sm">
                  <a href={v.src} download>
                    <Download className="size-4" />
                    {t('videos.download')}
                  </a>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
