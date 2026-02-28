export interface RateLimitInfo {
  limit: string | null
  remaining: string | null
  reset: string | null
}

export class RateLimitError extends Error {
  constructor(public resetTimestamp: number) {
    super('Rate limit exceeded')
  }
}

type Listener = (...args: any[]) => void

interface QueuedRequest<T> {
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: any) => void
}

/**
 * Unified request queue with rate limit handling.
 * When a 429 is received, the queue pauses and waits until the rate limit window resets.
 */
export class RateLimiter {
  private queue: QueuedRequest<any>[] = []
  private paused = false
  private resetTimestamp = 0
  private countdownTimer: ReturnType<typeof setInterval> | null = null
  private listeners: Map<string, Listener[]> = new Map()

  on(event: 'rateLimited' | 'rateLimitCleared' | 'countdown', listener: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(listener)
  }

  private emit(event: string, ...args: any[]) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.forEach((fn) => fn(...args))
    }
  }

  /**
   * Enqueue a request. If the queue is not paused, it executes immediately.
   * If paused (rate limited), it waits until the window resets.
   */
  enqueue<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ execute, resolve, reject })
      if (!this.paused) {
        this.processQueue()
      }
    })
  }

  /**
   * Called when a 429 response is received. Pauses the queue and schedules resume.
   */
  handleRateLimit(resetTimestamp: number) {
    if (this.paused) return

    this.paused = true
    this.resetTimestamp = resetTimestamp

    const waitMs = Math.max((resetTimestamp * 1000) - Date.now(), 5000)
    console.log(`[Treeverse] Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s until reset.`)

    this.emit('rateLimited', resetTimestamp)
    this.startCountdown()

    setTimeout(() => {
      this.resume()
    }, waitMs)
  }

  private startCountdown() {
    this.stopCountdown()
    this.countdownTimer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((this.resetTimestamp * 1000 - Date.now()) / 1000))
      this.emit('countdown', remaining)
      if (remaining <= 0) {
        this.stopCountdown()
      }
    }, 1000)
  }

  private stopCountdown() {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
  }

  private resume() {
    this.paused = false
    this.stopCountdown()
    this.emit('rateLimitCleared')
    console.log('[Treeverse] Rate limit window reset. Resuming requests.')
    this.processQueue()
  }

  private async processQueue() {
    while (this.queue.length > 0 && !this.paused) {
      const item = this.queue.shift()!
      try {
        const result = await item.execute()
        item.resolve(result)
      } catch (err) {
        if (err instanceof RateLimitError) {
          // Re-queue the failed request at the front
          this.queue.unshift(item)
          this.handleRateLimit(err.resetTimestamp)
          return
        }
        item.reject(err)
      }
    }
  }
}
