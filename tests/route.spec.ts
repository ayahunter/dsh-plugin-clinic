/**
 * Unit tests for the /clinic route handler: method restriction, loopback
 * Host enforcement, summary projection, and error mapping. The handler is
 * exercised directly with stub requests/responses and through a real
 * node:http server.
 * @module dsh-plugin-clinic/tests/route
 */

import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClinicRoute } from '../src/route.ts'
import type { ClinicReport } from '../src/types.ts'
import type { RunClinic } from '../src/run.ts'

function report(): ClinicReport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-16T00:00:00.000Z',
    environment: { dshVersion: null, cordisVersion: null, nodeVersion: 'v24', platform: 'test', dshHome: '/tmp' },
    profiles: [{
      profile: 'web',
      manifestPath: '/tmp/web/package.json',
      plugins: [],
      profileFindings: [],
      summary: { critical: 0, warning: 0, info: 0 },
      checks: [{ id: 'load-health', ran: true }],
    }],
  }
}

const runner: RunClinic = { async run() { return report() } }

/** Minimal res stub capturing status/body. */
function stubResponse() {
  const captured: { status: number; body: string; headers: Record<string, string> } = { status: 0, body: '', headers: {} }
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      captured.status = status
      captured.headers = headers
      return res
    },
    end(body: string) {
      captured.body = body
      return res
    },
  } as unknown as ServerResponse
  return { captured, res }
}

function request(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return { method: 'GET', url: '/clinic/health', headers: { host: '127.0.0.1:3080' }, ...overrides } as IncomingMessage
}

describe('createClinicRoute handler', () => {
  const route = createClinicRoute({ prefix: '/clinic', runner })

  it('rejects non-GET methods with 405', async () => {
    const { captured, res } = stubResponse()
    await route.handler(request({ method: 'POST' }), res)
    expect(captured.status).toBe(405)
  })

  it('rejects non-loopback Host headers with 403', async () => {
    const { captured, res } = stubResponse()
    await route.handler(request({ headers: { host: 'evil.example.com' } }), res)
    expect(captured.status).toBe(403)
    expect(captured.body).toContain('loopback')
  })

  it('rejects a missing Host header with 403', async () => {
    const { captured, res } = stubResponse()
    await route.handler(request({ headers: {} }), res)
    expect(captured.status).toBe(403)
  })

  it('accepts localhost and bracketed IPv6 hosts', async () => {
    for (const host of ['localhost:3080', '127.0.0.1', '[::1]:3080']) {
      const { captured, res } = stubResponse()
      await route.handler(request({ headers: { host } }), res)
      expect(captured.status).toBe(200)
    }
  })

  it('serves the full report at /clinic/health', async () => {
    const { captured, res } = stubResponse()
    await route.handler(request(), res)
    expect(captured.status).toBe(200)
    const body = JSON.parse(captured.body) as ClinicReport
    expect(body.schemaVersion).toBe(1)
    expect(body.profiles[0]?.profile).toBe('web')
  })

  it('serves the summary projection at /clinic/health/summary', async () => {
    const { captured, res } = stubResponse()
    await route.handler(request({ url: '/clinic/health/summary' }), res)
    const body = JSON.parse(captured.body) as { profiles: unknown[] }
    expect(body.profiles).toEqual([{ profile: 'web', summary: { critical: 0, warning: 0, info: 0 } }])
  })

  it('treats a missing url as the root document', async () => {
    const { captured, res } = stubResponse()
    await route.handler(request({ url: undefined }), res)
    expect(captured.status).toBe(200)
    expect((JSON.parse(captured.body) as ClinicReport).profiles[0]?.profile).toBe('web')
  })

  it('maps runner failures to 500', async () => {
    const failing: RunClinic = { async run() { throw new Error('boom') } }
    const route = createClinicRoute({ prefix: '/clinic', runner: failing })
    const { captured, res } = stubResponse()
    await route.handler(request(), res)
    expect(captured.status).toBe(500)
    expect(captured.body).toContain('boom')
  })
})

describe('createClinicRoute over a real HTTP server', () => {
  let server: ReturnType<typeof createServer>
  let baseUrl: string

  beforeAll(async () => {
    const route = createClinicRoute({ prefix: '/clinic', runner })
    server = createServer((req, res) => { void route.handler(req, res) })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })

  it('answers the real HTTP request and enforces the Host check', async () => {
    const ok = await fetch(`${baseUrl}/clinic/health`)
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as ClinicReport).profiles[0]?.profile).toBe('web')

    // fetch forbids a custom Host header, so the forged-host probe goes
    // through node:http directly.
    const forbiddenStatus = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${baseUrl}/clinic/health`, { method: 'GET', headers: { host: 'evil.example.com' } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.end()
    })
    expect(forbiddenStatus).toBe(403)
  })
})
