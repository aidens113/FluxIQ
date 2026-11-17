# Explicit connection discovery prerequisites

Outcome: Done (source implementation; guarded web validation pending the lead's coordinated fresh dependency build). The five owned discovery source/test files are frozen. No transport, extension, app contract, IAM, other route, shared document, package metadata, build/dist or git mutation was performed.

## Frozen interface and behavior

- `packages/contracts/src/platform/discovery/discovery-document.ts` adds optional boolean `connect.flows.gatewayReferencePairing`. Missing capability stays absent/unknown. This names the existing tokenless gateway hello plus local reference approval; it is distinct from unimplemented typed Flow B `referenceCode`. The discovery version, required existing flow flags, protocol/minimum-client metadata, URL validation and stripping of unknown additive fields remain compatible. Service discovery parsing still accepts legacy documents without `instance.id`.
- `apps/web/src/app/api/discovery/build-discovery-document.ts` emits `gatewayReferencePairing: true` only for `local`/`self-hosted` with gateway enabled. Service always emits false; disabled gateway emits false. Existing service-and-enabled PKCE support remains unchanged, and typed `referenceCode` remains false.
- The service builder refuses missing or trimmed-empty `FLUXIQ_INSTANCE_ID` with `{ ok: false, fields: ["instance.id"] }`. Supplied ids retain existing trimming and schema validation. Local/self-hosted deployments may still omit an id. No build identity, random id, name or other fallback is substituted. The existing route maps refusal to HTTP 500, no-store, `discovery_misconfigured` and safe field paths only.

## Authored regression coverage

- Contracts: optional legacy absence, true/false reference-pairing capability, malformed values, future additive flow stripping, unchanged discovery version/compatibility metadata and legacy service id omission.
- Builder: all three profiles with gateway enabled/disabled, service missing/blank/invalid id (including disabled gateway), optional local/self-hosted id, stable configured id across changed artifact identity, no raw environment values in refusal, unchanged protocol/minimum-client publication.
- Route: updated local/service capability documents, configured service id, and non-cacheable safe service-id refusal. All existing checks remain in their adjacent discovery test files.

Changed test paths: `packages/contracts/src/platform/discovery/tests/discovery-document.test.ts`; `apps/web/src/app/api/discovery/tests/{build-discovery-document,discovery}.test.ts`.

## Validation and pending acceptance

- `pnpm.cmd --dir packages/contracts exec vitest run src/platform/discovery/tests/discovery-document.test.ts` → **1 file passed, 43 tests passed**.
- `git diff --check -- packages/contracts/src/platform/discovery apps/web/src/app/api/discovery` → **exit 0** (existing Git line-ending normalization notice only).
- Guarded web tests/typecheck were **not run**, as instructed, because contracts/Core/UI/client dependencies require the lead's combined fresh build first. Do not bypass the guard or test stale dist. The next narrow web acceptance is the existing web Vitest runner targeting `src/app/api/discovery/tests/build-discovery-document.test.ts` and `src/app/api/discovery/tests/discovery.test.ts`, plus the lead's coordinated web typecheck.
- No package build, dist write, whole suite, live browser/server/provider run or publication was attempted. The lead owns independent rerun and integration.

Outcome: Done
Changed: Five named discovery source/test files and this report.
Validation: Source contract discovery tests → 43/43 passed; scoped diff check → exit 0.
Not verified: Guarded web tests/types awaiting coordinated fresh dependencies; live deployment configuration/browser behavior.
Report: `docs/working/hosted-platform-launch-plan/reports/connection-discovery-prerequisites.md`
Notes: Source frozen. Optional capability is additive. Service rollout now requires configured stable identity.
