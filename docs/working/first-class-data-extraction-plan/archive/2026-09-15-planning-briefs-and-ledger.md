# First-Class Data Extraction Plan (Core share): planning archive

Superseded detail moved from [the plan](../../first-class-data-extraction-plan.md)
on 2026-09-15 to keep it under the 800-line compaction threshold: completed
worker briefs and the planning-phase ledger entries. Their
results are folded into that document's Decisions and Design sections.

## Planning-time findings about Core

**What is true in Core today: datasets** (`ex-b-core`, file:line in its report):
- A domain output's payload becomes node output `result`
  (`AS/runtime/io-policy.ts:113`) and is saved only in the runtime session trace
  (`projects/{id}/runtime/sessions/{runId}.json`), read with
  `get-runtime-session`. Run-detail attempt records carry no inputs or outputs
  (`AS/runtime/service/summaries/conversions.ts:137-174`).
- The saved trace withholds every `$state`-resolved value and run input,
  substring-wide, so extracted text containing a run input reads `[withheld]`
  (`AS/runtime/executor/trace-withholding.ts:1-46`).
- No dataset concept exists. `builtin.control.loop` keeps no counter or item;
  runtime variables are rebuilt per node, so `set-variable` writes are lost
  (`AS/runtime/executor/node-execution.ts:102`); `$state` paths cannot reach
  recorded nodes' outputs because their ids contain dots
  (`AS/nodes/parameter-bindings.ts:118-128`).
- A domain mapper can already propose `web.dom.extract_list`; approval writes it
  as `builtin.policy.action` with `expectedState`
  (`AS/runtime/service/recordings/proposal-candidates.ts:90-133`).
- The program API returns JSON only; domains cannot contribute web views or
  commands; Runtime Debug has an Export Audit precedent and a generic
  `DataTable`.
- Runtime command attempts save a domain's `result.payload` in clear
  (`FX/runtime/storage.ts:51-57`; `FX/runtime/service.ts:429-437` withholds only
  `message` and `error`), before Automation Studio sees the result.
- `export-flow-run-audit` has no registered handler, so Runtime Debug's Export
  Audit button gets a 404 (`AS/api/contracts/endpoints.ts:147`; nothing under
  `AS/api/handlers/` registers it). Nothing purges runs, sessions, or content
  objects (`AS/storage/project/retention-store.ts:35-58` has no production
  caller). The baselined `AutomationStudioService` is frozen at 6,807 lines and
  223 members (`k-datasets-execution` §1.2).

**What is true in Core today: credentials and keys** (`k0-secret-keys-kdf`,
`k11-encrypted-fields`):
- Four password sites (the Secret Keys value seal; Identity Access's credential
  seal, password hash, and PIN hash) call `scryptSync(value, salt, 32)` at
  Node's default cost, N=2^14, and record no parameters
  (`FX/programs/secret-keys/runtime/service.ts:456-461`;
  `FX/programs/identity-access/runtime/service.ts:631-663`).
- Defects found by reading, all taken into K0 (CD5):
  - a Secret Keys metadata edit stops that key unlocking at login;
  - a password change leaves the user's Secret Keys unreadable;
  - the PIN verifier hash is persisted outside the seal, so a 4-12 digit PIN
    is guessable offline at any cost;
  - session ids, the cookie bearer values, are stored raw;
  - `createRevealAuthorization` derives a key without checking it opens;
  - unknown usernames return before any derivation, a timing oracle;
  - Database Manager `put-record` and `delete-record` on `identity.users` and
    `secret.keys` skip the credential recheck that reads require
    (`FX/programs/database-manager/api/handlers.ts:64-84` against `:97-124`).
- Core has no project membership, no API tokens, and no Flow scheduler; an
  ordinary run carries no identity; `Repository` has no compare-and-set.

## Worker Briefs

### Brief: k0-secret-keys-kdf
- Repository: FluxIQ Core (`F:\!FluxIQ`), read-only
- Task: list every password-derived key and password hash in Core (scrypt,
  pbkdf2, argon2, bcrypt, or a digest of a password): Secret Keys, Identity
  Access, and any other site. For each give file:line, parameters, what the
  stored record carries, and the paths that create, read, unlock, log in,
  change a password or PIN, and delete it, plus existing tests. Design the fix:
  a versioned record that stores its KDF parameters; new seals at scrypt
  N=2^17, r=8, p=1 with `maxmem` sized to fit, or a justified stronger choice;
  reading older records; re-sealing them at the next successful unlock or login
  with no user step; concurrent unlocks; login latency (one timing of each cost
  with a dummy password, disclosed as a single observation on faulty RAM);
  compatibility and version impact; documents to update. Give exact files,
  ordered steps, test files and cases, and mutation targets.
- Required reads: `AGENTS.md`; `packages/fluxiq/src/programs/secret-keys/**`;
  `packages/fluxiq/src/programs/identity-access/**`;
  `docs/architecture/automation-studio/persistence.md`; this document's Current
  State and open question 6
- Owns (may edit): its report only
- Must not touch: all source, documents, and `.fluxiq` data; never print or
  persist a secret, password, hash, or key
- Definition of done: every site listed with file:line and parameters; the fix
  designed with steps, tests, and compatibility
- Report to: docs/working/first-class-data-extraction-plan/reports/k0-secret-keys-kdf.md

### Brief: k11-encrypted-fields
- Repository: FluxIQ Core (`F:\!FluxIQ`), read-only
- Task: design Core's share of the downstream Encrypt column (D13). Document
  the identity model (accounts, domain scopes, whether several accounts can
  open one project); how login creates the session-scoped Secret Keys unlock
  and one-use reveal authorizations; how the project-content protection key
  resolver is supplied today, if at all; how runs start (web panel, API,
  schedules, unattended) and what identity they carry; where per-account sealed
  material can live outside project content. Recommend: the key hierarchy
  (per-project key pair, X25519 with HKDF and AES-256-GCM or RSA-OAEP, with
  reasons; a per-dataset data key wrapped by the public key with a random IV
  per value, or per-value keys); wrapping the private key per account and
  re-wrapping on password change or membership change; rotation; Reveal and
  export authorization with audit events carrying IDs and counts only; fail
  closed behaviour; what a stored encrypted cell holds; contracts; files,
  ordered steps, tests, mutation targets; compatibility.
- Required reads: `AGENTS.md`; `packages/fluxiq/src/programs/secret-keys/**`;
  `packages/fluxiq/src/programs/identity-access/**`;
  `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts`
  and its callers; `docs/architecture/automation-studio.md`;
  `docs/architecture/automation-studio/persistence.md`; this document's Design
  and open questions 5-6; `reports/ex-b-core.md`
- Owns (may edit): its report only
- Must not touch: all source, documents, and `.fluxiq` data; never print or
  persist a secret, password, hash, or key
- Definition of done: every question answered with file:line; one recommended
  design with steps and tests
- Report to: docs/working/first-class-data-extraction-plan/reports/k11-encrypted-fields.md

### Brief: k-datasets-execution
- Repository: FluxIQ Core (`F:\!FluxIQ`), read-only
- Task: turn phases K1-K10 into executable steps. Verify `reports/ex-b-core.md`
  and this document's Design against code, then give per phase: files to create
  or change with the function or type touched (file:line); new exports; test
  files under `tests/` with cases; the acceptance command; mutation targets.
  Settle with evidence: current `fluxiq` and `@fluxiq/contracts` versions and
  where Migration Notes live; the permission and domain-scope check for each
  dataset endpoint, named as existing handlers name them; how runs, sessions,
  and content objects are retained and purged today and how datasets follow;
  row and byte caps; export audit events; streaming-route authentication like
  state-assets; how `handling: exclude|encrypt` threads through capture, with
  `encrypt` refused until K11. Give a worker partition: files each worker owns,
  files that are serial, and dependency order, within the structure audit
  budgets (the baselined `service.ts` must not grow).
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; this
  document; `reports/ex-b-core.md` and the files it names
- Owns (may edit): its report only
- Must not touch: all source and documents
- Definition of done: K1-K10 each executable without rediscovery; open
  questions 1-4 answered with evidence
- Report to: docs/working/first-class-data-extraction-plan/reports/k-datasets-execution.md

### Brief: k0-1-password-kdf
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: implement step K0.1 per CD2 and `reports/k0-secret-keys-kdf.md`
  §4.1-4.2 and §6: a shared async scrypt module with parameter constants
  (current N=2^17, r=8, p=1, keyLength 32; legacy v1 N=2^14), an exact read
  allowlist (v2 N of 2^17 or 2^18) checked before any derivation, `maxmem`
  256·N·r, a promise-only process-wide limiter of concurrency 2 (no timers),
  a password hash writing `$scrypt$ln=17,r=8,p=1$<salt>$<hash>` and a verify
  accepting that form and legacy `scrypt:<salt>:<hash>` that returns
  `{ ok, needsRehash }` and never throws, and the test-only injection types.
  Confirm placement against `docs/architecture/code-structure.md` first
  (proposed `packages/fluxiq/src/programs/_shared/password-kdf/`): one
  exported thing per file, a barrel, tests in `tests/`.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; this
  document's CD2 and "Credential and key hardening (K0)"; the k0 report §4.1,
  §4.2, §6 (password-kdf tests), and §7 mutations 3, 10, and 14
- Owns (may edit): the new `password-kdf/` directory and its `tests/`, and the
  parent barrel only if one must export it
- Must not touch: Secret Keys, Identity Access, every other file, and `.fluxiq`
  data; use only obviously dummy passwords
- Validation: `npx vitest run <new test files> --no-file-parallelism` and
  `node scripts/structure-audit.mjs`, run alone; no full suite or build (the
  supervisor runs those one at a time); apply mutations 3, 10, and 14, observe
  each test fail, and revert
- Definition of done: new tests pass; each mutation observed red and reverted;
  structure audit passes
- Report to: docs/working/first-class-data-extraction-plan/reports/k0-1-password-kdf.md

### Brief: k0-4-database-manager-recheck
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: implement step K0.4 per CD5: `put-record` and `delete-record` on the
  sensitive `identity.users` and `secret.keys` stores require the same
  credential recheck that reading them already requires
  (`packages/fluxiq/src/programs/database-manager/api/handlers.ts:64-84`
  against `:97-124`), with the same refusal shape; other stores are unchanged.
  Tests: put and delete on each sensitive store are refused without
  credentials and with wrong credentials and allowed with correct ones; a
  non-sensitive put is unchanged. Keep the file within structure budgets,
  extracting a focused helper module if needed.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; this
  document's CD5; the handlers file, its existing tests, and the credential
  gate it calls
- Owns (may edit): `database-manager/api/handlers.ts`, any new helper module
  beside it, and the database-manager handler tests
- Must not touch: Identity Access, Secret Keys,
  `programs/tests/global-identity-access.test.ts`, every other file, and
  `.fluxiq` data
- Validation: targeted `npx vitest run <files> --no-file-parallelism` and
  `node scripts/structure-audit.mjs`, run alone; remove the recheck from
  `put-record`, observe a test fail, and revert
- Definition of done: tests pass; the mutation observed red and reverted;
  structure audit passes
- Report to: docs/working/first-class-data-extraction-plan/reports/k0-4-database-manager-recheck.md

### Brief: k1-record-set-contracts
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: implement K1 per `reports/k-datasets-execution.md` §4 K1, with §2.4's
  caps, §2.7's handling rules, and CD19-CD20: `packages/contracts/src/record-sets/`
  (schema, output, dataset, parsers, stored schema, record validation, CSV
  encoders, barrel), exported from `packages/contracts/src/automation-studio.ts`.
  Also report, changing nothing, whether Core's node parameter-schema dialect
  accepts `oneOf`, with file:line (a downstream open question).
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; this
  document's Contracts section and CD19-CD20; the report sections named
