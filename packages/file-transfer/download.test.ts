import { describe, it, expect } from 'vitest'
import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { download } from './download'
import { ProgressTrackerSingle } from './progress'

interface RouteSpec {
  status?: number
  body?: Buffer | string
  headers?: Record<string, string>
  /**
   * Custom handler — wins over status/body if provided.
   */
  handle?: (req: IncomingMessage, res: ServerResponse) => void
}

async function startServer(routes: Record<string, RouteSpec>) {
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    const route = routes[path]
    if (!route) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    if (route.handle) {
      route.handle(req, res)
      return
    }
    res.writeHead(route.status ?? 200, route.headers ?? {})
    res.end(route.body ?? '')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as any).port
  return { server, baseUrl: `http://127.0.0.1:${port}` }
}

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'xmcl-ft-'))
}

describe('@xmcl/file-transfer download', () => {
  it('downloads a basic 200 response into the destination', async () => {
    const content = 'hello world'
    const { server, baseUrl } = await startServer({
      '/a': {
        status: 200,
        body: content,
        headers: { 'Content-Length': Buffer.byteLength(content).toString() },
      },
    })
    const dir = await tempDir()
    try {
      const dest = join(dir, 'a.txt')
      await download({ url: `${baseUrl}/a`, destination: dest })
      expect((await readFile(dest)).toString()).toBe(content)
    } finally {
      server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  /**
   * BUG F1 — When the server returns an HTTP error (4xx/5xx), the
   * inner `RangeRequestHandler.onHeaders` rejects the parent's
   * resolver before `onHeaderParsed` runs. As a result
   * `childrenResolvers` is never resolved/rejected, and the
   * `Promise.allSettled([resolvers, childrenResolvers]).finally(... done = true)`
   * wiring on the tracker never fires.
   *
   * The download() promise rejects (so the caller sees the error),
   * but `tracker.done` stays false forever, and the inner
   * Promise.allSettled retains both promises preventing GC.
   *
   * Expected: tracker.done becomes true on terminal HTTP errors too.
   */
  it('marks tracker.done on HTTP 4xx error responses', async () => {
    const { server, baseUrl } = await startServer({
      '/missing': { status: 404, body: 'not found' },
    })
    const dir = await tempDir()
    try {
      const dest = join(dir, 'missing.bin')
      const tracker = new ProgressTrackerSingle()
      await expect(
        download({ url: `${baseUrl}/missing`, destination: dest, tracker }),
      ).rejects.toThrow()

      // Give microtasks a chance to flush the .finally
      await new Promise((r) => setImmediate(r))
      expect(tracker.done).toBe(true)
    } finally {
      server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  /**
   * BUG F4 — A misbehaving server can return 206 Partial Content
   * without a Content-Range header. The current code does
   * `contentRange.match(...)` unconditionally, throwing
   * "Cannot read property 'match' of undefined" — the error is
   * surfaced as a generic JS TypeError instead of a clean
   * download error.
   *
   * Expected: the request fails cleanly (rejects) without a
   * TypeError.
   */
  it('handles 206 responses with a missing Content-Range header without throwing TypeError', async () => {
    const { server, baseUrl } = await startServer({
      '/bad-206': {
        handle: (_req, res) => {
          // No Content-Range header — malformed
          res.writeHead(206, { 'Content-Length': '5' })
          res.end('hello')
        },
      },
    })
    const dir = await tempDir()
    try {
      const dest = join(dir, 'a.bin')
      const result = await download({ url: `${baseUrl}/bad-206`, destination: dest }).catch(
        (e) => e,
      )

      // It MUST reject (no Content-Range = unparseable response), and
      // the error must not be a raw TypeError from optional chaining.
      expect(result).toBeInstanceOf(Error)
      expect((result as Error).constructor.name).not.toBe('TypeError')
    } finally {
      server.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
