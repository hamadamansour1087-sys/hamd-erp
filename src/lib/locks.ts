import { OperationConflictError } from '@/lib/api-helpers'

/**
 * In-process keyed mutex WITH A WAIT BUDGET — fixes the failure modes of the
 * bare promise-chain pattern previously duplicated in stock/adjust and
 * transfers:
 *
 *  - a hung holder (stalled DB, network black hole) used to hold the key
 *    forever, piling up every later request behind it → now a waiter ABORTS
 *    after `timeoutMs` with 409 lock-busy instead of hanging;
 *  - an unbounded waiter queue used to grow without limit under load → now a
 *    key with `maxWaiting` queued waiters rejects immediately (409) — the CAS
 *    guards inside the handlers remain the correctness backstop.
 *
 * Cross-instance mutual exclusion is NOT provided here (this is one process);
 * the handlers' compare-and-swap loops and PostgreSQL row locks cover that.
 */
export class KeyedMutex {
  private locks = new Map<string, { tail: Promise<unknown>; waiting: number }>()

  async run<T>(
    key: string,
    fn: () => Promise<T>,
    opts: { timeoutMs?: number; maxWaiting?: number } = {}
  ): Promise<T> {
    const { timeoutMs = 20_000, maxWaiting = 100 } = opts
    let entry = this.locks.get(key)
    if (!entry) {
      entry = { tail: Promise.resolve(), waiting: 0 }
      this.locks.set(key, entry)
    }
    if (entry.waiting >= maxWaiting) throw new OperationConflictError('lock-queue-full')
    entry.waiting++

    // Our slot in the chain: when the previous holder settles, open our gate
    // and hold the chain until we release (or are abandoned via timeout).
    let release!: () => void
    const released = new Promise<void>((r) => { release = r })
    let openGate!: () => void
    const gate = new Promise<void>((r) => { openGate = r })
    entry.tail = entry.tail.catch(() => undefined).then(() => {
      openGate()
      return released
    })

    let settled = false
    let waitTimer: ReturnType<typeof setTimeout> | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        waitTimer = setTimeout(() => {
          if (settled) return
          settled = true
          // Abandon our slot: open the gate for the chain and release it —
          // fn() never runs, mutual exclusion is preserved.
          openGate()
          release()
          reject(new OperationConflictError('lock-busy'))
        }, timeoutMs)
        gate.then(() => {
          if (settled) return
          settled = true
          if (waitTimer) clearTimeout(waitTimer)
          resolve()
        })
      })
    } catch (e) {
      entry.waiting--
      throw e
    }

    try {
      return await fn()
    } finally {
      release()
      entry.waiting--
      if (entry.waiting <= 0) this.locks.delete(key)
    }
  }
}

/** Process-wide mutex instances (key namespaces keep users separate). */
export const globalMutex = new KeyedMutex()