- Owns (may edit): `packages/contracts/src/record-sets/**`,
  `packages/contracts/src/automation-studio.ts`
- Must not touch: every other file, including package versions (K10)
- Validation, run alone: the report's K1 acceptance commands and
  `node scripts/structure-audit.mjs`; its five mutation targets observed red
  and reverted
- Definition of done: tests and check pass; mutations observed; audit passes
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k1-record-set-contracts.md`

### Brief: k12-data-view
- Repository: FluxIQ Core (`F:\!FluxIQ`), read-only
- Task: design a first-class Data window in Core's web panel for extracted
  datasets, beyond K9's panel inside one run's Runtime Debug detail. Document
  how the web panel organizes windows and views today (Automation Studio inner
  views such as Runtime Debug, global program live views, navigation, how a
  view is registered, routed, and loaded with bounded queries), whether a
  domain can contribute a view, and how `json` node parameters are edited today
  (`ParameterEditor.tsx`). Recommend: a project-level Data window (datasets
  across Flows and runs, filtering by Flow and run, paged table preview,
  CSV/JSON export, delete, and a slot for K11's encryption status); a
  record-schema field editor for `recordOutput` (field names, value types, and
  Include/Exclude/Encrypt with downstream D12's Exclude column info hover);
  endpoint additions such as listing datasets across runs; placement, files,
  ordered steps, tests, and mutation targets; and sequencing with K8, K9,
  downstream X4, and Phase 3.7.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; this
  document's Current State, CD13-CD20, and "Recording proposal, API, and UI";
  `reports/k-datasets-execution.md` §4 K8-K9; `apps/web/src/features/automation-studio/`
  and its architecture contract test; downstream D12 and D13 in
  `F:\!FluxIQWebExtension\docs\working\first-class-data-extraction-plan.md`
- Owns (may edit): its report only
- Must not touch: all source and documents; do not start the web panel
- Definition of done: every question answered with file:line; one recommended
  design with files, steps, and tests
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k12-data-view.md`

### Brief: k4d-withheld-result-payload
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: implement K4d per the report §1.2 C3 and §4 K4d and CD15:
  `withheldResultPayload` on the framework runtime's dispatch context, carried
  to `settleAttempt` the way `withheldValues` is and applied in
  `withheldResult`, so a saved attempt holds the withheld marker in place of
  `result.payload` while the caller still receives it; `AS/runtime/io-policy.ts`
  sets it when the payload carries `recordOutput`. First trace how
  `withheldValues` reaches `settleAttempt` and where the framework runtime
  tests live, both unverified in the report.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD15;
  the report sections named; `docs/architecture/package-boundaries.md:188-215`
- Owns (may edit): `packages/fluxiq/src/runtime/contracts.ts`,
  `packages/fluxiq/src/runtime/service.ts` and its test file,
  `AS/runtime/io-policy.ts`, `AS/runtime/tests/io-policy.test.ts` (add cases
  only; that folder is full)
- Must not touch: every other file
- Validation, run alone: targeted `vitest run ... --no-file-parallelism`;
  `pnpm --filter fluxiq check` (a failure only in files another worker owns is
  rerun once later and reported, never edited); structure audit; ignoring the
  flag observed red and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k4d-withheld-result-payload.md`

### Brief: k8-0-export-audit-handler
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: K8.0 per the report §1.2 C1 and §4 K8: register
  `AUTOMATION_STUDIO_ENDPOINTS.exportFlowRunAudit` in `AS/api/handlers/runs.ts`
  with `programs.read`, calling `service.exportFlowRunAudit(projectId, runId)`
  and returning `{ audit }`, the shape
  `WEB/features/automation-studio/runtime/run-commands.ts:29` reads; add
  `AS/api/handlers/tests/runs.test.ts`; run
  `FX/programs/tests/permission-matrix.test.ts` unchanged.
- Required reads: `AGENTS.md`; the report sections named; an existing handler
  test for the pattern
- Owns (may edit): `AS/api/handlers/runs.ts`, `AS/api/handlers/tests/runs.test.ts`
- Must not touch: every other file
- Validation, run alone: targeted vitest for both test files; `pnpm --filter
  fluxiq check` (same rule for other workers' files); structure audit;
  removing the registration observed red and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k8-0-export-audit-handler.md`

### Brief: k4c0-candidate-helpers-move
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: K4c step 0 per the report §1.2 C8 and §4 K4c: write a characterization
  test of `recordingCandidateDefinition`, `recordingCandidateParameters`, and
  `materializeRecordingNode` (`AS/runtime/service.ts:5799-5844`) against the
  current code, then move them unchanged into
  `AS/runtime/service/recordings/candidate-definitions.ts`, export them from
  `recordings/index.ts`, and import them in `service.ts`. No behaviour change.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; the
  report sections named
- Owns (may edit): `AS/runtime/service.ts` (this move only), the new module,
  `AS/runtime/service/recordings/index.ts`,
  `AS/runtime/service/recordings/tests/candidate-definitions.test.ts`
