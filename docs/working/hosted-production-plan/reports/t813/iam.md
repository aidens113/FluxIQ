# t813-iam report

## Outcome
Done.

## What changed and why
- `platform/profile/resolve/resolve-profile.ts` (new): `resolveFluxIQProfile(env)`; empty or unset is `local`, invalid throws. Exported through `resolve/index.ts` and `profile/index.ts`. `deployment-settings.ts` now uses it (private copy removed).
- `programs/_shared/runtime.ts`: `GlobalProgramRuntimeOptions.iam`; the registry is built with `iam: { ...options.iam, profile: options.iam?.profile ?? resolveFluxIQProfile(process.env) }`; under `service` the gateway gets `endedSessionMaxAgeMs: 3_600_000`, otherwise nothing is passed.
- `framework/index.ts`: `FluxIQOptions.iam` with a doc comment, passed beside `heldKeys`. The type is imported from `programs/_shared/iam/index.ts` because `programs/index.ts` does not export it (one import line added).
- `create-platform-services.ts`: `PlatformServices.workspaceIam(workspaceId)` returns the same cached per-workspace store that `iamAttachments` uses.
- `docs/architecture/platform.md`: Enforcement paragraph and "Not yet wired" updated. `docs/reference/framework-reference.md` and the package copy regenerated with `pnpm docs:reference`.
- Tests (new): `programs/_shared/tests/runtime-iam-wiring.test.ts`, `platform/profile/tests/resolve-fluxiq-profile.test.ts`, `platform/provisioning/tests/workspace-iam.test.ts`.

## Commands run and observed results
- tsc under the lock, from packages/fluxiq: no output (clean).
- `pnpm test src/programs/_shared src/platform`: `Test Files 65 passed (65)`, `Tests 559 passed (559)` and `Test Files 10 passed (10)`, `Tests 38 passed (38)`. The parity output shows `"mismatches":0` for every role; the escalation output shows `"escalations":0` and `"reached":[]`.
- `pnpm structure:check` at the root: `structure-audit: passed (469 warning(s), 1152 baselined).`
- `pnpm docs:check`: `Deterministic framework reference is current.`

## Not verified
- The whole `src` suite was not run (narrow groups only, per the validation rules).
- (c) is observed through the gateway's public `connect`/`disconnect`/`snapshot` with `Date.now` mocked: two ended sessions an hour apart leave 2 under `local` and 1 under `service`. The test also checks that the `FLUXIQ_PROFILE=service` env selects service decisions. The ended-session wiring is not tested for an explicit `iam.profile` option (the code path is the same variable).
- Nothing was checked against a real `IamStore` as `source` in the registry; (b) uses a fake `fixedPolicySource`. (d) proves `workspaceIam` reads what provisioning wrote.

## Open questions or contradictions found
- Registry tests on the live runtime use `api.authorize(...)` with `user` resources (`iam:SetPin`), because the live runtime already registers project handlers and owner resolvers (re-registering throws "Duplicate ..."). Service-mode project ownership through the live runtime is therefore covered by the existing escalation test, not the new one.
- `docs/operations/data-and-state.md` and `framework/layout-v3/` show as changed in the tree; they belong to the other worker, not this lane.
- The shared lock was held by a sweep for about 50 minutes before my runs got it.
