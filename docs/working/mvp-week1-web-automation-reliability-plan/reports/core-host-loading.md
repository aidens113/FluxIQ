# Report: core-host-loading

Worker: `core-host-loading` · Repository: FluxIQ Core · Date: 2026-09-11

## Outcome

Done. The FluxIQ web panel now loads `FLUXIQ_HOST_MODULE` with a native dynamic
`import()`. A domain host built as an ES module can use Core's public exports,
for example `import { AutomationStudioNativeNodeRuntime } from "fluxiq/automation-studio"`,
with no deep `dist` import. `packages/fluxiq/package.json` needs no change. The
existing CommonJS downstream host still loads unchanged.

Caveat on the brief's "web tests pass": every host-loading test passes. The full
`@fluxiq/web` suite has 5 failures in Automation Studio UI contract tests that
have no connection to this change (evidence below).

## What changed and why

### Choice: dynamic `import()` in `apps/web`, not a CommonJS-resolvable entry

- `docs/architecture/package-boundaries.md`: "All packages are ESM-only and
  expose conditional `types` and `import` entries from `dist/`."
- `pnpm package:lint` runs `attw --pack --profile esm-only` on all three public
  packages, and attw reports CJS consumers as "ESM (dynamic import only)".
  A `require` entry would contradict Core's own lint profile.
- A `default` or `require` condition pointing at the ESM `dist` only works through
  `require(esm)`. That is unflagged only from Node 22.12, while `engines` allows
  `>=22`. This machine runs v22.11.0, where `process.features.require_module`
  prints `false`.
- A separate CJS build would create a dual-package hazard.
- Conclusion: the loader must use `import()`. With it, an ES module host resolves
  `fluxiq/*` through the `import` condition.

### `apps/web/src/lib/fluxiq.ts`

- Removed the module-level `createRequire(...)` loader.
- New `loadFluxIQHostModule(): Promise<string | null>`:
  - Resolves the configured path.
  - Imports it with
    `import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ pathToFileURL(path).href)`.
  - Validates that it exports a registration function.
  - Caches `{ path, register }` on `globalThis.__fluxiqWebHostModule`. It lives on
    `globalThis` because Next bundles `instrumentation.ts` separately from routes.
- Export lookup order:
  1. The namespace's `registerFluxIQHost`.
  2. `registerFluxIQHost` on `module.exports`. A CJS host loaded through `import()`
     exposes `module.exports` as `default`.
  3. A default function.
  4. `module.exports.default`.

  This keeps the old precedence for both module kinds.
- `applyFluxIQHostModule()` stays synchronous, so `getFluxIQ()` and all ~19
  route and page callers are unchanged. It now applies the cached registration.
  If a host module is configured but was never loaded, it throws
  `FLUXIQ_HOST_MODULE has not been loaded; await loadFluxIQHostModule() ...`.
- `ERR_PACKAGE_PATH_NOT_EXPORTED` during load is rethrown as guidance, with the
  original error kept as `cause`:
  `FluxIQ packages are ESM-only, so a host that imports them must be an ES module (.mjs, or .js under "type": "module")`.
- `reloadFluxIQWebInstance()` awaits the load before closing anything, so a host
  that fails to load leaves the old runtime serving.

### `apps/web/src/instrumentation.ts` (new)

- `register()` awaits `loadFluxIQHostModule()` once per server start, only when
  `NEXT_RUNTIME === "nodejs"`.
- Next 15.5.23 awaits it before serving. `next/dist/server/next-server.js:637-638`
  has `await super.prepareImpl(); await this.runInstrumentationHookIfAvailable();`,
  and the dev server inherits `prepareImpl`.
- This file is host-loading code; it has no other purpose.

### `apps/web/src/lib/tests/fluxiq.test.ts`

Existing tests:
- The five tests that configure a host (the named and default apply tests, the
  sole-domain test, and both reusable-context lifecycle tests) now await the load.
- `afterEach` clears the cache.

Three new tests:
- Refuses to apply a configured host that was never loaded.
- An ES module host that imports `fluxiq/automation-studio` binds a native
  runtime (`nativeRuntimeSummary().bound === true`).
- A CommonJS host that `require()`s that subpath gets the ESM-only guidance.

The two new host-resolution tests write their host under
`apps/web/node_modules/.cache/`. That directory is gitignored by
`.gitignore:1:node_modules` and removed in `finally`. From there, `fluxiq`
resolves through its exports map as it does in an importing repository.

## Commands run and observed results