- Must not touch: every other file and `.structure-baseline.json`
- Validation, run alone: the characterization test passes before and after the
  move; `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/recordings/tests --no-file-parallelism`;
  `pnpm --filter fluxiq check` (same rule for other workers' files); structure
  audit
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k4c0-candidate-helpers-move.md`

### Brief: k0-3-identity-access
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: implement K0.3 per the k0 report §4.3-4.7, §5 steps 3-4, §6 (identity
  cases 1-8), and §7, amended by CD4-CD5, on K0.1's module. Move the crypto at
  `identity-access/runtime/service.ts:631-707` to a new module first. Then:
  single-flight load; async gates; v2 envelopes and PHC hashes; one derivation
  per operation; re-seal and rehash; PIN rehash; zeroed keys; no persisted
  `pinVerifierHash`; session ids stored as SHA-256 digests (raw session records
  are ignored, so users sign in again); a dummy derivation for unknown and
  disabled usernames through the limiter; and a credential-change port whose
  subscribers `prepare` before the credential write and `commit` after it, or
  `abort` on failure, where a failed `prepare` refuses the change, called from
  `setPassword` and `setPasswordAuthorized`. Per CD3 and K0.1's report: re-seal
  and rehash only for v1 or legacy records or when `isBelowScryptWriteCost`
  holds, and derive v2 seals from `decodeKdfSalt(record.salt)`.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD4-CD5;
  the k0 report sections named; `reports/k0-1-password-kdf.md`
- Owns (may edit): `FX/programs/identity-access/runtime/service.ts`,
  `identity-access/types.ts`, new modules under `identity-access/runtime/`,
  `identity-access/runtime/tests/service.test.ts` (new),
  `FX/programs/tests/global-identity-access.test.ts`
- Must not touch: Secret Keys, Database Manager, `password-kdf/`, web routes,
  `_shared/runtime.ts`, every other file, `.fluxiq` data; dummy passwords only
- Validation, run alone: targeted vitest; `pnpm --filter fluxiq check` (same
  rule); structure audit; §7 mutations 1, 2, 5, 7, and 11-13, storing a raw
  session id, and skipping the dummy derivation, each observed red and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k0-3-identity-access.md`

### Brief: k3-policy-action-record-output
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: implement K3 per `reports/k-datasets-execution.md` §4 K3, with CD13,
  CD19, and CD21's control from `reports/k12-data-view.md` §4.3: a `records`
  output port and a non-bindable `recordOutput` json parameter on
  `builtin.policy.action` with `ui: { control: "record-output" }`, adding
  `"record-output"` to the control union in `AS/nodes/contracts.ts`. `execute`
  parses with K1's `parseAutomationStudioRecordOutput`, maps
  `record_schema.encrypt_unavailable` to `record_output.encrypt_unavailable`,
  fails before dispatch with no effect on an invalid value, and leaves the
  effect payload without a `recordOutput` key when the parameter is null,
  because K4d withholds any present non-null value. Tests and mutations from
  the report; run `AS/nodes/tests/registry.test.ts` unchanged.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD13,
  CD19, CD21; the report sections named; `reports/k4d-withheld-result-payload.md`
- Owns (may edit): `AS/nodes/contracts.ts`, `AS/nodes/policy/action.ts`,
  `AS/nodes/policy/tests/action.test.ts`
- Must not touch: every other file
- Validation, run alone: the K3 acceptance command; `pnpm --filter fluxiq check`
  (same rule for other workers' files); structure audit; mutations observed red
  and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k3-policy-action-record-output.md`

### Brief: k0-2-secret-keys
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: implement K0.2 per `reports/k0-secret-keys-kdf.md` §4.3-4.6, §5 step
  2, §6 (Secret Keys cases 1-14), and §7, amended by CD3-CD5, on K0.1's
  `password-kdf` module. Also add `prepareCredentialChange` (re-seal the user's
  own keys under the new password without writing), `commitCredentialChange`,
  and `abortCredentialChange`, tested with a fake caller, for K0.5 to wire to
  the Identity Access port. Per CD3 and K0.1's report: re-seal only when
  `version === 1` or `isBelowScryptWriteCost(record.kdfParams, writeParameters)`,
  and derive v2 seals from `decodeKdfSalt(record.salt)` (v1 keeps the salt text).
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD3-CD5;
  the k0 report sections named; `reports/k0-1-password-kdf.md`
- Owns (may edit): `FX/programs/secret-keys/types.ts`, `runtime/service.ts`,
  `api/handlers.ts`, their tests, new modules under `secret-keys/runtime/`,
  `FX/programs/tests/global-secret-keys.test.ts`,
  `FX/programs/_shared/tests/runtime-llm-grants.test.ts`
- Must not touch: Identity Access, `password-kdf/`, `_shared/runtime.ts`, every
  other file, `.fluxiq` data; dummy passwords only
- Validation, run alone: targeted vitest; `pnpm --filter fluxiq check` (same
  rule for other workers' files); structure audit; §7 mutations 4-9 and 15
  observed red and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k0-2-secret-keys.md`

### Brief: k2-run-dataset-store
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: implement K2 per `reports/k-datasets-execution.md` §4 K2, with
  CD16-CD17, CD20, and CD21's storage share from `reports/k12-data-view.md`
  §4.2: migration `0019_run_datasets` (`run_datasets` with `flow_id`,
  `run_dataset_rows`, `run_dataset_audit_events`, `run_dataset_catalog`, the
  indexes, the foreign-key guard), the schema barrel, `table-names.ts`, the
  administration migration list, and `AutomationStudioProjectRunDatasetStore`
  (transactional `appendBatch` maintaining the catalog, `listDatasets`,
  `getPage`, `readRows`, audit, `deleteRunDatasets(runId, { datasetId?,
  actorId? })` recomputing the catalog, `listProjectDatasets`,
  `listDatasetRuns`, `runDatasetSummariesForRun`). A batch with an existing
  `attempt_id` replaces the earlier one, in case retries reuse a `runId`. Add
  K12's `project-dataset-summary.ts` and `dataset-run-summary.ts` contracts
  under `packages/contracts/src/record-sets/`. Tests and mutation targets from
  both reports.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD16,
  CD17, CD20, CD21; the report sections named; `packages/contracts/src/record-sets/`
- Owns (may edit): `AS/storage/project/schema/{run-datasets,index,table-names}.ts`,
  `AS/storage/project/{administration,run-dataset-store,index}.ts`,
  `AS/storage/project/tests/run-dataset-store.test.ts`, and the two new
  contract files with their tests and barrel lines
- Must not touch: every other file
- Validation, run alone: the K2 acceptance command; the contracts package's
  record-sets tests and check; `pnpm --filter fluxiq check` (a failure only in
  another worker's files is rerun once later and reported); structure audit;
  mutations observed red and reverted (on a scratch copy if real source is
  refused)
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k2-run-dataset-store.md`

### Brief: k4a-executor-record-capture
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: implement K4a per `reports/k-datasets-execution.md` §4 K4 (the K4a
  part), with CD13, CD14, and CD15: `onRecordBatch` and the exported
  `AutomationStudioRecordBatch` type on `AutomationStudioGraphExecutionOptions`;
  new `record-capture.ts` (after each successful `policy.output.dispatch`
  carrying `recordOutput`: re-parse it, read `outputs.result` at `recordsPath`
  with K1's `parseAutomationStudioRecordsPath`, validate with the allowlist
  copy, write `outputs.records`, and replace the `recordsPath` subtree of
  `outputs.result` with the same array; a non-array fails with
  `record_output.records_missing`); new `record-summary.ts` (identity-based
  `$dataset` and `$datasetRow` markers applied to the saved trace, including
  Call Flow children); new `run-state.ts` (`records` now; K6 adds variables and
  loops); capture and the hook call in `node-execution.ts` (a throwing hook fails
  the attempt with `record_output.persist_failed`); the summary applied before
  withholding in `graph-run.ts`; markers left untouched in
  `trace-withholding.ts`; the executor barrel. Tests and mutation targets from
  the report.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD13-CD15;
  the report's §1.2 C2 and C4 and §4 K4a; `packages/contracts/src/record-sets/`;
  `reports/k3-policy-action-record-output.md` when it exists
- Owns (may edit): `AS/runtime/executor/{contracts,record-capture,record-summary,run-state,node-execution,graph-run,trace-withholding,index}.ts`
  and their tests under `AS/runtime/executor/tests/`
- Must not touch: `AS/nodes/**`, `AS/runtime/service.ts`, every other file
- Validation, run alone: the executor tests with `--no-file-parallelism`;
  `pnpm --filter fluxiq check` (a failure only in another worker's files is
  rerun once later and reported); structure audit (report failures in files you
  do not own); mutations observed red and reverted (on a scratch copy if real
  source is refused)
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k4a-executor-record-capture.md`

### Brief: k0-mutation-proofs
- Repository: FluxIQ Core (`F:\!FluxIQ`), verification only
- Task: prove, on disposable copies outside the repository, the guard
  mutations the permission classifier refused on real source: K0.1's mutations
  10 (allowlist guard removed) and 14 (limiter concurrency unbounded), per
  `reports/k0-secret-keys-kdf.md` §7 and `reports/k0-1-password-kdf.md`, and
  K0.4's removal of the `put-record` recheck, per
  `reports/k0-4-database-manager-recheck.md`. For each, copy what the test needs
  into `C:\Users\mrjoh\AppData\Local\Temp\claude\f---FluxIQWebExtension\3454178a-dd53-4d6d-917d-85b8f63d0d91\scratchpad\mutation-proofs\`
  so it still resolves the package's dependencies, confirm the unmodified copy
  passes, apply the mutation to the copy only, confirm the named test fails,
  and record the exact commands and output.
- Required reads: the three reports named; `packages/fluxiq`'s vitest config
- Owns (may edit): files under that scratch directory, and its report
- Must not touch: any file in either repository other than its report
- Definition of done: for each mutation, an observed pass on the unmodified copy
  and an observed failure on the mutated copy
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k0-mutation-proofs.md`

### Brief: k5-run-detail-datasets
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: K5 per `reports/k-datasets-execution.md` §4 K5, with CD14:
  `AutomationStudioFlowRunDetail.datasets?` in `AS/model/flow-adaptation.ts`
  (a type import only; `AS/model/` is frozen at 28 files); `getRunDetail` in
  `AS/storage/project/runtime-stream-store.ts` joins
  `runDatasetSummariesForRun` on both the compact and full paths and writes
  `datasets` only when non-empty; `AS/runtime/service/summaries/conversions.ts`
  adds an attempt `recordCount` from the `$dataset` marker. Tests and mutations
  from the report; the runtime-stream-store test includes a million-event case,
  so run that file alone.
- Required reads: `AGENTS.md`; CD14; the report's §4 K5;
  `reports/k2-run-dataset-store.md`; `reports/k4a-executor-record-capture.md`
- Owns (may edit): `AS/model/flow-adaptation.ts`,
  `AS/storage/project/runtime-stream-store.ts` and its test,
  `AS/runtime/service/summaries/conversions.ts`, and a new
  `AS/runtime/service/summaries/tests/conversions.test.ts`
- Must not touch: the dataset store, executor files, every other file
- Validation, run alone: the K5 acceptance command; `pnpm --filter fluxiq check`
  (same rule for other workers' files); structure audit; mutations observed red
  and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k5-run-detail-datasets.md`

## Work Ledger

### 2026-09-15 — Crash recovery; concurrency cap lifted; next Core wave briefed
- Agent: downstream supervisor; workers `k0-5-credential-wiring` and
  `k4a-executor-record-capture` (resumed), `k2-run-dataset-store` (resumed with
  the batch-key amendment), `k12d-record-output-editor`
- Changed: this document (briefs `k4b-datasets-collaborator`,
  `k5-run-detail-datasets`, `k7-recording-record-output-lift`,
  `k0-mutation-proofs`)
- Why: Claude Code crashed with workers mid-task, and they resume from their
  transcripts. The user asked for as many parallel agents as possible, so the
  four-worker cap is lifted and every file-disjoint Core step is dispatched: K4b
  and K5 against K2's and K4a's defined interfaces, accepting a rerun if their
  amendments move them. The archive move of completed briefs had already run
  before the crash, which is why a second run found nothing to move
- Validation: not validated; dispatch only
- Outcome: Partial
- Follow-up: verify each worker; K4c.1-2, K6, and K8 once their prerequisites
  land

### 2026-09-15 — K4a done and verified; Call Flow batch collision taken in
- Agent: downstream supervisor; worker `k4a-executor-record-capture`
- Changed: `AS/runtime/executor/{contracts,record-capture,record-summary,run-state,node-execution,graph-run,trace-withholding}.ts`,
  new `executor/tests/{record-capture,record-summary}.test.ts`, and extended
  `executor/tests/{node-execution,graph-run,trace-withholding}.test.ts`
  (uncommitted); the report; this document (Current State, the store bullet
  under "Runtime capture and persistence")
- Why: CD13-CD15 in the executor. Kept beyond the report's wording: markers
  are skipped by identity, not shape; the hook receives the stored schema;
  `result` is withheld when capture fails, is invalid, or finds no records;
  ordinals are computed when a batch is recorded. The persist-failure message
  stays fixed and does not echo the hook's error. A native node carrying an
  invalid `recordOutput` is covered by K3, because recording-derived
  definitions run as `builtin.policy.action`. Defect taken in: attempt ids
  repeat across Call Flow children that inherit the hook, so K2's
  replace-by-attempt could overwrite a parent's batch; batches now carry a
  `batchKey` (nested Call Flow path plus attempt id), and K2 replaces by it,
  with invalid counts stored per batch
- Validation: in `F:\!FluxIQ`,
  `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/tests --no-file-parallelism`
  → Test Files 9 passed, Tests 96 passed, before the batch-key amendment.
  Mutation proofs not rerun by the supervisor.
- Outcome: Partial
- Follow-up: verify the batch-key amendment; resume `k2-run-dataset-store` for
  replacement by `batchKey` and per-batch invalid counts; then K4b and K5

### 2026-09-15 — K2 done and verified; K0.5 dispatched; invalid-count defect taken in
- Agent: downstream supervisor; worker `k2-run-dataset-store`
- Changed: `AS/storage/project/{run-dataset-store.ts,schema/run-datasets.ts}`
  (new), `AS/storage/project/{schema/index.ts,schema/table-names.ts,administration.ts,index.ts}`,
  `AS/storage/project/tests/run-dataset-store.test.ts` (new), and new
  `packages/contracts/src/record-sets/{project-dataset-summary,dataset-run-summary}.ts`
  with tests and the barrel line (all uncommitted); the report; this document
  (Current State)
- Why: K2 with CD21's catalog. Kept beyond the reports: the index
  `run_dataset_rows_attempt_idx`, the contract constant
  `AUTOMATION_STUDIO_DATASET_RUN_STATUSES`, and the `listDatasetRuns` cursor
  owner `dataset-runs:<flowId>:<datasetId>`. `open()` runs project migrations,
  so an existing project database gains 0019. Defect taken in: replacing a
  retried attempt's batch counts its invalid rows twice, because invalid counts
  are not stored per attempt; the fix stores them per attempt so a replacement
  subtracts the earlier count. The contracts 0.2.1 bump stays with K10
- Validation: supervisor runs, alone: in `F:\!FluxIQ`,
  `pnpm --filter @fluxiq/contracts build` → exit 0;
  `pnpm --filter @fluxiq/contracts exec vitest run src/record-sets/tests --no-file-parallelism`
  → Tests 46 passed; in `packages/fluxiq`,
  `npx vitest run src/programs/automation-studio/storage/project/tests/run-dataset-store.test.ts src/programs/automation-studio/storage/project/tests/schema.test.ts --no-file-parallelism`
  → Tests 27 passed. Mutation proofs not rerun by the supervisor.
- Outcome: Accepted
- Follow-up: resume `k2-run-dataset-store` for the per-attempt invalid-count
  fix at the next free slot; K4b and K5 after K4a

### 2026-09-15 — K0.2 done and verified; K4a dispatched; K0.5 briefed
- Agent: downstream supervisor; worker `k0-2-secret-keys`
- Changed: `FX/programs/secret-keys/{types.ts,api/handlers.ts,runtime/service.ts}`,
  new `runtime/{value-sealer,record-guard,record-write-queue,key-store,held-keys,seal-upgrades,credential-changes}.ts`,
  their tests, `FX/programs/tests/global-secret-keys.test.ts`, and
  `FX/programs/_shared/tests/runtime-llm-grants.test.ts` (uncommitted); the
  report; this document (Current State, brief `k0-5-credential-wiring`)
- Why: CD3-CD5 for Secret Keys. The service split into collaborators after
  audit warnings (21 methods, 454 lines; public methods unchanged). An upgraded
  seal is stamped for the user whose password opened it rather than for its
  creator, and kept: a key sealed with one user's password but stamped for
  another would never unlock at that user's login. Unstamped keys are tried for
  every user until upgraded, as planned
- Validation: supervisor runs, alone, in `packages/fluxiq`:
  `npx vitest run src/programs/secret-keys src/programs/tests/global-secret-keys.test.ts src/programs/_shared/tests/runtime-llm-grants.test.ts --no-file-parallelism`
  → Tests 49 passed, 2 files failed to load while
  `AS/storage/project/run-dataset-store.ts` did not yet exist (K2 in progress);
  rerun of those 2 files → Test Files 2 passed, Tests 2 passed;
  `npx vitest run src/programs/_shared/password-kdf --no-file-parallelism`
  → Tests 99 passed. Mutation proofs not rerun by the supervisor.
- Outcome: Accepted
- Follow-up: dispatch K0.5 at the next free slot; then the K0 group commit with
  `pnpm --filter fluxiq check`, the regenerated reference, and the remaining
  scratch-copy mutation proofs

### 2026-09-15 — K3 and K0.3 done and verified; K2 dispatched; upsertUser gap taken in
- Agent: downstream supervisor; workers `k3-policy-action-record-output`,
  `k0-3-identity-access`
- Changed: `AS/nodes/contracts.ts`, `AS/nodes/policy/action.ts`, and new
  `AS/nodes/policy/tests/action.test.ts`; `FX/programs/identity-access/runtime/service.ts`,
  new `credential-seal.ts`, `stored-state.ts`, `session-digest.ts`,
  `run-credential-change.ts`, `totp.ts`, and `runtime/tests/service.test.ts`,
  `identity-access/types.ts`, and `FX/programs/tests/global-identity-access.test.ts`
  (all uncommitted); both reports; this document (Current State, CD5, K0.5)
- Why: K3 adds `recordOutput` and the `records` port. Its acceptance failures
  came from a stale, git-ignored contracts dist that predated K1, which the
  supervisor rebuilt. Its choices stand: an invalid record output routes
  `failed` even when the failure route is `success`, every encrypt issue maps
  to `record_output.encrypt_unavailable`, and `outputs.error` is
  `{ code, issues }`. K0.3 lands CD3-CD5 for Identity Access, and also deletes
  revoked sessions from storage, undoes a failed password write in memory, and
  keeps unlocked credentials across a reload. It found that `upsertUser` on an
  existing id changes a password with no recheck or port, taken into CD5 and
  K0.5. Two of its mutations briefly edited `password-kdf/scrypt-parameters.ts`,
  outside its files, and restored it byte-identical; the K0 commit reruns the
  password-kdf tests against the final file
- Validation: supervisor runs, alone: in `F:\!FluxIQ`,
  `pnpm --filter @fluxiq/contracts build` → exit 0; in `packages/fluxiq`,
  `npx vitest run src/programs/automation-studio/nodes/policy/tests/action.test.ts src/programs/automation-studio/nodes/tests --no-file-parallelism`
  → Test Files 4 passed, Tests 38 passed;
  `npx vitest run src/programs/identity-access/runtime/tests/service.test.ts src/programs/tests/global-identity-access.test.ts --no-file-parallelism`
  → Test Files 2 passed, Tests 30 passed; `identity-access/runtime/service.ts`
  is 731 lines. Mutation proofs not rerun by the supervisor.
- Outcome: Accepted
- Follow-up: K0.5 after K0.2; dispatch K4a and K12d as slots free

### 2026-09-15 — K7 widened to carry timeoutMs (downstream D16)
- Agent: downstream supervisor; downstream worker `x3-x5-execution`
- Changed: this document (CD19, phase K7)
- Why: approval writes a recorded node's `parameterValues` without a timeout,
  so the policy action's 5,000 ms default would cut paginated extraction short
- Validation: not validated; planning document only
- Outcome: Accepted
- Follow-up: K7's brief includes it

### 2026-09-15 — K4c.0 done and verified; K3 dispatched; K4a and K12d briefed
- Agent: downstream supervisor; worker `k4c0-candidate-helpers-move`
- Changed: `AS/runtime/service.ts`, new
  `AS/runtime/service/recordings/candidate-definitions.ts` and its test, and
  `AS/runtime/service/recordings/index.ts` (uncommitted); the report; this
  document (Current State, briefs `k4a-executor-record-capture` and
  `k12d-record-output-editor`); completed briefs and older ledger entries
  archived
- Why: frees `service.ts` lines for K4c.1-2 under its frozen baseline; the
  baseline ratchet waits for a clean structure audit, since K0.3's in-progress
  `identity-access/runtime/service.ts` is over 800 lines
- Validation: in `packages/fluxiq`,
  `npx vitest run src/programs/automation-studio/runtime/service/recordings/tests --no-file-parallelism`
  → Test Files 2 passed, Tests 14 passed; `git diff --stat` on `service.ts` →
  1 insertion, 49 deletions.
- Outcome: Accepted
- Follow-up: commit with the K0 group; dispatch K4a and K2 as slots free, K12d
  after K3

### 2026-09-15 — K8.0 done and verified; K2 and K3 briefed
- Agent: downstream supervisor; worker `k8-0-export-audit-handler`
- Changed: `AS/api/handlers/runs.ts` and new `AS/api/handlers/tests/runs.test.ts`
  (uncommitted); the report; this document (Current State, briefs
  `k2-run-dataset-store` and `k3-policy-action-record-output`); two completed
  briefs archived; the new Core pair `mvp-week2-automation-loop-plan.md`
- Why: Runtime Debug's Export Audit button returned 404. The worker asked
  whether audit export needs the domain check; CD16 rules domain scope a
  caller-named filter, not an authorization boundary, so the handler matches
  the other run handlers. K2 carries K12's summary contracts because its store
  methods return them
- Validation: in `packages/fluxiq`,
  `npx vitest run src/programs/automation-studio/api/handlers/tests/runs.test.ts src/programs/tests/permission-matrix.test.ts --no-file-parallelism`
  → Test Files 2 passed, Tests 6 passed. Mutation proof not rerun by the
  supervisor.
- Outcome: Accepted
- Follow-up: commit with K0 and K4d; dispatch K3 and K2 as slots free

### 2026-09-15 — K4d done and verified; K8.0 and K4c.0 dispatched
- Agent: downstream supervisor; worker `k4d-withheld-result-payload`
- Changed: `packages/fluxiq/src/runtime/{contracts,service}.ts`,
  `packages/fluxiq/src/runtime/tests/service.test.ts`, `AS/runtime/io-policy.ts`,
  and `AS/runtime/tests/io-policy.test.ts` (uncommitted), adding the exported
  type `FluxIQRuntimeCommandAttemptResult`; the report; this document (Current
  State, next steps); the k12 brief and older ledger entries moved to the archive
- Why: CD15. The flag is set whenever `recordOutput` is present and not null,
  so K3 must omit it or set it null when unset. `package-boundaries.md:214-215`
  now misstates withholding, and the framework reference needs regenerating;
  both land with the K0 and K4d commit
- Validation: in `packages/fluxiq`,
  `npx vitest run src/runtime/tests/service.test.ts src/programs/automation-studio/runtime/tests/io-policy.test.ts --no-file-parallelism`
  → Test Files 2 passed, Tests 30 passed. The worker's mutation proofs and
  `pnpm --filter fluxiq check` were not rerun by the supervisor.
- Outcome: Accepted
- Follow-up: commit with K0 once K0.2 and K0.3 land, with the doc fix and the
  regenerated reference

### 2026-09-15 — K12 designed; CD21 decided; CD17 widened
- Agent: downstream supervisor; worker `k12-data-view`
- Changed: this document (CD17, CD21, phase K12, Design, dataset order); the
  `k12-data-view` report
- Why: the user asked for real Core UI for extraction; the report found views
  are a closed registry with no domain seam, and that K3's `recordOutput` would
  be corrupted by today's json editor. Its seven recommendations are adopted:
  `flow_id` and a catalog in K2, two list endpoints and delete by `datasetId`
  in K8, a `record-output` control in K3, K12d before K7 and X4, K12c after K9,
  barrel imports, and one `datasets` style domain in K9
- Validation: not validated; planning document only
- Outcome: Accepted
- Follow-up: write K2, K3, K4b, and K8 briefs with the K12 share; dispatch
  K12d after K3

### 2026-09-15 — K1 landed; K0.1 amendments verified; K0.2, K0.3, K4d dispatched
- Agent: downstream supervisor; workers `k1-record-set-contracts`,
  `k0-1-password-kdf`
- Changed: `packages/contracts/src/record-sets/` (11 modules, 6 test files) and
  `packages/contracts/src/automation-studio.ts`; the amended `password-kdf/`
  module (uncommitted); both reports; this document (Current State, Contracts
  note, K0.2 and K0.3 briefs)
- Why: K1 unblocks K2, K3, and K4a; K0.1's amendments apply CD3. The K1 worker
  proved its mutations on scratch copies after the classifier refused weakening
  real source, and that method is now used for every guard proof
- Validation: supervisor runs, alone: in `F:\!FluxIQ`,
  `pnpm --filter @fluxiq/contracts exec vitest run src/record-sets/tests --no-file-parallelism`
  → Test Files 6 passed, Tests 41 passed; `pnpm --filter @fluxiq/contracts check`
  → exit 0; in `packages/fluxiq`, `npx vitest run` over the seven `password-kdf`
  test files with `--no-file-parallelism` → Test Files 7 passed, Tests 99
  passed; `node scripts/structure-audit.mjs` → passed (123 warnings, 256
  baselined). K1's mutations were not rerun by the supervisor.
- Outcome: Accepted
- Follow-up: commit K1 now; K0.1 and K0.4 commit with K0.2 and K0.3

### 2026-09-15 — K12 Data window added; design investigation dispatched
- Agent: downstream supervisor; worker `k12-data-view`
- Changed: this document (phase K12, Worker Briefs)
- Why: the user pointed out that Core has no window for data extraction; the
  plan's only Core dataset UI was a panel inside one run's Runtime Debug detail,
  and extraction columns would have been edited as raw JSON
- Validation: not validated; planning document only
- Outcome: Partial
- Follow-up: fold the `k12-data-view` design into Design, phases, and order

### 2026-09-15 — K0.1 built; rehash and salt rules decided; amendments sent
- Agent: downstream supervisor; worker `k0-1-password-kdf`
- Changed: new `packages/fluxiq/src/programs/_shared/password-kdf/` (eight
  modules, six test files) and its report, uncommitted; this document (CD3)
- Why: the worker raised that a rollback from a raised cost would rewrite
  records weaker and that its hashes used the salt text rather than decoded
  bytes; CD3 now forbids downgrades and requires standard PHC salt bytes for v2
  seals and hashes, and the worker was sent back to apply both and correct a
  memory figure in a comment
- Validation: not yet verified by the supervisor. Guard-removal mutations 10
  and 14 were refused by the permission classifier for the worker, as K0.4's
  was for the supervisor.
- Outcome: Partial
- Follow-up: verify the amended module; run or waive the refused mutations with
  the user; then dispatch K0.2 and K0.3

### 2026-09-15 — K0.4 implemented and tested; mutation proof blocked; K1 dispatched
- Agent: downstream supervisor; workers `k0-4-database-manager-recheck`,
  `k1-record-set-contracts`
- Changed: `packages/fluxiq/src/programs/database-manager/api/handlers.ts` and
  new `database-manager/api/tests/handlers.test.ts` (both uncommitted); the
  K0.4 report; this document (Current State)
- Why: CD5's last bullet. The worker also made `authorize-store` issue a grant
  only against a fresh credential recheck, so a grant cannot renew itself, and
  checked grants against the scope the operation acts on; both are tested and
  kept. A five-minute store grant covers writes as well as reads, matching
  CD5's "same credential recheck as reading them"
- Validation: in `packages/fluxiq`,
  `npx vitest run src/programs/database-manager/api/tests/handlers.test.ts src/programs/database-manager/tests/index.test.ts --no-file-parallelism`
  → Test Files 2 passed, Tests 27 passed; `node scripts/structure-audit.mjs`
  → passed (123 warnings, 256 baselined); `pnpm docs:reference` changed only
  `registerDatabaseManagerApi`'s line (`handlers.ts:14` → `:18`), then restored.
  The mutation proof (removing the `put-record` gate) was refused by the Claude
  Code permission classifier as a security weakening, for worker and supervisor
  alike; not run. `pnpm --filter fluxiq check` not run while other workers edit
  the package.
- Outcome: Partial
- Follow-up: the user decides whether to allow the mutation run; then the type
  check and a commit with K0.1

### 2026-09-15 — K1-K10 made executable; CD13-CD20 decided; next briefs recorded
- Agent: downstream supervisor; worker `k-datasets-execution`
- Changed: this document (Status detail, Current State, CD10, CD13-CD20,
  dataset Design sections, dataset execution order, K11 steps 5-6,
  Compatibility, phases K4 and K8, open questions 1-4, and briefs for K1, K4d,
  K4c.0, K8.0, K0.2, and K0.3)
- Why: the report moved capture into node execution, showed rows reaching the
  saved trace and command attempts, found the missing Export Audit handler, and
  gave file-level steps; its recommendations became decisions, with a
  user-facing dataset delete added because nothing purges runs
- Validation: not validated; planning document only
- Outcome: Accepted
- Follow-up: dispatch the recorded briefs as worker slots free

### 2026-09-15 — Execution started: K0.1 and K0.4 dispatched
- Agent: downstream supervisor; workers `k0-1-password-kdf`,
  `k0-4-database-manager-recheck`
- Changed: this document (Worker Briefs)
- Why: K0 is fully designed and independent of the pending dataset detail, so
  it starts rather than waiting; at most four code workers run at once on this
  machine, with heavy gates left to the supervisor
- Validation: not validated; dispatch only, no Core code changed yet
- Outcome: Partial
- Follow-up: verify both reports; then dispatch K0.2 and K0.3

### 2026-09-15 — K0 and K11 designs merged; every credential defect taken in
- Agent: downstream supervisor; workers `k0-secret-keys-kdf`,
  `k11-encrypted-fields`
- Changed: this document (Current State, Decisions CD1-CD12, K0 and K11
  design, Compatibility, phases, open questions 5 and 6)
- Why: the two reports designed both fixes; under the user's standing
  instructions their recommendations became decisions, and every security
  defect they found was taken into K0 or K11 rather than parked
- Validation: not validated; planning document only, no Core code changed
- Outcome: Accepted
- Follow-up: merge `k-datasets-execution`; start K0 and K1

### 2026-09-15 — K0 and K11 added; firming investigations dispatched
- Agent: downstream supervisor; workers `k0-secret-keys-kdf`,
  `k11-encrypted-fields`, `k-datasets-execution`
- Changed: this document (Current State, phases K0 and K11, open question 6,
  Worker Briefs)
- Why: the user ruled Secret Keys' derivation cost unacceptable, asked for the
  Encrypt column in the plan, and asked for Core's data share to be firmed up
  before work starts
- Validation: not validated; planning document only, no Core code changed
- Outcome: Partial
- Follow-up: write the reports' results into Design, phases, and decisions

### 2026-09-15 — Encrypted field requirements; Secret Keys cost noted
- Agent: downstream supervisor
- Changed: this document (open questions 5 and 6)
- Why: the user asked whether a lookup table could reverse an encrypted column;
  reading Secret Keys' sealing code showed Node's default scrypt cost
- Validation: not validated; planning document only, no Core code changed
- Outcome: Accepted
- Follow-up: settle open question 6 separately from the extraction phases

### 2026-09-15 — Encrypted record fields reserved (downstream D13)
- Agent: downstream supervisor
- Changed: this document (record schema `handling`, open question 5)
- Why: the downstream plan adds an Encrypt column option for Week 3
- Validation: not validated; planning document only, no Core code changed
- Outcome: Accepted
- Follow-up: K1 reserves `encrypt`; settle open question 5 before building it

### 2026-09-15 — Excluded record fields replace sensitive fields (downstream D12)
- Agent: downstream supervisor
- Changed: this document (record schema `excluded`, capture, open question 1)
- Why: the user chose leaving a column out of the output entirely over masking
  its values
- Validation: not validated; planning document only, no Core code changed
- Outcome: Accepted
- Follow-up: K1 carries the field

### 2026-09-15 — Sensitive record fields added (downstream D12)
- Agent: downstream supervisor
- Changed: this document (record schema `sensitive`, capture, open question 1)
- Why: the downstream plan decided E53 for datasets
- Validation: not validated; planning document only, no Core code changed
- Outcome: Accepted
- Follow-up: K1 carries the field

### 2026-09-15 — Core design recorded from ex-b-core
- Agent: downstream supervisor; worker `ex-b-core`
- Changed: this document
- Why: record Core's dataset, iteration, persistence, API, and UI design and
  phases for the downstream extraction plan
- Validation: not validated; planning document only, no Core code changed
- Outcome: Accepted
- Follow-up: K1 with downstream X1

### 2026-09-15 — Paired plan created; Core investigation dispatched
- Agent: downstream supervisor; worker `ex-b-core`
- Changed: this document
- Why: the downstream plan crosses into Core for domain-neutral datasets
- Validation: not validated; planning document only, no Core code changed
- Outcome: Partial
- Follow-up: record Core contracts from the downstream plan

## 2026-09-15 compaction: completed K-phase briefs and settled ledger entries

### Brief: k12d-record-output-editor
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: after K3, implement K12d per `reports/k12-data-view.md` §4.3, §6 step
  5, §7 (K12d tests), and §8 (K12d mutations): route
  `ui.control === "record-output"` in `ParameterEditor.tsx` to a new
  `RecordOutputEditor` (a save switch that writes `null` when off, table id,
  table name, records path, write mode, max records, and the fields table) with
  `RecordFieldRow`, `FieldHandlingControl` (Include / Exclude column / Encrypt
  column, carrying downstream D12's Exclude column hover; Encrypt disabled with
  its reason until K11), `record-output-draft.ts`, `record-output-issues.ts`
  over K1's parser, and the `automationParameterError` branch. If K1's parser is
  not importable from the web through an existing `fluxiq` subpath, stop and
  report instead of editing package exports.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD21;
  D12 and D13 in `F:\!FluxIQWebExtension\docs\working\first-class-data-extraction-plan.md`;
  the report sections named; `reports/k3-policy-action-record-output.md`
- Owns (may edit): `WEB/features/automation-studio/parameters/ParameterEditor.tsx`,
  `WEB/features/automation-studio/parameters/tests/ParameterEditor.test.tsx`,
  and `WEB/features/automation-studio/parameters/record-output/**` (new)
- Must not touch: every other file
- Validation, run alone:
  `pnpm --filter @fluxiq/web exec vitest run src/features/automation-studio/parameters --no-file-parallelism`;
  `pnpm --filter @fluxiq/web check`; structure audit; mutations observed red
  and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k12d-record-output-editor.md`

### Brief: k0-5-credential-wiring
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: implement K0.5 per "Credential and key hardening (K0)" step 5, CD5,
  CD6, and CD15. In `FX/programs/_shared/runtime.ts`, subscribe Secret Keys'
  `prepareCredentialChange`, `commitCredentialChange`, and
  `abortCredentialChange` to Identity Access's credential-change port
  (subscribers register in the constructor, so reorder construction). Make
  `upsertUser` refuse to change an existing account's credentials. Confirm or
  add a per-address login limiter bound independent of the username in
  `WEB/app/api/auth/login/route.ts`. Tests: a password change through the
  global runtime leaves the user's Secret Keys revealable with the new password
  and not the old; `upsertUser` on an existing id cannot change the password;
  one address is bounded across usernames. Docs: `docs/operations/data-and-state.md`,
  `docs/programs/global-programs.md`, the key lifecycle in
  `docs/architecture/automation-studio/persistence.md`, and
  `docs/architecture/package-boundaries.md` (version 0.5.0; a Migration Notes
  entry for K0: upgraded records are unreadable by 0.4.x, hashed session ids
  sign existing sessions out, PIN gates after a restart need a new sign-in,
  rollback means rolling forward or a pre-upgrade backup; and correct the
  `result.payload` withholding statement for CD15); `packages/fluxiq/package.json`
  version 0.5.0. Do not regenerate the framework reference; the supervisor does
  that at commit time.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD2-CD6
  and CD15; the reports `k0-secret-keys-kdf` (§4.9), `k0-2-secret-keys`,
  `k0-3-identity-access`, and `k4d-withheld-result-payload`
- Owns (may edit): `FX/programs/_shared/runtime.ts` and its tests; in
  `FX/programs/identity-access/runtime/service.ts`, `upsertUser` only, and its
  tests; `WEB/app/api/auth/login/route.ts` and its route test; the four docs
  named; `packages/fluxiq/package.json` (the version field only)
- Must not touch: every other file, including dataset and executor files other
  workers own
- Validation, run alone: targeted vitest for the files changed and
  `FX/programs/tests/global-{identity-access,secret-keys}.test.ts`;
  `pnpm --filter fluxiq check` and `pnpm --filter @fluxiq/web check` (a failure
  only in another worker's files is rerun once later and reported);
  `node scripts/validate-docs.mjs`; structure audit; mutations for the port
  subscription and the `upsertUser` refusal observed red and reverted (on a
  scratch copy if real source is refused)
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k0-5-credential-wiring.md`

### Brief: k4b-datasets-collaborator
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: K4b per `reports/k-datasets-execution.md` §4 K4 (the K4b part), with
  CD16, CD17, CD20, and CD21: a new `AS/runtime/service/datasets/` holding
  `AutomationStudioRunDatasets` (`available`; `recordBatchHandler(projectId, runId)`
  opening the K2 store per batch, computing `schemaDigest`, calling
  `appendBatch` with the batch's `batchKey`, and throwing when the store cannot
  be opened; `listRunDatasets`; `getRunDatasetPage`; `exportRunDataset` with
  the inline caps, `tooLarge`, and audit; `streamRunDataset` as 500-row pages
  with caps and audit; `deleteRunDatasets` with an optional `datasetId`; K12's
  `listProjectDatasets` and `listDatasetRuns`), the service barrel line, and the
  `contractSpreadPaths` entry in `scripts/structure-audit/config.mjs`. Test the
  collaborator against a temporary project store; list in the report any case
  the report routes through `AutomationStudioService`, for K4c.1-2.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`;
  CD13-CD21; the report's §4 K4b; `reports/k12-data-view.md` §4.2;
  `reports/k2-run-dataset-store.md`; `reports/k4a-executor-record-capture.md`
- Owns (may edit): `AS/runtime/service/datasets/**` (new) and its tests, one
  export line in `AS/runtime/service/index.ts`, and one entry in
  `scripts/structure-audit/config.mjs`
- Must not touch: `AS/runtime/service.ts`, the dataset store, executor files,
  every other file
- Validation, run alone: the new tests with `--no-file-parallelism`;
  `pnpm --filter fluxiq check` (a failure only in another worker's files is
  rerun once later and reported); structure audit; mutations observed red and
  reverted (on a scratch copy if real source is refused)
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k4b-datasets-collaborator.md`

### Brief: k7-recording-record-output-lift
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: K7 per `reports/k-datasets-execution.md` §4 K7, with CD19 including
  `timeoutMs`: `recordOutput` and `timeoutMs` on
  `AutomationStudioRecordingMapperCandidate` (`AS/nodes/importer-sdk.ts`) and
  `RecordingFlowActionCandidate` (`AS/runtime/recording-flow-proposal.ts`);
  `liftedRecordOutput` in `AS/runtime/service/recordings/proposal-candidates.ts`
  (records path from the candidate or the domain output's
  `metadata.recordsPath`, cloned, parsed with K1, throwing on an invalid value
  or `encrypt`); the approval write in `appendRecordingProposalToFlow`;
  `candidate-definitions.ts` carrying `recordOutput` and `timeoutMs` into node
  definitions and `materializeRecordingNode`'s parameter values; and
  `docs/architecture/automation-studio-native-nodes.md:268-269`. Tests and
  mutations from the report, plus rows for `timeoutMs`.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD19; the
  report's §4 K7; `reports/k4c0-candidate-helpers-move.md`;
  `reports/k3-policy-action-record-output.md`; correction 2 in
  `F:\!FluxIQWebExtension\docs\working\first-class-data-extraction-plan\reports\x3-x5-execution.md`
- Owns (may edit): `AS/nodes/importer-sdk.ts`,
  `AS/runtime/recording-flow-proposal.ts`,
  `AS/runtime/service/recordings/{proposal-candidates,candidate-definitions}.ts`,
  `AS/runtime/service/recordings/tests/*`, and
  `docs/architecture/automation-studio-native-nodes.md`
- Must not touch: `AS/runtime/service.ts`, every other file
- Validation, run alone: the K7 acceptance command; `pnpm --filter fluxiq check`
  (same rule); structure audit; mutations observed red and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k7-recording-record-output-lift.md`

### Brief: k6-iteration-and-variables
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: K6 per `reports/k-datasets-execution.md` §4 K6, with CD18: run-scoped
  `variables` and per-node `loops` in `AS/runtime/executor/run-state.ts`;
  `node-execution.ts` passes `runState.variables` and an `iteration` context;
  `AutomationNodeIterationState` and `iteration?` in `AS/nodes/contracts.ts`; a
  new `AS/nodes/control-flow/for-each.ts` (`builtin.control.for-each`: input
  `items`, branches `body` and `done`, outputs `item`, `index`, and `count`,
  `maxIterations` default 100 and at most 10,000, `maxStepsPerIteration`
  default 50) registered in `control-flow/index.ts`; the per-iteration step
  allowance and the 100,000-step whole-run ceiling in `graph-run.ts`; a new
  `AS/nodes/data/write-records.ts` (`builtin.data.write-records`, emitting
  `records.write`) registered in `data/index.ts`; capture of `records.write` in
  `record-capture.ts`, with a `batchKey` like a dispatched batch's; and the
  longest-own-key-prefix lookup in `AS/nodes/parameter-bindings.ts`. Tests and
  mutation targets from the report.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD13,
  CD14, and CD18; the report's §4 K6; `reports/k4a-executor-record-capture.md`
- Owns (may edit): `AS/runtime/executor/{run-state,node-execution,graph-run,record-capture}.ts`
  and their tests; `AS/nodes/contracts.ts`;
  `AS/nodes/control-flow/{for-each.ts,index.ts}` and `control-flow/tests/for-each.test.ts`;
  `AS/nodes/data/{write-records.ts,index.ts}` and `data/tests/write-records.test.ts`;
  `AS/nodes/parameter-bindings.ts` and its test; one added case in
  `AS/runtime/tests/composite-executor.test.ts`
- Must not touch: `AS/nodes/index.ts` and `AS/nodes/record-output.ts` (K12d),
  `AS/nodes/importer-sdk.ts` (K7), `AS/runtime/service.ts`, every other file
- Validation, run alone: the K6 acceptance command; `pnpm --filter fluxiq check`
  (a failure only in another worker's files is rerun once later and reported);
  structure audit; mutations observed red and reverted (on a scratch copy if
  real source is refused)
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k6-iteration-and-variables.md`

### Brief: k4c-service-wiring
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: K4c.1-2 per `reports/k-datasets-execution.md` §4 K4c, with CD13-CD21.
  K4c.0's move already landed. Add `readonly runDatasets: AutomationStudioRunDatasets;`
  beside `AS/runtime/service.ts:673-680` and construct it beside `:740-747` from
  `this.projects` and `this.runtimeProjectDatabasePool` — a readonly field, never
  a new service method, because `class-methods` counts methods but not plain
  readonly fields (C8). In the run options block (`:3421-3436`) add
  `if (input.projectId && this.runDatasets.available) graphOptions.onRecordBatch = this.runDatasets.recordBatchHandler(input.projectId, session.runId);`.
  Then settle the three behaviours `k4b-datasets-collaborator` could not prove,
  with tests under `AS/runtime/service/datasets/tests/`: that the persisted rows
  equal the validated rows, that the hook fires through `graphOptions.onRecordBatch`,
  and that a closed pool fails the attempt (fail closed — there is no JSONL
  fallback, per C12). Also determine whether retries and live patches
  (`:3540-3547,3594-3600`) reuse the same `runId`, and record the answer in the
  report either way.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`;
  CD13-CD21; the report's §4 K4c and constraints C8 and C12;
  `reports/k4b-datasets-collaborator.md`
- Owns (may edit): `AS/runtime/service.ts` and
  `AS/runtime/service/datasets/tests/**`
- Must not touch: the `AS/runtime/service/datasets/*.ts` sources (K4b's), the
  executor files (K6's), `AS/runtime/service/recordings/**` and
  `AS/nodes/importer-sdk.ts` (K7's), `scripts/structure-audit/config.mjs`, every
  other file. Do **not** run `pnpm structure:baseline`; the baseline is ratcheted
  by the supervisor only, and say in the report that the service shrank or grew
- Validation, run alone: the datasets tests with `--no-file-parallelism`;
  `pnpm --filter fluxiq check` (a failure only in another worker's files is
  rerun once later and reported); structure audit; mutations observed red and
  reverted (on a scratch copy if real source is refused)
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k4c-service-wiring.md`

### Brief: k8-dataset-endpoints
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: K8 per `reports/k-datasets-execution.md` §4 K8, with CD16-CD17 and
  CD21. K8.0 already landed. Add `listRunDatasets`, `getRunDatasetPage`, and
  `exportRunDataset` to `AS/api/contracts/endpoints.ts`; create
  `AS/api/contracts/dataset.ts` with the three request types, each extending
  `FlowProjectRequest & { runId }` as `run.ts:3-6` does, exported from the
  contracts barrel; create `AS/api/handlers/datasets.ts` with
  `registerRunDatasetEndpoints(dependencies)`, called from `register.ts:39`
  after `registerRunEndpoints`. `programs.read` guards the three reads and
  `flows.write` guards `delete-run-datasets`, which takes an optional
  `datasetId` (CD16-CD17). **Every handler asserts the project's domain access
  first, before it reads anything.** Clamp paging through `AS/storage/paging.ts`
  (1-200, default 50, per C11) — not the Design's 1-500. Add K12's
  `listProjectDatasets` and `listDatasetRuns` record-sets in
  `packages/contracts`. Create the streaming GET route per §2.6: 401 without a
  session cookie, 403 without `programs.read`, 400 for a bad id or format, 404
  for a domain mismatch, `Cache-Control: private, no-store`, `nosniff`, a
  sanitized attachment name, formula-escaped CSV, and an audit row on
  completion, truncation, and failure alike.
- Note: `service.runDatasets` is being added concurrently by `k4c-service-wiring`.
  Write against that contract, and if it is not present when your check runs,
  say so plainly in the report rather than adding it yourself.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`;
  CD13-CD21; the report's §4 K8, §2.2, §2.6, and constraint C11;
  `reports/k4b-datasets-collaborator.md`; `reports/k12-data-view.md` §4.2
- Owns (may edit): `AS/api/contracts/{endpoints,dataset,index}.ts`,
  `AS/api/handlers/{datasets,register,runs}.ts`,
  `AS/api/handlers/tests/{datasets,runs}.test.ts`,
  `packages/contracts/src/record-sets/{project-dataset-summary,dataset-run-summary,index}.ts`
  and their tests, and
  `WEB/app/api/programs/automation-studio/run-datasets/**` (new)
- Must not touch: `AS/runtime/service.ts` and `AS/runtime/service/datasets/**`,
  the executor files, `AS/runtime/service/recordings/**`,
  `WEB/features/**`, every other file
- Validation, run alone: the report's K8 acceptance commands;
  `pnpm --filter fluxiq check` (same rule); structure audit; the report's four
  mutations observed red and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k8-dataset-endpoints.md`

### Brief: k9-datasets-panel
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: K9 per `reports/k-datasets-execution.md` §4 K9, with CD16-CD17 and
  CD21. Create `WEB/features/automation-studio/datasets/` holding `index.ts`,
  `dataset-queries.ts` (following `runtime/run-queries.ts:15-17`),
  `dataset-commands.ts`, `download-href.ts` (URL-encoding the ids and appending
  `domainId` as `program-api.ts:121-127` does), `RunDatasetsPanel.tsx`, and
  `RunDatasetTable.tsx`. The table uses `DataTable`, takes its **columns from
  the stored schema labels and never from row keys**, reads cells by field id,
  pages with a "Load more" button following `nextCursor`, renders URLs as text
  and never as an `href`, and shows JSON cells through `JsonToggle`. Add
  `datasets` commands to `RuntimeDetailCommands` in `runtime/runtime-host.ts:34-41,60-70`
  so tests keep injecting commands; mount `RunDatasetsPanel` in
  `runtime/RunActionLogView.tsx` beside Export Audit (`:267`), with inline
  export downloading a Blob as `:225-233` does and `tooLarge` using
  `download-href`; show `metadata.recordCount` inline in
  `runtime/RunDetailPanels.tsx` (`:216-240`) **without adding an exported
  component — that file is frozen at 9**; and add `"datasets"` to the allowed
  directory list in `tests/architecture-contract.test.ts:74-78` (C10). Add the
  `datasets` style domain.
- Note: the endpoints are being added concurrently by `k8-dataset-endpoints`.
  Write against the endpoint names in the report's §4 K8, and if they are not
  present when your check runs, say so plainly rather than adding them yourself.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`;
  CD16-CD17 and CD21; the report's §4 K9 and constraints C10 and C11;
  `reports/k12-data-view.md` §1.6 and §4.1
- Owns (may edit): `WEB/features/automation-studio/datasets/**` (new),
  `WEB/features/automation-studio/runtime/{runtime-host.ts,RunActionLogView.tsx,RunDetailPanels.tsx}`,
  `runtime/tests/runtime-views.test.tsx`, `tests/architecture-contract.test.ts`,
  and the `datasets` style files
- Must not touch: `WEB/features/automation-studio/parameters/**` (K12d's),
  `views/**`, `live/**`, and `workspace/**` (all K12c's), `packages/fluxiq/**`,
  every other file
- Validation, run alone: the report's K9 acceptance commands; structure audit;
  the report's three mutations observed red and reverted. Do **not** start the
  web panel: a live browser pass needs the user's authorization
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k9-datasets-panel.md`

### Brief: k6b-variable-markers-and-bindings
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: close the two defects `k6-iteration-and-variables` surfaced, both
  recorded in the ledger. **First**, `set-variable` and `map-object` deep-copy
  rows as plain `jsonValue`, so a For Each over extracted records followed by an
  append-list writes the row **text** into the saved trace, defeating CD14 and
  downstream D12: a user who excluded a column to keep private data out of a
  dataset would still find that data in the run's saved trace. Carry the
  `$dataset` and `$datasetRow` identity markers through the variable path
  instead of deep-copying, so the trace keeps holding markers rather than
  values. **Second**, parameter bindings resolve variables from the run's seed
  rather than the live run map, so a variable written during a run is invisible
  to a later node's binding; resolve against the live map. Reproduce each defect
  as a failing test before fixing it, and say in the report what the failing
  output was. Required new test: a For Each body writes a variable, a later
  node's binding reads it, and a bundle-wide scan finds no planted row value
  anywhere in the saved trace.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD14 and
  CD18; this document's two 2026-09-15 findings entries;
  `reports/k6-iteration-and-variables.md`; `reports/k4a-executor-record-capture.md`
- Owns (may edit): `AS/nodes/data/**`, `AS/nodes/parameter-bindings.ts`,
  `AS/runtime/executor/{run-state,node-execution}.ts`, and the `tests/` folders
  of those directories
- Must not touch: `AS/nodes/contracts.ts`, `AS/nodes/importer-sdk.ts`, and
  `AS/runtime/service/recordings/**` (all `k7b-recorded-node-ports`'s);
  `AS/runtime/service.ts` and `AS/runtime/service/datasets/**` (K4c's);
  `AS/api/**` (K8's); `WEB/**` (K9's); every other file
- Validation, run alone: K6's acceptance command
  (`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/nodes src/programs/automation-studio/runtime/executor/tests src/programs/automation-studio/runtime/tests/composite-executor.test.ts --no-file-parallelism`,
  which was 193 passed before your change); `pnpm --filter fluxiq check` (a
  failure only in another worker's files is rerun once later and reported);
  structure audit; mutations observed red and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k6b-variable-markers-and-bindings.md`

### Brief: k7b-recorded-node-ports
- Repository: FluxIQ Core (`F:\!FluxIQ`)
- Task: close the gap `k7-recording-record-output-lift` surfaced. A node
  definition derived from a recording exposes neither `recordOutput` nor
  `timeoutMs` as an editable parameter and declares no `records` output port, so
  a user can record an extraction and Core will persist its dataset, yet no
  later node in the same Flow can consume those records and the user cannot see
  or change the extraction on the node. **Confirm the gap first** against
  `AS/nodes/contracts.ts` and a recorded definition, and report what you
  observed; if it turns out a `records` port is already reachable by another
  route, say so and stop rather than adding a second one. Otherwise give a
  recorded definition the same `records` output port and the same editable
  `record-output` parameter control that a hand-authored node gets from K3 and
  K12d, so K6's For Each can iterate a recorded extraction's rows. Tests must
  include one that takes a recorded candidate through to a definition whose
  records a following node can bind to.
- Required reads: `AGENTS.md`; `docs/architecture/code-structure.md`; CD19 and
  CD21; this document's 2026-09-15 records-gap finding;
  `reports/k7-recording-record-output-lift.md`;
  `reports/k3-policy-action-record-output.md`; `reports/k12d-record-output-editor.md`
- Owns (may edit): `AS/nodes/contracts.ts`, `AS/nodes/importer-sdk.ts`,
  `AS/runtime/service/recordings/{proposal-candidates,candidate-definitions}.ts`
  and `AS/runtime/service/recordings/tests/**`
- Must not touch: `AS/nodes/data/**`, `AS/nodes/parameter-bindings.ts`, and
  `AS/runtime/executor/**` (all `k6b-variable-markers-and-bindings`'s);
  `AS/runtime/service.ts` and `AS/runtime/service/datasets/**` (K4c's);
  `AS/api/**` (K8's); `WEB/**` (K9's); every other file
- Validation, run alone: K7's acceptance command
  (`pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/recordings/tests --no-file-parallelism`,
  which was 39 passed before your change); `pnpm --filter fluxiq check` (same
  rule); structure audit; mutations observed red and reverted
- Report to: `F:\!FluxIQ\docs\working\first-class-data-extraction-plan\reports\k7b-recorded-node-ports.md`

### 2026-09-15 — Finding: four response envelopes were chosen, not specified
- Agent: supervisor, from `k8-dataset-endpoints`'s finding
- Why: the plan left four dataset response envelope shapes unpinned, so K8 chose
  them. K9 and K12c read those same envelopes, and K9 was running concurrently,
  so the two sides could easily have disagreed in a way no single package's
  tests would catch — each would be internally consistent and the panel would
  simply show nothing
- Validation: the supervisor messaged `k9-datasets-panel` mid-flight with K8's
  report path and told it to conform to the landed signatures rather than the
  plan's description, and to report a disagreement rather than change either
  side. Whether it did is checked when K9 reports
- Outcome: Open until K9 reports
- Follow-up: pin the four envelopes in this document when K9 lands, so K12c
  inherits them rather than choosing again

### 2026-09-15 — Finding: K4c pushed the service file past its ratchet
- Agent: supervisor, from `k8-dataset-endpoints`'s finding
- Why: `AS/runtime/service.ts` is reported at 6764 lines against a ratcheted
  baseline of 6759, so `pnpm check` fails until the five lines are offset. The
  plan's own constraint C8 says every line added to that file must be offset in
  the same change, which is why K4c.0 moved about 45 lines out first. The fix is
  to offset the lines, **not** to re-ratchet the baseline upward: the baseline
  only ever moves down, and loosening it to make a gate pass is exactly the kind
  of deferral this repository forbids
- Validation: not yet confirmed by the supervisor; `pnpm --filter fluxiq check`
  cannot run cleanly while K4c, K6b, and K7b hold files in this package
- Outcome: Resolved — see the K4c entry at the top of this ledger
- Follow-up: none. K4c offset the lines rather than re-ratcheting, leaving the
  file at 6758 against the unchanged baseline of 6759. The supervisor runs
  `pnpm structure:baseline` only at commit time, once every worker has released
  its files

### 2026-09-15 — K12d verified against a rebuilt Core
- Agent: supervisor; worker `k12d-record-output-editor`
- Changed: new `AS/nodes/record-output.ts` with its barrel line;
  `WEB/features/automation-studio/parameters/ParameterEditor.tsx` and its test;
  new `WEB/features/automation-studio/parameters/record-output/` with six
  sources and five test files (all uncommitted)
- Why: the record-output field editor, which is what lets a user see and change
  an extraction's fields on a node — including marking a column excluded (D12).
  The web tests resolve `fluxiq` from `dist` rather than from source, so the
  worker's own green run only proved the build as it stood before K6 and K7
  landed; this entry is the rerun against a Core built from the current tree
- Validation: in `F:\!FluxIQ`, `pnpm --filter fluxiq build` → exit 0, then
  `pnpm --filter @fluxiq/web exec vitest run src/features/automation-studio/parameters --no-file-parallelism`
  → Test Files 6 passed, Tests 34 passed, exit 0. The worker's own 11 mutations
  and its clean `@fluxiq/web check` are its claims
- Outcome: Accepted
- Follow-up: five new CSS class names have no styles yet; K9 adds the `datasets`
  style domain, and the record-output styles belong with it

### 2026-09-15 — K6 landed; two defects it surfaced are taken in, not parked
- Agent: supervisor; worker `k6-iteration-and-variables`
- Changed: `AS/runtime/executor/{run-state,node-execution,graph-run,record-capture}.ts`;
  `AS/nodes/contracts.ts`; new `AS/nodes/control-flow/for-each.ts` and
  `AS/nodes/data/write-records.ts` with their barrels and tests;
  `AS/nodes/parameter-bindings.ts` and its test; three executor test files; one
  case in `runtime/tests/composite-executor.test.ts` (all uncommitted)
- Why: run-scoped variables, per-node loops, and a `builtin.control.for-each`
  node at scope "both" rather than "routine", so a policy Flow can iterate
  extracted rows. Beyond the report, capture now rewrites a `records.write`
  effect's rows to the validated array and withholds them when nothing is
  captured; without that, raw rows including excluded fields would reach the
  saved trace through `attempt.effects`, which CD14 forbids
- Validation: in `F:\!FluxIQ`,
  `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/nodes src/programs/automation-studio/runtime/executor/tests src/programs/automation-studio/runtime/tests/composite-executor.test.ts --no-file-parallelism`
  → Test Files 17 passed, Tests 193 passed, exit 0 (146 before K6). The worker's
  14 mutations and its clean package check are its own claims
- Outcome: Accepted, with two follow-ups
- Follow-up: the two defects below, and `pnpm docs:reference` — the generated
  framework reference is now stale, which K10 must regenerate

### 2026-09-15 — Finding: row text reaches the saved trace through variables
- Agent: supervisor, from `k6-iteration-and-variables`'s finding
- Why: `set-variable` and `map-object` deep-copy rows as plain `jsonValue`, so a
  For Each over extracted records followed by an append-list writes the row
  **text** into the saved trace, even though the identity markers CD14 relies on
  hold everywhere else. That is the same leak CD14 and downstream D12 exist to
  prevent, reached by a different route: a user who excluded a column to keep
  private data out of a dataset would still find that data in the run's saved
  trace. It is a security defect, so it is taken in rather than parked
- Validation: not yet reproduced by the supervisor; reported by the worker that
  wrote the capture path, and consistent with `record-capture.ts` rewriting only
  the effect rows it owns
- Outcome: Open
- Follow-up: a brief owning `AS/nodes/data/**` and the variable path, to carry
  the `$dataset`/`$datasetRow` markers through variables instead of deep copies,
  before the datasets work is called complete

### 2026-09-15 — Finding: bindings read the seed, not the live variable map
- Agent: supervisor, from `k6-iteration-and-variables`'s finding
- Why: parameter bindings still resolve variables from the run's seed rather
  than the live run map, so a variable written during a run is invisible to a
  later node's binding. Iteration is the feature that makes this reachable — a
  For Each body that sets a variable and a later node that reads it will read
  the stale seed — so K6 is what turns a latent inconsistency into a wrong
  result a user would actually hit
- Validation: not yet reproduced by the supervisor; the worker scoped
  `node-execution.ts` to the context and reported the binding path as untouched
- Outcome: Open
- Follow-up: same brief as the entry above, which already owns
  `parameter-bindings.ts`'s neighbourhood; needs a test where a For Each body
  writes a variable and a later node's binding reads it

### 2026-09-15 — K7 verified; an invalid timeout now rejects; a records gap found
- Agent: supervisor; worker `k7-recording-record-output-lift`
- Changed: `AS/nodes/importer-sdk.ts` (two optional candidate fields and one
  type import), `AS/runtime/recording-flow-proposal.ts`,
  `AS/runtime/service/recordings/{proposal-candidates,candidate-definitions}.ts`
  and their two test files, and
  `docs/architecture/automation-studio-native-nodes.md` (all uncommitted)
- Why: a recording's proposed node now carries `recordOutput` and `timeoutMs`
  through to the Flow. The worker decided that an invalid candidate `timeoutMs`
  rejects the candidate, where CD19 mandates rejection only for `recordOutput`;
  the supervisor accepts that as **CD22**, because dropping an invalid value
  instead would silently restore the 5,000 ms default that downstream D14 exists
  to remove, and a silent wrong timeout is worse than a refused candidate
- Validation: in `F:\!FluxIQ`,
  `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/service/recordings/tests --no-file-parallelism`
  → Test Files 2 passed, Tests 39 passed, exit 0. The worker's 18 mutations were
  applied by a load-time transform rather than on disk, and `git diff --stat`
  afterwards shows no mutation text left in either source file
- Outcome: Accepted
- Follow-up: K4c wires `onRecordBatch`, which is what lets the worker's
  "a run persists a dataset" row be finished

### 2026-09-15 — Finding: a recorded extraction's records cannot be wired yet
- Agent: supervisor, from `k7-recording-record-output-lift`'s finding
- Why: a node definition derived from a recording exposes neither `recordOutput`
  nor `timeoutMs` as an editable parameter, and declares no `records` output
  port. So a user can record an extraction and Core will persist its dataset,
  but no later node in the same Flow can consume those records, and the user
  cannot see or change the extraction on the node. That defeats K6's iteration
  for exactly the flows recording produces, which is the path downstream X4
  depends on. This is a genuine gap in the plan, not in the worker's work, and
  it is taken in rather than parked
- Validation: not yet reproduced by the supervisor; the worker observed it while
  writing `candidate-definitions.ts`, and it is consistent with K12d having
  added the editor only for hand-authored node parameters
- Outcome: Open
- Follow-up: confirm against `AS/nodes/contracts.ts` once K6 releases that file,
  then a brief owning the recorded-node definition's ports and parameter
  exposure, before downstream X4 is judged complete

### 2026-09-15 — K0.2 write-ahead and K4b landed; an audit-config trap found
- Agent: supervisor; workers `k0-2-secret-keys`, `k4b-datasets-collaborator`
- Changed: `FX/programs/secret-keys/{types.ts, api/handlers.ts, runtime/**}` and
  their tests, `programs/tests/global-secret-keys.test.ts`,
  `programs/_shared/tests/runtime-llm-grants.test.ts`; new
  `AS/runtime/service/datasets/{index,types,run-datasets,export-encoder,export-body,schema-digest}.ts`
  with four test files, one export line in `AS/runtime/service/index.ts`, and one
  `contractSpreadPaths` entry in `scripts/structure-audit/config.mjs` (all
  uncommitted)
- Why: K0.2 closes the last window in the password change. A record may now
  carry an optional `pendingSealed`, so the new seal is written ahead of the
  commit and a crash between the credential write and the commit leaves the key
  recoverable instead of stranded under the old password. Abort removes the
  pending seal, rotation clears it, and the 60-second timeout now only forgets
  in memory rather than deleting from disk. K4b adds the datasets collaborator
  with the export encoder and the schema digest
- Validation: in `F:\!FluxIQ`,
  `pnpm --filter fluxiq exec vitest run src/programs/secret-keys src/programs/tests/global-secret-keys.test.ts src/programs/_shared/tests/runtime-credential-changes.test.ts src/programs/_shared/tests/runtime-llm-grants.test.ts --no-file-parallelism`
  → Test Files 10 passed, Tests 57 passed, exit 0. K4b's own suite and its clean
  package check are its claims, not yet rerun by the supervisor; the full
  `pnpm --filter fluxiq check` runs once K6 and K7 land
- Outcome: Accepted
- Follow-up: K4c.1-2 wires the collaborator through `AutomationStudioService`
  and settles K4b's three unproven behaviours (persisted rows equal validated
  rows, the `onRecordBatch` hook, and a closed pool failing the attempt)

### 2026-09-15 — Audit-config exemption paths must not end in a slash
- Agent: supervisor, from `k4b-datasets-collaborator`'s finding
- Why: a `contractSpreadPaths` entry matches as either `path` or `path + "/"`,
  so an entry written with a trailing slash matches nothing. The exemption then
  silently does nothing, and a later reader believes a directory is exempt when
  it is not. §4's K4b text specified the entry with a trailing slash; the worker
  wrote it without one and proved both spellings. The plan text is the defect,
  not the code
- Validation: read `F:\!FluxIQWebExtension\scripts\structure-audit\config.mjs`
  directly — all four downstream `contractSpreadPaths` entries are already
  written without a trailing slash, so the trap is Core-only and nothing
  downstream needs changing
- Outcome: Accepted
- Follow-up: correct §4's K4b wording when K10 sweeps the document

### 2026-09-15 — K0.5 complete and verified; the batches table registered
- Agent: downstream supervisor; worker `k0-5-credential-wiring`
- Changed: `FX/programs/identity-access/runtime/run-credential-change.ts` and
  its new test; `docs/operations/data-and-state.md` and
  `docs/architecture/package-boundaries.md` (port wording); and, by the
  supervisor, `run_dataset_batches` added to
  `AS/storage/project/schema/table-names.ts`, which K2's amendment could not own
  (all uncommitted)
- Why: once the credential write succeeds, a subscriber's commit error no
  longer fails the password change. Every asked subscriber still commits, and
  one counts-and-ids-only `CredentialCommitFailure` is recorded through an
  injectable sink, defaulting to a single warning line. A prepare failure still
  aborts and refuses. Until K0.2's write-ahead lands, such a commit failure
  leaves that user's keys under the old password, which is what the write-ahead
  fixes
- Validation: in `F:\!FluxIQ`,
  `pnpm --filter fluxiq exec vitest run src/programs/identity-access src/programs/_shared/tests/runtime-credential-changes.test.ts src/programs/tests/global-identity-access.test.ts --no-file-parallelism`
  → Tests 39 passed;
  `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/storage/project/tests/schema.test.ts src/programs/automation-studio/storage/project/tests/run-dataset-store.test.ts --no-file-parallelism`
  → Tests 29 passed with the table registered. `pnpm --filter fluxiq check`
  still exits on K7's in-progress test file, so it runs again once K7 lands.
  Mutation proofs not rerun by the supervisor.
- Outcome: Accepted
- Follow-up: K0.2's write-ahead, then `pnpm --filter fluxiq check`, the
  regenerated reference, and the K0 group commit

### 2026-09-15 — K0 mutation proofs, K0.5 limiter, K5, and K2's amendment verified
- Agent: downstream supervisor; workers `k0-mutation-proofs`,
  `k0-5-credential-wiring`, `k5-run-detail-datasets`, `k2-run-dataset-store`
- Changed: `AS/storage/project/{run-dataset-store.ts,schema/run-datasets.ts}`
  and the store test (new `run_dataset_batches` table, replacement by
  `batchKey`, per-batch row, invalid, and truncated counts);
  `AS/model/flow-adaptation.ts`, `AS/storage/project/runtime-stream-store.ts`,
  `AS/runtime/service/summaries/conversions.ts`, and their tests; the login
  route and its test (all uncommitted); the reports; the archive (the K5 brief,
  an older ledger entry, and Core's planning-time findings)
- Why: the scratch-copy proofs close K0.1's mutations 10 and 14 and K0.4's
  recheck. K0.5's per-address bound applies only with `FLUXIQ_TRUST_PROXY` and a
  forwarded address, beside the per-username bound and a shared 100-failure
  panel bound. K5 makes the dataset store the only source of `datasets` on run
  detail; paged `listRunActions` still carries no `recordCount`, so K9 shows it
  only in action and full detail. K2's ids accept any text except control
  characters, because node ids are unrestricted
- Validation: in `packages/fluxiq` copies under the scratchpad, the
  `k0-mutation-proofs` report records every unmodified copy passing and every
  mutated copy failing (password-kdf 8, 7, 26, and 2 failures; Database Manager
  7); the supervisor then ran, in `packages/fluxiq`,
  `npx vitest run src/programs/_shared/password-kdf src/programs/database-manager/api/tests/handlers.test.ts --no-file-parallelism`
  → 1 failed and 117 passed, and on the one rerun → Tests 118 passed, so the
  failure rests on a single observation on this machine. In `F:\!FluxIQ`:
  `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/storage/project/tests/runtime-stream-store.test.ts src/programs/automation-studio/runtime/service/summaries/tests --no-file-parallelism`
  → Tests 10 passed; `pnpm --filter @fluxiq/web exec vitest run src/app/api/auth/login --no-file-parallelism`
  → Tests 8 passed; `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/storage/project/tests/run-dataset-store.test.ts src/programs/automation-studio/storage/project/tests/schema.test.ts --no-file-parallelism`
  → Tests 29 passed.
- Outcome: Accepted
- Follow-up: the supervisor adds `run_dataset_batches` to `table-names.ts`,
  which K2's amendment could not own; the K0 group commit after the K0.2 and
  K0.5 amendments

### 2026-09-15 — K0.5 done with two gaps taken in; K4a batch key verified; K6 dispatched
- Agent: downstream supervisor; workers `k0-5-credential-wiring`,
  `k4a-executor-record-capture`, `k12d-record-output-editor`
- Changed: `FX/programs/_shared/runtime.ts` and new
  `_shared/tests/runtime-credential-changes.test.ts`;
  `identity-access/runtime/service.ts` (`upsertUser`) and its test;
  `WEB/app/api/auth/login/route.ts` and its test; `docs/operations/data-and-state.md`,
  `docs/programs/global-programs.md`, `persistence.md`, `package-boundaries.md`;
  `packages/fluxiq/package.json` at 0.5.0; the executor files for `batchKey`
  (all uncommitted); reports; this document (brief `k6-iteration-and-variables`)
- Why: K0.5 wires the credential-change port, refuses credential changes
  through `upsertUser`, bounds logins per address, and records 0.5.0 with
  Migration Notes; K4d's type change ships in 0.5.0. Two gaps are taken in.
  Without `FLUXIQ_TRUST_PROXY` every client shares one address, so 20 bad
  logins would lock everyone out; the per-address bound now applies only with a
  trusted address, beside the per-username bound and a 100-failure panel bound.
  A Secret Keys commit error after the password write could strand keys; the
  change becomes write-ahead, with a pending seal that unlock also tries.
  K4a's `batchKey` joins the enclosing Call Flow attempt ids and the capturing
  attempt id with `/`, escaping `%` and `/`, through a `callFlowAttemptPath`
  option; a host executor that builds fresh child options would lose it, which
  K4c.1-2 checks. K12d stopped because no `fluxiq` subpath exported K1's parser
  to the web, and resumes owning a new `AS/nodes/record-output.ts` and one line
  in `AS/nodes/index.ts`
- Validation: in `F:\!FluxIQ`,
  `pnpm --filter fluxiq exec vitest run src/programs/automation-studio/runtime/executor/tests --no-file-parallelism`
  → Tests 100 passed. K0.5 not yet rerun by the supervisor.
- Outcome: Partial
- Follow-up: verify both K0 amendments; then the K0 group commit

This file is the archive; nothing is earlier than what is here. The live
document is the
[first-class data extraction plan](../../first-class-data-extraction-plan.md).

## 2026-09-15 second compaction: settled verification entries

### 2026-09-15 — Core's gates are all green; a compaction bug caught by docs:check
- Agent: supervisor
- Changed: the regenerated `docs/reference/framework-reference.md` and its
  package copy, `.structure-baseline.json`, `docs/working/README.md`, and one
  corrected link in the archive
- Why: the finishing sequence, in order — the full suite, the regenerated
  framework reference K6 had made stale, the build, and the baseline last
- Why (the bug, mine): compacting this document moved a ledger tail into the
  archive, carrying a relative link that resolved from the document's directory
  but not from the archive's. `docs:check` caught it, which is the gate doing
  exactly its job. The line was also self-referential once moved — it told a
  reader of the archive that earlier entries were in the archive — so it now
  points back to the live document instead. The same fault and fix applied
  downstream
- Validation: in `F:\!FluxIQ`, `pnpm --filter fluxiq exec vitest run --no-file-parallelism`
  → **Test Files 172 passed, Tests 1381 passed**, exit 0, one file at a time for
  this machine's RAM fault; `pnpm docs:reference` → wrote both copies, 1,619
  public declarations; `pnpm --filter fluxiq build` → exit 0;
  `pnpm structure:baseline` → written, 256 entries across 7 rules, and it
  **lowered** `AS/runtime/service.ts` from 6759 to 6758, so K4c's offset is
  ratcheted in rather than merely tolerated; `pnpm docs:check` → exit 0,
  "Validated local links in 134 authored/reference Markdown files" and
  "Deterministic framework reference is current"; `node scripts/structure-audit.mjs`
  → **passed**, 0 violations, 127 advisory warnings all pre-existing
- Outcome: Accepted
- Follow-up: Core is ready to commit. The push waits for the downstream side,
  because this change spans both repositories and `AGENTS.md` requires both
  `dev` branches to move in the same work unit or they drift

### 2026-09-15 — This document compacted to fit its own budget
- Agent: supervisor
- Changed: this document and
  [the archive](./2026-09-15-planning-briefs-and-ledger.md)
- Why: the document had reached 1,337 lines against the 800-line budget its own
  `working-docs` audit rule enforces, which fails the structure gate and so
  would have blocked the Core commit. All ten completed worker briefs and
  thirteen settled ledger entries moved to the archive; the entries covering
  still-open findings and the verified results of this session's work stayed
- Validation: the move was scripted rather than hand-edited, and the script
  reported `23/23` sections matched with none unmatched — so no heading was
  silently missed. 1,337 → 729 lines, and the archive grew from 53,262 to
  94,682 bytes, which accounts for the removed text. `node scripts/structure-audit.mjs`
  → 1 violation, down from 2: only `docs/working/README.md` being out of date
  remains, and `pnpm structure:baseline` regenerates that at commit time. One
  advisory warning is unrelated and pre-existing
  (`flow-bootstrap/generation-failure.ts` at 502 lines)
- Outcome: Accepted
- Follow-up: none; the archived entries stay in git and are linked from here
