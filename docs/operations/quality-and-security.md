# Quality And Dependency Security

FluxIQ uses layered validation rather than treating one broad percentage or
tool as proof of correctness.

## Required Gates

```bash
pnpm check
pnpm quality:check
pnpm quality:coverage
pnpm test
pnpm build
pnpm docs:check
pnpm audit --prod --audit-level high
pnpm package:lint
pnpm package:smoke
```

`quality:coverage` is deliberately focused on authorization, persistence,
login lockout, and program-route behavior. It enforces thresholds only for
those named modules; it does not claim repository-wide UI coverage.

Biome adoption is allowlisted in `biome.json`. Newly maintained critical files
should be added to that list, while broad formatting changes should remain
separate from behavioral work.

## Build And Check Cache

Every package's `build` and `check`, and the plain structure audit, run
through `scripts/build-cache/`, a content-fingerprinted stamp-and-skip cache.
A package script runs
`node ../../scripts/build-cache/cli.mjs <step> -- "<command>"`, where `<step>`
is a name in the registry `scripts/build-cache/steps.mjs` (`contracts:build`,
`fluxiq:check`, `web:build`, `structure-audit:check` and so on). The CLI
refuses a command that differs from the registry's, so the two cannot drift
apart. The root `build` and `check` pass several steps to the same CLI, which
runs them in-process in workspace dependency order, and `check` runs the type
checks in parallel. Each step prints one line:
`{"build-cache":"reuse"|"build","step":…,"reason":…,"ms":…,"source":"stamp"|"store"|"command"}`.
Tests are never cached.

A step is reused only when all of these hold (`decide-step.mjs`):

- its stamp exists and has the current `STAMP_VERSION`;
- its fingerprint equals one taken now: a sha256 over its inputs and its
  metadata (command, `process.version`, platform, and the environment
  variables the registry names, such as `NODE_ENV` and every `NEXT_*` for the
  web build). The inputs are the git-visible files of the package and of every
  workspace package it depends on, each dependency's ignored `dist/`, the
  ignored inputs the registry names (`apps/web/.env*`, `.next/types`), the
  root manifests, lockfiles and `tsconfig.base.json`, the installed
  `node_modules/.pnpm/lock.yaml`, and the cache's own sources. The audit's
  inputs are every git-visible file. Runtime data in ignored directories never
  invalidates a step;
- every required output exists (`dist/index.js` and `dist/index.d.ts` for a
  library, `.next/BUILD_ID` for the web build);
- the outputs' digest equals the one stamped.

Anything else is a build, and the reason names the first condition that
failed. On a miss the command is byte for byte what the package ran before the
cache, `--clean` and the declaration rewrite included, so its output is
unchanged. A build removes the stamp before it runs and writes it only when the
command succeeded, every required output exists, and the inputs did not change
while it ran; a check is stamped only when it passed. A reused audit replays
the output it printed when it passed. A reuse leaves output timestamps alone
unless an input is newer than every output, and then moves only the required
files to now, so downstream guards that read `dist` modification times see
neither a phantom rebuild nor a stale build.

| What | Where |
| --- | --- |
| Stamps and step locks | `<package>/node_modules/.cache/fluxiq-core-build/<step with : as ->.json` and `.json.lock` |
| Stat cache | `<repository>/node_modules/.cache/fluxiq-core-build/stat-cache.json` |
| Incremental check state | `<package>/node_modules/.cache/fluxiq-build/check.tsbuildinfo` |
| Shared store | `%LOCALAPPDATA%/fluxiq-build-cache/core` on Windows, otherwise `$XDG_CACHE_HOME/fluxiq-build-cache/core` or `~/.cache/fluxiq-build-cache/core` |

The store is one per user and machine, outside every checkout, and shared by
every worktree: an entry lives under `<store>/v1/<fingerprint>/`, keyed by the
path-independent fingerprint, so a new worktree restores what another built,
and a restore is verified against the stored digest. An output that embeds its
tree's absolute path (`.next`) is stored for that tree only. The downstream
web-extension repository keeps its entries at the top of the same
`fluxiq-build-cache` directory; Core's live under `core/` with their own
pruning. The store prunes itself after every write: entries unused for 14 days,
then the least recently used while it holds more than 5 GB. A per-step lock
stops two processes building one step in one tree at once; the waiter decides
again and normally reuses.

```bash
FLUXIQ_BUILD_FORCE=1 pnpm build          # rebuild every step; the store is not consulted
FLUXIQ_BUILD_CACHE_DIR=<dir> pnpm build  # use <dir>/core as the store
FLUXIQ_BUILD_CACHE_DIR=off pnpm build    # no store: stamps only, per tree
pnpm build-cache:prove                   # prove every file the compilers load is fingerprinted
```

Downstream, the web-extension repository's `buildCore`
(`scripts/worktree/core-build.mjs` with `cache-delegation.mjs`) delegates to
this cache: when a Core checkout has `scripts/build-cache/cli.mjs` and a
package's `build` script runs it, `buildCore` runs that script unwrapped, lets
Core decide, and reports `"build-cache":"delegated"`. A Core checkout without
the CLI is built the way it was before.

## Dependency Ownership

Packages normally declare dependencies they import directly. The framework
runtime owns native SQLite and QR generation; TypeDoc remains
development/optional tooling rather than an ordinary runtime install. The web
app also declares `sqlite3` because Next externalizes native addons and must be
able to resolve that runtime package from the deployed application boundary.
It does not duplicate YAML or Zod merely because another workspace package
uses them.

The root pnpm overrides pin patched PostCSS and Sharp releases required by the
current compatible Next.js 15 line. They address high-severity transitive
advisories while avoiding an unrelated major Next.js upgrade. Remove an
override only after the owning dependency requires an equal or newer safe
version and `pnpm audit --prod --audit-level high` remains clean.

See the repository root `SECURITY.md` for private vulnerability reporting and
security boundaries.

## Web Login And Bootstrap Setup

The web login uses staged password and authenticator entry. It does not publish
bootstrap credentials in normal interface copy. When the framework bootstrap
administrator authenticates with the temporary credential, the login response
marks that session for credential setup and the web app requires an authorized
self-password rotation before opening the program directory.

The setup password is at least 12 characters and cannot reuse the bootstrap
value. Login preserves entered values across server errors, reports Caps Lock,
supports password visibility, and shows a live lockout countdown. This
bootstrap detection is a compatibility boundary for the current default-admin
runtime; future identity metadata may replace it without changing the UI flow.