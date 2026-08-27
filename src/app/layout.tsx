import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Cairo, Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { Providers } from '@/app/providers'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const cairo = Cairo({
  variable: '--font-cairo',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'H.A.M.D — نظام إدارة المخازن والمحلات',
  description:
    'نظام متكامل لإدارة المخازن ونقاط البيع: فواتير، مشتريات، عملاء وموردين، تقارير، طباعة حرارية، يعمل أونلاين وأوفلاين بالعربية والإنجليزية.',
  manifest: '/manifest.webmanifest',
  applicationName: 'H.A.M.D',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'H.A.M.D' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7fdfa' },
    { media: '(prefers-color-scheme: dark)', color: '#101816' },
  ],
}

// Applies stored language/theme BEFORE first paint to avoid FOUC and wrong-direction flash.
const earlyBootScript = `(function(){try{var l=localStorage.getItem('tijara-lang')||'ar';document.documentElement.lang=l;document.documentElement.dir=(l==='ar'?'rtl':'ltr');var a=localStorage.getItem('tijara-accent');if(a){document.documentElement.setAttribute('data-theme',a);}var m=localStorage.getItem('theme')==='dark'||((localStorage.getItem('theme')==null||localStorage.getItem('theme')==='system')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(m&&!(localStorage.getItem('theme')=='light')){if(localStorage.getItem('theme')!=='light'&&localStorage.getItem('theme')!=='dark'&&localStorage.getItem('theme')!==null){}};}catch(e){}})();`

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Nonce emitted by src/proxy.ts for the nonce-based CSP. Inline scripts we
  // render ourselves must carry it explicitly (Next only stamps its own).
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${cairo.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: earlyBootScript }} />
        <Providers nonce={nonce}>{children}</Providers>
        <Toaster position="bottom-center" richColors closeButton expand={false} dir="auto" />
      </body>
    </html>
  )
}
