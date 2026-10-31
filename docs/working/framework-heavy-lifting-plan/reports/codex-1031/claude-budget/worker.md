# Whole-build budget propagation

Outcome: Done

## Cause and change

The Lab supplied the correct scoped allowance. The actual public
`AutomationStudioService.createFlow` materialized the pure model's ordinary
policy default, which the session resolver and bootstrap correctly treated as
a lower configured policy. The extracted creation owner initially inspected was
not wired to the public service; its class-level tests alone were insufficient.
The public service now delegates to that existing owner through its established
`saveFlow` facade. Only fresh creation supplies the isolated host's default,
in both owner branches. Existing policies never pass this boundary, so an
explicit lower value equal to the product default is preserved. No pure model
or browser default was changed and no canonical authority was invented for the
existing public facade.

A second consumer mismatch silently ignored API-accepted per-call limits above
the old literal ceiling. Runtime narrowing now uses the API's shared model
maximum and still takes the minimum with the host's allowance. The existing
invalid-value fixture now exceeds that actual shared maximum. New tests call
the real API validator before runtime narrowing.

## Validation and prior failures

- `pnpm --filter fluxiq exec vitest run ...` did not launch: PowerShell rejected
  `pnpm.ps1`; subsequent commands use `pnpm.cmd`.
- Initial new test imports: six 15-second callback timeouts (91.09 seconds).
  Sequential retry: three cold-import timeouts and three wrong-barrel export
  failures (58.01 seconds). The graph now loads during collection, warm reloads
  are sequential, owning barrel imports are used, and the timeout is unchanged.
- Earlier cast-based owner proof passed six cases (62.74 seconds), but did not
  reach the actual public service. That new file was removed. Lead audit also
  found eight `as never` casts, six bypassed barrels, and packed teardown;
  these were removed rather than hidden behind other casts.
- An initial rootless public-service case rejected an unestablished file-writing
  path (48.24 seconds total, 3.016-second case). A typed memory-facade seam then
  passed one case (45.33 seconds), but was superseded by production-faithful
  isolated file-backed cases with real save/read/writer behavior.
- The common `runtime/tests` folder would have reached 26 files. The final test
  lives in its established `service-flows/tests` feature group instead.
- Per-call red proof: `pnpm.cmd --filter fluxiq exec vitest run
  src/programs/automation-studio/runtime/llm/flow-execution-limits/tests/resolution-within-flow-settings.test.ts
  -t 'enforces API-accepted per-call cost' --reporter verbose` -> two failures,
  three passes (63.88 seconds): accepted limit 1 became 5 and accepted limit 5
  became 10. Shared-bound fix applied afterwards.
- `node scripts/structure-audit.mjs` -> initially failed only the 26-file folder;
  after relocation passed, 483 warnings and 1143 baselined entries, one existing
  entry may shrink. No baseline allowance was raised.

Final checks passed:

- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/tests/service-flows/tests/creation-budget.test.ts --reporter verbose` -> 7/7 passed, 86.38 seconds (39.22 seconds in cases; each below the unchanged 15-second limit).
- `pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/flows/tests/creation.test.ts src/programs/automation-studio/runtime/service/flows/tests/validation-context.test.ts src/programs/automation-studio/runtime/llm/flow-execution-limits/tests/resolution-within-flow-settings.test.ts src/programs/automation-studio/api/handlers/tests/llm-execution-settings.test.ts --reporter verbose` -> 29/29 passed across four files, 61.55 seconds. Includes 7 actual SQL/file creation and facade cases, 3 validation-context cases, 15 runtime-limit cases and 4 API-validator cases.
- `node scripts/structure-audit.mjs` after the final rooted tests -> passed, 483 warnings and 1143 baselined entries; one existing entry can shrink. Baseline ratchet remains lead-owned.

The main new cases use isolated temporary roots, real public save/read/writer and
persisted creation-spend stores, the real session resolver, loop limits and both
purses. The explicit override case is separate. Provider and secret access
functions throw if invoked. Cleanup checks absolute owned temporary paths.

## Limits

No new allowance endpoint or protocol. `LiveLlmRun.assertChatBuildable` compares
plan figures but cannot read a Flow before the chat creates it. The lead owns
fresh SDK/types, independent checks and an actual published production API
allowance proof before any paid retry. No browser, server, provider or paid run
was started by this worker; no git/version/shared-document mutation.

Changed: `runtime/service.ts`, `runtime/service/flows/creation.ts`,
`runtime/llm/flow-execution-limits/resolution-within-flow-settings.ts`, its existing
`tests/resolution-within-flow-settings.test.ts`, new
`runtime/tests/service-flows/tests/creation-budget.test.ts`,
`docs/architecture/automation-studio/llm-flow-bootstrap.md`, this report.
All source/test paths are relative to
`packages/fluxiq/src/programs/automation-studio/`.

Not verified: Final package type check, fresh compiled SDK, production API,
browser/extension chat and paid retry are the lead's independent checks.
Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/claude-budget/worker.md`
Notes: The former new owner-only and common-folder files were removed. No baseline growth or test timeout increase. No provider/secret calls.
