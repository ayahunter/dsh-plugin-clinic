/**
 * Browser client bundle for dsh-plugin-clinic.
 *
 * Reproduces the official workspace client-bundle recipe
 * (packages/client/tsdown.client.ts) for an out-of-tree plugin: a
 * closure-factory artifact that calls window.__ModuleLoader__.load({id,
 * factory}) and resolves externals through the injected require — the
 * loader's frozen module table. The platform-module list below is the
 * protocol constant of that table (packages/client/web/src/platform.ts);
 * every other @deepseek-ai value import would be a cross-plugin runtime
 * identity leak and is therefore bundled (or rejected by the purity gate in
 * official builds — out-of-tree builds simply must not write such imports).
 */
import { defineConfig } from 'tsdown'

/** Plugin id stamped into the __ModuleLoader__.load handoff. */
const ID = 'dsh-plugin-clinic'

/**
 * The shell's frozen module table: the platform seed entries plus the
 * documented runtime/client exemption. Anything else must inline.
 */
const EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

export default defineConfig({
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    // tsdown auto-externalizes package dependencies; anything not in the
    // loader module table must inline instead.
    neverBundle: [...EXTERNALS],
    alwaysBundle: (id: string) => !EXTERNALS.includes(id),
  },
  // Bundle node-idiom substitutions the factory would otherwise throw on.
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
