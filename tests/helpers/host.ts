/**
 * Test host plugin for composition tests: provides a minimal tools registry
 * (the real dsh-tools service drags in the full agent/session stack) and
 * records registrations so tests can assert the clinic tool was mounted.
 * The tools registry is the one external service the composition mocks;
 * Loader, webServer, the plugin under test, and the filesystem are real.
 * @module dsh-plugin-clinic/tests/helpers/host
 */

import type { Context } from '@deepseek-ai/cordis'

/** Minimal tool registration surface matching what the clinic needs. */
export interface TestToolRegistry {
  register(tool: { name: string; execute(args: Record<string, unknown>): Promise<unknown> }): () => void
  list(): string[]
  get(name: string): { name: string; execute(args: Record<string, unknown>): Promise<unknown> } | undefined
}

/** Cordis plugin name. */
export const name = 'test-host'

/** Register the test tools service on the context. */
export function apply(ctx: Context): void {
  const registry = new Map<string, { name: string; execute(args: Record<string, unknown>): Promise<unknown> }>()
  const service: TestToolRegistry = {
    register(tool) {
      registry.set(tool.name, tool)
      return () => registry.delete(tool.name)
    },
    list() {
      return [...registry.keys()]
    },
    get(name) {
      return registry.get(name)
    },
  }
  ctx.provide('tools', service)
}
