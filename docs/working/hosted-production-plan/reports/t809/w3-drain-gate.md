# w3 drain gate

## Outcome
Partial. The gate is written and the apps/web typecheck is clean. The vitest run was blocked by the stale-Core-dist guard, so the new tests have not run.

## What changed and why
- `apps/web/src/lib/program-drain-refusal.ts` (new): `programDrainRefusal(programId, endpoint)` returns a 503 refusal when `drainState.isDraining()` and the endpoint starts work, else null. It only applies to `automation-studio`.
  - Body: `{ok:false, error:"The server is restarting and is not starting new builds or runs; try again in a moment.", errorCode:"server.draining"}`.
  - Retry-After is a fixed 30 seconds. The drain seconds are only available through the private `resolveDrainSeconds` in `lib/fluxiq.ts`, which I did not widen.
  - Refused set: `start-runtime-session`, `run-runtime-session`, `resume-runtime-session`, `append-turn`, `generate-flow-bootstrap-adaptation`, `start-client-recording`, `execute-client-action`.
  - Allowed while draining: every read, cancel/pause/stop (`cancel-runtime-session`, `pause-runtime-session`, `cancel-flow-bootstrap`, `stop-client-recording`), `answer-ask`, and `capture-client-snapshot`. I judged `answer-ask` to continue a build already in progress, not start one.
  - I left the recording-processing endpoints alone (`process-finalized-recording`, `generate-recording-proposal`, and similar). `recordings.ts` belongs to another worker, and the brief did not list them.
- `apps/web/src/app/api/programs/[programId]/[endpoint]/route.ts`: GET and POST call `refuseWhileDraining` straight after `authenticate`. That is before the body is read, before paired-client narrowing and before `api.call`, for both caller kinds. Unauthenticated callers still get a 401, so they learn nothing about drain state. The refusal is built directly with `NextResponse.json`, so `refuse()`'s narrow `errorCode` type is unchanged.
- Tests: `apps/web/src/lib/tests/program-drain-refusal.test.ts` and `apps/web/src/app/api/programs/[programId]/[endpoint]/tests/route-drain.test.ts`. They cover a start endpoint refused while draining, a read and a stop not refused, and nothing refused when not draining. Both reset `drainState` after each test.
- No automation-studio route needed a change. `run-datasets` and `state-assets` only read.

## Commands run and observed results
Both ran under the heavy-check lock, from `apps/web`.
- `pnpm exec tsc --noEmit -p .` -> `tsc exit 0`.
- `pnpm exec vitest run src/server src/lib src/app` -> `vitest exit 1`. Vitest failed to load `vitest.config.ts`: "Core's library build is 9 minute(s) behind its source. Stale: packages/fluxiq/src/programs/automation-studio/api/handlers/conversations.ts is newer than dist". No test ran. The guard has no bypass.

## Not verified
- The new tests and the rest of `src/server src/lib src/app` have not run.
- To run them: rebuild Core with `pnpm --filter @fluxiq/contracts --filter fluxiq build` once the other workers' edits to packages are settled, then rerun the vitest command. I did not rebuild, because dist is shared and the other workers are still editing `packages/`.
- I did not run `pnpm structure:check`.

## Open questions
- Whether `start-client-recording` should be refused. I included it. It is easy to drop from the set if a recording should be allowed to begin during a drain.

Outcome: Partial
Changed: apps/web/src/lib/program-drain-refusal.ts, apps/web/src/lib/tests/program-drain-refusal.test.ts, apps/web/src/app/api/programs/[programId]/[endpoint]/route.ts, apps/web/src/app/api/programs/[programId]/[endpoint]/tests/route-drain.test.ts
Validation: `pnpm exec tsc --noEmit -p .` -> exit 0; `pnpm exec vitest run src/server src/lib src/app` -> config load refused (stale Core dist), no tests ran
Not verified: the new tests have not run; structure:check
Report: docs/working/hosted-production-plan/reports/t809/w3-drain-gate.md
Notes: Rebuild Core dist, then rerun vitest.