**1. Reproducing the defect**
- `node -e "require('fluxiq/automation-studio')"` in the downstream `domain/` →
  `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- A native ESM `import('fluxiq/automation-studio')` in `apps/web` →
  `AutomationStudioNativeNodeRuntime` is a `function`.

**2. `pnpm --filter @fluxiq/web check`** → `tsc --noEmit`, exit 0.

**3. `pnpm exec vitest run src/lib/tests/fluxiq.test.ts`** (in `apps/web`) →
`1 passed (1)`, `13 passed (13)`.

**4. `pnpm check`** → `structure-audit: passed (117 warning(s), 256 baselined).`
Then `packages/contracts`, `apps/web`, `packages/client-gateway-websocket` and
`packages/fluxiq` all reported `check: Done`. Exit 0.

**5. `pnpm package:lint`** → exit 0 (publint strict, and attw `--profile esm-only`
on all three packages). attw prints `node16 (from CJS): (ignored) ⚠️ ESM (dynamic import only)`.

**6. `pnpm --filter @fluxiq/web test`** → `Test Files 5 failed | 222 passed (227)`,
`Tests 5 failed | 1141 passed (1146)`, exit 1.

The failures:
- `graph/tests/derivation-job.test.ts`
- `hierarchy/tests/phase7-contracts.test.ts`
- `testing/tests/synchronous-interaction-trace.test.ts`
- `views/tests/GraphEditorViews.test.ts`
- `workspace/cache/tests/cache.test.ts`

All five are under `src/features/automation-studio/`. Examples:
`expected 'runtime-debug::object::flow.one' to be 'runtime-debug'`, and
source-contract checks `expected '...' to contain '"flow-nodes": () => import("../flow-e…'`.

Why they are unrelated to this change:
- Run alone, they fail the same way (`5 failed | 41 passed (46)`).
- `grep` for `lib/fluxiq|instrumentation|FLUXIQ_HOST_MODULE|loadFluxIQHostModule`
  in those five files returns nothing (exit 1).
- The files they test are unmodified in the working tree.

**7. `pnpm --filter @fluxiq/web build`** (`next build --turbopack`) → exit 0.
Every route is `ƒ (Dynamic)`.
- The compiled server chunk keeps a native import:
  `async function yb(e){try{return await import((0,t2.pathToFileURL)(e).href)}catch(t){if(t?.code==="ERR_PACKAGE_PATH_NOT_EXPOR…`
- `.next/server/instrumentation.js` loads `server/chunks/apps_web_src_b4de74ab._.js`.
  That chunk references `server/chunks/_5581c460._.js`, which contains the loader.
- `git status` afterwards showed no tracked file changed by the build.

**8. Scratch proof**, in `C:\Users\mrjoh\AppData\Local\Temp\claude\f---FluxIQWebExtension\2677150e-fabf-4de7-a29b-ed7919f99ef7\scratchpad\core-host-loading\`.

Setup:
- `build-proof.mjs` uses the downstream's esbuild 0.24.2, read-only.
- It takes the downstream `domain/src/web-panel-host.ts` and swaps its deep
  `dist` import for `import { AutomationStudioNativeNodeRuntime } from "fluxiq/automation-studio";`.
  The result is saved as `web-panel-host.public-import.ts`.
- It builds that source with the downstream build script's options into
  `host/web-panel-host.mjs` (ESM) and `host/web-panel-host.cjs` (CJS). Each has
  exactly one external `fluxiq/automation-studio` import.
- It bundles the panel loader `apps/web/src/lib/fluxiq.ts` twice, with `fluxiq`
  external: the working tree as `loader/fluxiq-after.mjs`, and
  `git show HEAD:apps/web/src/lib/fluxiq.ts` as `loader/fluxiq-before.mjs`.
- `node_modules/fluxiq` is a junction to `F:\!FluxIQ\packages\fluxiq`.
- `prove.mjs` calls `loadFluxIQHostModule()` when the loader has it, then
  `createFluxIQWebInstance()`, against a scratch importer root.

Results on Node v22.11.0:

```text
=== fluxiq-after.mjs web-panel-host.mjs
{"activeDomainId":"web-automation","nativeRuntime":{"bound":true,"definitionCount":11,"recordingMapperCount":1},"recordingDomains":["web-automation"],"ioInputs":9,"ioOutputs":11}
RESULT: loaded
=== fluxiq-before.mjs web-panel-host.mjs
RESULT: failed ERR_REQUIRE_ESM require() of ES Module ...\host\web-panel-host.mjs not supported.
=== fluxiq-before.mjs web-panel-host.cjs
RESULT: failed ERR_PACKAGE_PATH_NOT_EXPORTED Package subpath './automation-studio' is not defined by "exports" in ...\node_modules\fluxiq\package.json
=== fluxiq-after.mjs web-panel-host.cjs
RESULT: failed  FLUXIQ_HOST_MODULE could not resolve a package export. FluxIQ packages are ESM-only, so a host that imports them must be an ES module (.mjs, or .js under "type": "module"): ...\host\web-panel-host.cjs
  cause: ERR_PACKAGE_PATH_NOT_EXPORTED Package subpath './automation-studio' is not defined by "exports" in ...\node_modules\fluxiq\package.json
=== fluxiq-after.mjs downstream-deep-import.cjs   (copy of the current downstream dist/host/web-panel-host.cjs)
{"activeDomainId":"web-automation","nativeRuntime":{"bound":true,"definitionCount":11,"recordingMapperCount":1},"recordingDomains":["web-automation"],"ioInputs":9,"ioOutputs":11}
RESULT: loaded
```

## Not verified

- **A live `next dev` or `next start` server.** I was not authorized to start the
  panel. That `register()` runs before the first request is inferred from Next's
  source and the compiled output, not observed.
- **Other Node versions and platforms.** Only Node 22.11.0 on Windows was
  exercised, not Node ≥ 22.12 or Linux CI.
- **Whether the 5 failing web tests also fail at `HEAD`.** I could not isolate them
  from the concurrent workers' edits without stash or worktree. They are shown to
  be independent of this change, not shown to predate it.
- **Test-environment difference.** Under vitest, the older `.cjs` fixtures in
  `os.tmpdir()` run through vite-node's CommonJS shim rather than Node's CJS
  loader. The two new resolution tests sit under `node_modules`, so vitest loads
  them natively. The scratch proof ran in plain Node.
- **Commands not run.** Root `pnpm test` and root `pnpm build` were not run; only
  the `@fluxiq/web` suite and the web build were. The downstream repository's
  checks were not run with an ESM host.

## Open questions or contradictions found

1. **Downstream follow-through (supervisor):**
   - In `domain/src/web-panel-host.ts`, replace lines 2–7 (the comment and the deep
     `../../../!FluxIQ/packages/fluxiq/dist/...` import) with
     `import { AutomationStudioNativeNodeRuntime } from "fluxiq/automation-studio";`.
   - In `domain/scripts/build-web-panel-host.mjs`, set `format: "esm"` and change the
     output file to `web-panel-host.mjs`.
   - Point every downstream `FLUXIQ_HOST_MODULE` setting at the `.mjs` file. I did
     not look up where downstream sets it.
   - The scratch ESM build of today's domain sources loaded cleanly.
2. **Docs I did not own, which are now inaccurate:**
   - `docs/operations/data-and-state.md:45-46` says the value "must be a path to a
     CommonJS module". Proposed replacement: "must be a path to a module that
     exports either `registerFluxIQHost(fluxiq)` or a default synchronous
     registration function. The web server loads it once at startup with a native
     `import()` (`apps/web/src/instrumentation.ts`). Build it as an ES module
     (`.mjs`, or `.js` under `"type": "module"`): FluxIQ packages are ESM-only, and
     only an ES module host can import public subpaths such as
     `fluxiq/automation-studio`. A CommonJS host still loads if it imports nothing
     from FluxIQ at runtime."
   - `docs/integrations/automation-studio-importing-repos.md`, after "The
     registration must be synchronous:" (~line 656). Add that the host must be an
     ES module and that it must never deep-import `dist/` paths.
3. **New contract.** Any entry point other than Next that calls `getFluxIQ()` or
   `createFluxIQWebInstance()` with `FLUXIQ_HOST_MODULE` set must first
   `await loadFluxIQHostModule()`. Searching `apps/web/src` and the rest of Core
   found no such caller.
4. **Two copies of `fluxiq` in the web process.**
   - Next bundles `fluxiq` from `src` via tsconfig `paths` and `transpilePackages`.
     An ESM host imports `dist` natively.
   - The same split already exists today with the esbuild-inlined deep import.
   - It works because binding is duck-typed: there is no
     `instanceof AutomationStudioNativeNodeRuntime` in `packages/fluxiq/src`, and
     `bound` is `Boolean(runtime)`. Adding `instanceof` checks on host-supplied
     objects would break it.
5. **Leftovers.**
   - The scratch directory holds a directory junction
     `node_modules/fluxiq → F:\!FluxIQ\packages\fluxiq`. If cleaning up, remove the
     junction itself, never its target.
   - `apps/web/.next/` was left by the build (gitignored).
