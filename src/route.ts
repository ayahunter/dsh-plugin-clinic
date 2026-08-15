/**
 * The /clinic HTTP routes: a webServer prefix route serving the full
 * ClinicReport and the summary projection. Loopback-only Host header check
 * (DNS-rebinding defense, same spirit as the official /api fence); this is a
 * reachability policy, not authentication.
 * @module dsh-plugin-clinic/route
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { summarize } from './engine/report.ts'
import type { RunClinic } from './run.ts'
import type { ClinicReport, Severity } from './types.ts'

/** Loopback authorities; port is optional. */
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/iu

/** Route options; prefix is the webServer route path. */
export interface ClinicRouteOptions {
  prefix: string
  runner: RunClinic
}

/** Build the webServer prefix route for the clinic endpoints. */
export function createClinicRoute({ prefix, runner }: ClinicRouteOptions): {
  kind: 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
} {
  return {
    kind: 'prefix',
    path: prefix,
    handler: (req, res) => handle(req, res, runner),
  }
}

/** Serve one request: GET only, loopback Host only, summary suffix selects the projection. */
async function handle(req: IncomingMessage, res: ServerResponse, runner: RunClinic): Promise<void> {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'clinic: method not allowed' }))
    return
  }
  const host = req.headers.host ?? ''
  if (!LOOPBACK_HOST.test(host)) {
    writeJson(res, 403, { error: 'clinic: loopback host required' })
    return
  }
  const url = new URL(req.url ?? '/', `http://${host}`)
  try {
    const report: ClinicReport = await runner.run('info')
    if (url.pathname.endsWith('/summary')) {
      writeJson(res, 200, summarize(report))
      return
    }
    writeJson(res, 200, report)
  } catch (error) {
    writeJson(res, 500, { error: `clinic: ${message(error)}` })
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
