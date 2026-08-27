/** Server-side date helpers respecting Africa/Cairo timezone (project default). */

export const TZ = 'Africa/Cairo'

export function tzOffsetMinutes(date: Date, tz: string = TZ): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts: Record<string, number> = {}
  for (const { type, value } of dtf.formatToParts(date)) {
    if (type !== 'literal') parts[type] = parseInt(value, 10)
  }
  const asUTC = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour! % 24, parts.minute!, parts.second!)
  return Math.round((asUTC - date.getTime()) / 60000)
}

/** UTC instant of local midnight for a Y-M-D in the project timezone. */
function localDayStartUTC(y: number, m: number, d: number): Date {
  const guessUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
  let offset = tzOffsetMinutes(guessUTC)
  // one refinement pass handles DST boundaries
  offset = tzOffsetMinutes(new Date(guessUTC.getTime() - offset * 60000))
  return new Date(Date.UTC(y, m - 1, d) - offset * 60000)
}

export function startOfToday(): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  const [y, m, d] = fmt.format(new Date()).split('-').map((x) => parseInt(x, 10))
  return localDayStartUTC(y, m, d)
}

export function daysAgo(n: number): Date {
  return new Date(startOfToday().getTime() - n * 86_400_000)
}

export function startOfMonthCairo(offsetMonths = 0): Date {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  })
  const [y, m] = fmt.format(now).split('-').map((x) => parseInt(x, 10))
  const target = new Date(Date.UTC(y, m - 1 + offsetMonths, 1))
  const fy = target.getUTCFullYear()
  const fm = target.getUTCMonth() + 1
  return localDayStartUTC(fy, fm, 1)
}
