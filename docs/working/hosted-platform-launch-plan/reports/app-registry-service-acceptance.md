# App registry service acceptance

Outcome: Done. Four new runtime acceptance files pass 30 provider-free tests against the real `SQLiteAppRegistryStore`. Production source was not changed by this worker. Source and test collection are frozen for the lead's coordinated Core/UI build.

## Owned changes

Added only `packages/fluxiq/src/platform/apps/runtime/tests/{fixture.ts,mutations.test.ts,resolve-operation.test.ts,races.test.ts,boundary.test.ts}` and this report. The local fixture reuses `apps/tests/fixtures`, opens real SQLite databases beneath generated temporary roots, supplies mutable trusted authority/target ports, and verifies cleanup remains within those roots. Every executing test file carries the real-SQL marker. No storage tests, production, shared documents, or generated files were edited.

## Behavior exercised

- Configuration mutations derive workspace, installer, installation id, times, generation, and revision from trusted server ports. Identity/status injection into requested configuration fails; a lookalike untrusted context cannot authenticate itself.
- Publication requires present permission for the exact publisher, including existing-manifest registration. Permission withdrawn between initial approval and the actual SQLite guard prevents the manifest write. Install authority withdrawn before commit rolls back installation/history rows.
- Explicit updates preserve the original installer/time, increment generation/revision, retain exactly the newly approved subset, and reject stale expected revisions. Foreign workspace update/revoke is refused. Revocation records its time/generation and cannot be revived by update.
- Operation resolution requires current user/workspace authority plus exact delegated publisher, app, installation, generation, registered origin, and grant coverage from both installed consent and delegation. Expired, foreign, or missing authority fails before target lookup. Extra delegated capabilities cannot exceed installation consent, and an empty installed grant set cannot authorize a required read.
- The invocation's outer envelope rejects user/workspace/role/payer/target/grant/origin injection. Ordinary business fields with overlapping names remain data. Inputs are checked against the registered schema; undeclared operations fail. Invocation inputs do not enter installation history.
- Resolution returns only checked operation metadata. It supplies no run id, acceptance, execution status, receipt, bearer, inputs, or idempotency payload, and leaves consent history unchanged.
- An exact expected resolution can be confirmed; changed revision or digest is stale, and malformed expected metadata fails. Each valid-shaped request obtains fresh authority/target checks.
- Existing-data query resolution has `payer: { kind: "no-managed-compute-charge" }`, even when a managed target installation records a workspace account policy. Managed execution needs an explicit account policy and positive host target/account check. A denied target produces no alternate local/cloud selection. Customer-owned execution remains on its selected target with no managed compute charge.
- Target checks receive isolated clones: mutating their installation, manifest, or actor inputs cannot alter stored pins, consent, operation identity, or the returned metadata.
- Missing store/authority/target ports fail closed. Authority/target exceptions, invalid records, missing installations, and closed storage return fixed public error messages without internal details. Expired publication/install authority writes no installation.

## Awaited-boundary regressions

The tests hold real asynchronous barriers while target lookup is pending, then withdraw authority, change its user, expire it, update installation consent/generation, or revoke the installation. Every request refuses. Changing to another registered frontend origin during the target wait also refuses because the current request's origin binding changed.

Two additional regressions hold the final authority refresh, then update or revoke the installation through the service while that refresh is pending. Both return `stale_resolution`. The lead identified and repaired the production ordering issue before the first owner run: final installation equality is checked after the final awaited authority refresh. This worker added acceptance for that repair and did not edit production.

## Validation observed

`pnpm.cmd --dir packages/fluxiq exec vitest run src/platform/apps/runtime/tests --pool=forks --maxWorkers=1 --minWorkers=1` -> **4 files, 30 tests passed**: resolve-operation 10, mutations 7, races 9, boundary 4. Duration 6.82s. No provider, server, browser, or real customer data was used.

Owner-scoped structure probe used `createContext`, all repository files for import/barrel resolution, and only the 5 owned scripts as subjects. **17 rules, 0 findings**: file-lines, directory-files, class-methods, exported-values, statement-packing, swallowed-failure, failure-as-empty, as-never, test-placement, naming, import-cycles, imports, contract-spread, facade-dispatch, regexp-template-escapes, restricted-references, shared-temp-root. `git diff --check -- packages/fluxiq/src/platform/apps/runtime/tests` -> exit 0, no output.

The lead separately reported independent app kernel 40/40 acceptance and began coordinated builds; those are lead claims rather than this worker's observed validation. This worker ran no package build, package typecheck, full suite, or additional collection after the freeze signal.

Not verified: actual HTTP/user authentication or third-party PKCE, concrete host authority/target implementations, publisher identity verification, runtime/dataset execution, durable run receipts/events, compute reservation/debit/metering, browser integration, or active-active coordination. The authority and target ports are intentionally controlled test implementations around real storage. Payer tests prove explicit resolution metadata and refusals, not financial ledger integration. A future dispatcher must obtain fresh authority and an actual execution lease.

No production defect remained in the acceptance run. No mutating git was run; owned files await lead review/commit.
