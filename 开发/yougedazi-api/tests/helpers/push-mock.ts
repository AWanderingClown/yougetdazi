import { vi } from 'vitest'

export type CapturedPushBatch = {
  url: string
  options: RequestInit
  body: {
    events: Array<{
      type: string
      targetType: string
      targetId: string
      payload: Record<string, unknown>
    }>
    timestamp: string
    source: string
  }
}

export function mockPushServer() {
  const captured: CapturedPushBatch[] = []

  const originalFetch = globalThis.fetch

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (!url.includes('/api/push/events')) {
      return originalFetch(input, init)
    }

    const bodyText = init?.body ? String(init.body) : '{}'
    const body = JSON.parse(bodyText)
    captured.push({ url, options: init ?? {}, body })

    return new Response(JSON.stringify({ success: true, sent: body.events?.length ?? 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  return {
    captured,
    restore: () => spy.mockRestore(),
  }
}
