# P4 `@fluxiq/sdk`: worker report

Worker: sonnet, task t882 (branch `task/t882-fluxnode-sdk`). Nothing committed.

## Outcome

Done. `packages/sdk` (`@fluxiq/sdk` 0.1.0) builds, typechecks, packs clean (publint and attw), and its 82 tests pass (2 skipped, POSIX-only). The structure audit passes with no new warning.

## What changed and why

- `src/schema/`: zod v3 to the contracts' subset converter written here (no new dependency), `normalizeTypeSchema` (drops `pattern` beside `format`; bare `pattern` is an `SdkError` naming the path and suggesting a format), `typeSchemaFrom` (validates with `parseJsonTypeSchema`).
- `src/define/`: `defineFluxNode` validates with `parseFluxNodeSpec`; typed `check`; `hash()` is lazy because the contracts' hash is async.
- `src/keys/`: credential chain, INI credentials, key loading (PEM or `fxkey1.`), key id, owner key generation, and `signing/` (the only place the string to sign is written).
- `src/session/`: key proof, session reuse, renewal at 80%, clock-skew retry once from the engine's `serverTime`.
- `src/client/`: `FluxIQ.connect/run/stream/resume/learn/register/getRun/listRuns/stop/exportFlow/follow`, transport (401 renews once, typed `FluxNodeApiError`, answers checked against contracts schemas), SSE reader with reconnect by last id, and answering of `check_needed`, `person_needed`, `transform_needed`.
- `src/pipeline/`: `pipeline(name).fromDataset|fromInput|fromFlow(...).map|filter|transform|dedupe|join|sort|limit|aggregate|validate|sink|outputs.build()`, validated by `parseDataPipeline`; function transforms and sinks become named callbacks.
- `src/cli/`: bin `fluxiq` with `init`, `runs`, `inspect`, `pin`, `learn`, `dev`, `help`.
- `src/tests/fake-engine/`: the fake server (contracts' HTTP description, SSE, key exchange verified against the design's string written out independently).
- Workspace lists: `scripts/build-cache/steps.mjs` (`library("sdk")`), root `package.json` (`build`, `check`, `package:lint` gain sdk), `pnpm-lock.yaml` (new importer, from `pnpm install --offline`).

## Decisions where the brief was silent (lead may overrule)

1. A run that ends `budget_out`, `stopped` or `waiting_for_person` is returned, not thrown: `RunOutcome<O>` is a union to narrow on `status`. Only an achieved run has typed `outputs`.
2. An achieved run's outputs are re-validated against the declared type; a miss throws `invalid_outputs`.
3. A failed, false, non-boolean or throwing check answers `pass: false` with a reason, never ends the run. A `check_needed` for a node with no check answers a failure saying so.
4. Without `onPersonNeeded` the SDK sends no answer; the engine ends the run `waiting_for_person`.
5. Chain beyond the brief: `fluxiq.config.json` `profile` and `endpoint` (a key in it is refused), and the implicit `[default]` profile (K5). A profile's `key_file` must lie inside `~/.fluxiq/keys/`; `FLUXIQ_KEY_FILE` and `keyFile` may point anywhere.
6. Against an engine whose `/api/keys/session` answers 404, the implicit `[default]` key falls back to unkeyed calls (open mode, per K8 "always signs when it finds one"); an explicit key throws. This is the only fall-through and it is the engine's, not a broken key's.
7. Every call carries `FluxIQ-Client: sdk` (K8 open-mode guard).
8. Default engine address `http://127.0.0.1:4780` (the keys design's example); `local` means that.
9. Windows key files: `fluxiq init` sets an owner-only ACL with `icacls`; the SDK checks group/world read only on POSIX.

## Commands run and observed results

From `packages/sdk`:
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` -> exit 0, no output. `pnpm run check` -> `sdk:check` ok.
- `pnpm test` -> `Test Files 17 passed (17)`, `Tests 82 passed | 2 skipped (84)`.
- `pnpm run build` -> `sdk:build` ok; `dist/` has no `tests/`. Compiled bin: `node dist/cli/bin.js init` (with `FLUXIQ_CONFIG_DIR` in a temp dir) created `credentials`, `keys/owner.pem`, `keys/owner.pub`, printed the key id and no private key; `runs --url http://127.0.0.1:1` printed "Could not reach the engine ... Start it with `fluxiq dev`" and exited 1.
- Acceptance test `src/tests/sample-program.test.ts` passed: a `program.mjs` in a temp dir (imports `@fluxiq/sdk`, defines the plan's node) runs through `fluxiq init`'s key and the fake engine with keys required. It received typed `listings`, verdict `confirmed by check`, two `check_needed` events (first answered `pass:false, reason:"wrong number of listings"`, second `pass:true`), one `person_needed` answered `done`, and a final `ended`.
- From the worktree root: `node scripts/structure-audit.mjs` -> `structure-audit: passed (534 warning(s), 1097 baselined).` (same 534 as before; none in `packages/sdk`). The first run had 3 failures (empty-on-failure body read, a barrel-skipping import, a `pipeline-` filename prefix), all fixed.
- `node --test "scripts/build-cache/tests/*.test.mjs"` -> 74 pass, 0 fail (registry test accepts the new step).
- `publint packages/sdk --strict` -> "All good!". `attw --pack --profile esm-only packages/sdk` -> node16 (ESM) and bundler green.

## Not verified

- No real engine: the server halves (`/api/keys/session`, `/.well-known/fluxiq` `instance.id`, the error shape of key refusals `{error:{code:"key.*", serverTime}}`, `expiresAt` as epoch ms or ISO) follow the keys design and are assumptions until P3b.
- Not run: `pnpm check`, the full workspace build, `scripts/validate-packages.mjs` (its package list does not name the SDK; left alone).
- `fluxiq dev` against the real engine: the engine package has no `bin` yet (tested with a stand-in bin). `fluxiq learn` loads `.js`/`.mjs` only.
- POSIX permission paths (mode 0600/0700 and the insecure-file refusal) have tests that were skipped on this Windows machine. The Windows ACL step ran and was not inspected beyond not failing.
- Live browser, WebSocket and real model behaviour: out of scope here.

## Open questions or contradictions found

1. **Pipelines cannot be run.** The HTTP contract has no way to register or start a pipeline (`runs` takes `spec`, `name` or `resumeHandle`; `specs` takes a FluxNode spec). `pipeline().build()` gives the definition and callbacks, but `FluxIQ` has no `runPipeline`. Contracts need a `pipeline` member on the run request or a `pipelines` endpoint.
2. `FluxNodeRunRequest` has no field to carry SDK transforms' names for a plain FluxNode; `transform_needed` is served from `RunOptions.transforms` only.
3. The root `package.json` `publishConfig` makes `@fluxiq/sdk` publishable: `promote` will publish it at 0.1.0 once on `main`. Confirm that is wanted.
4. `docs/architecture/package-boundaries.md` still lists four packages; I did not touch it (not owned). It needs an `@fluxiq/sdk` row.
5. `pnpm-lock.yaml` changed by 19 lines for the new importer; the worktree's `pnpm install --offline` made it.
