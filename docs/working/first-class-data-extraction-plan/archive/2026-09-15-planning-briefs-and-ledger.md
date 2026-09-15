# First-Class Data Extraction Plan (Core share): planning archive

Superseded detail moved from [the plan](../../first-class-data-extraction-plan.md)
on 2026-09-15 to keep it under the 800-line compaction threshold: completed
worker briefs and the planning-phase ledger entries. Their
results are folded into that document's Decisions and Design sections.

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

## Work Ledger

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
