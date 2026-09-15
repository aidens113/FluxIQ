# First-Class Data Extraction Plan (Core share)

Status: Active
Status detail: Plan firm 2026-09-15; K0-K11 are decided and executable from their investigations, and K0 execution has started.
Created: 2026-09-15
Last updated: 2026-09-15
Owner: Senior supervisor agent
Scope: Core's share of making structured data extraction a fundamental FluxIQ capability: domain-neutral dataset contracts (records with a schema), per-run persistence, table preview, CSV/JSON export, iteration over records by later nodes, the web-panel UI for them, the recording-proposal seam through which a domain proposes extract nodes, encrypted record fields, and the credential and key hardening they depend on.
Paired document: `F:\!FluxIQWebExtension\docs\working\first-class-data-extraction-plan.md`
Related: [package boundaries](../architecture/package-boundaries.md), [code structure](../architecture/code-structure.md), [persistence](../architecture/automation-studio/persistence.md), [native nodes](../architecture/automation-studio-native-nodes.md), [ex-b-core report](./first-class-data-extraction-plan/reports/ex-b-core.md), [k0 report](./first-class-data-extraction-plan/reports/k0-secret-keys-kdf.md), [k11 report](./first-class-data-extraction-plan/reports/k11-encrypted-fields.md), [k-datasets report](./first-class-data-extraction-plan/reports/k-datasets-execution.md)

---

## Current State

**Phase, as of 2026-09-15: plan firm; K0 execution started.** The
downstream user decided that structured data extraction is a fundamental FluxIQ
capability, Core included, then ruled Secret Keys' password-derivation cost
unacceptable and added an Encrypt column. The downstream document owns the
overall plan, phases X0-X6, and sequencing; this document owns the
domain-neutral dataset contracts, Core's phases K0-K11, and decisions CD1-CD20.
Path prefixes: `FX/` is `packages/fluxiq/src/`, `AS/` is
`FX/programs/automation-studio/`, `WEB/` is `apps/web/src/`.

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

**Done:** investigations `ex-b-core`, `k0-secret-keys-kdf`,
`k11-encrypted-fields`, and `k-datasets-execution`; decisions CD1-CD20;
execution detail for K0, K1-K10, and K11.

**In progress:** K0.2 (`k0-2-secret-keys`) and K2 (`k2-run-dataset-store`),
beside downstream `x0-9` and `x1-domain-contracts`. At most four code workers
run at once on this machine.
**Verified, uncommitted:** K0.1, K0.3, K0.4, K3, K4c.0, K4d, and K8.0; the guard
mutation proofs for K0.1 and K0.4 still run on scratch copies, because the
permission classifier refuses weakening real source. **Landed:** K1 (`33f0b4a`).
**Briefed, waiting for a slot:** K4a and K12d.

**Not done:** K0.2-K0.6 and K1-K11.

**Next steps:**
1. Verify K0.2, K0.3, and K4d; run the outstanding guard mutation proofs on
   scratch copies; run `pnpm --filter fluxiq check`; commit K0.
2. As worker slots free: K2 and K4a; K12d after K3.
3. Follow the dataset order under "Dataset execution (K1-K10)", then K12, and
   stop for the user's plan review (downstream D15); K11 stays in Week 3 with
   downstream Phase 3.7.

**Blockers:** none.

---

## Decisions

- **CD1. Extraction stays an ordinary `builtin.policy.action`** dispatching a
  domain output. Core adds a record-output declaration, per-run datasets,
  iteration, and UI; a new node type would lose target resolution, expected
  transitions, and adaptation.
- **CD2. Password-derived keys and hashes use scrypt N=2^17, r=8, p=1,**
  32-byte output, `maxmem` 256·N·r (256 MiB; 128 MiB is refused by Node),
  through one shared async module with an exact read allowlist (v1 is N=2^14;
  v2 accepts N=2^17 or 2^18) and a process-wide limit of two concurrent
  derivations. Argon2id is not in Node 22's crypto, so scrypt stays. The k0
  worker observed one derivation at 347-357 ms against 44 ms today, a single
  observation on this machine.
- **CD3. Records state their parameters and upgrade themselves.** Secret Keys
  and credential envelopes become version 2 with `kdfParams`; hashes become
  `$scrypt$ln=17,r=8,p=1$<salt>$<hash>`. Readers accept v1 and v2; v2 seals and
  PHC hashes derive from the decoded salt bytes (standard PHC), v1 from the
  salt text as today. After a
  successful unlock, login, reveal, or PIN check, an older record is re-sealed
  with no user step: once per record, compare-and-swap in memory, held keys
  swapped and their old buffers zeroed, `updatedAtMs` and `lastRotatedAtMs`
  unchanged. A record is upgraded only when its recorded cost is below the
  build's write cost and is never rewritten weaker, so rolling back from a
  raised cost cannot downgrade records. A failed attempt changes nothing.
- **CD4. Login costs one identity derivation, off the event loop,** and the
  Secret Keys unlock tries only keys sealed for that user (`sealedByUserId`)
  plus not-yet-upgraded v1 keys. Projected cold login with three keys: about
  1.1 s, against about 2.5 s at the new cost with today's code.
- **CD5. K0 fixes every credential defect it found, not only the cost:**
  - unlock compares `lastRotatedAtMs`, so a metadata edit no longer breaks it;
  - a self-service password change re-seals that user's Secret Keys through an
    Identity Access credential-change port (prepare, credential write, commit);
    an administrator's reset of another account cannot recover them, and the
    UI and documentation say so;
  - `pinVerifierHash` is no longer persisted; PINs verify only against the
    credential in memory, so after a restart a PIN-gated action asks the user
    to sign in again (the existing message at `identity-access/runtime/service.ts:338`);
  - `createRevealAuthorization` verifies that the derived key opens the record;
  - session ids are stored as SHA-256 digests, as gateway tokens already are;
  - unknown and disabled usernames run a dummy derivation through the same
    limiter, and the login limiter keeps a per-address bound independent of the
    username;
  - Database Manager `put-record` and `delete-record` on `identity.users` and
    `secret.keys` require the credential recheck;
  - `upsertUser` on an existing account cannot change its credentials; they
    change only through `setPassword`, `setPasswordAuthorized`, and the
    credential-change port (found by K0.3, fixed in K0.5).
- **CD6. K0 ships in `fluxiq` 0.5.0** (from 0.4.0) with a Migration Notes
  entry: an older binary cannot read upgraded records, so a user re-sealed by
  0.5.0 cannot log in to 0.4.x. Rollback means rolling forward or restoring a
  `global.sqlite` backup taken before the upgrade.
- **CD7. Encrypted record fields use a three-level key hierarchy.** The account
  password (CD2's module) seals an account X25519 private key; each project's
  X25519 private key is wrapped to every holder's account public key; every cell
  is a sealed box: a fresh ephemeral X25519 key, HKDF-SHA256 bound to both
  public keys and the cell context, AES-256-GCM with a random IV, plaintext
  padded to size buckets, at most 64 KiB per value. A stored cell holds
  `{ $fluxiqEncrypted: "cell.v1", kid, epk, iv, tag, ct }`, bound to project,
  dataset, field, and value type; no hash, token, clear length, or per-value
  digest is stored. RSA-OAEP was rejected for ciphertext size and speed.
- **CD8. No decryption material is held for a login session.** Reveal (at most
  50 cells, shown for 30 seconds), clear export, and a later-run decryption
  grant (at most 300 seconds, bound to actor, session, project, Flow, execution
  digest, and cells) each require the password, PIN, and TOTP gate at that
  moment. Runs seal with the public key and never decrypt without a grant; a
  binding to a sealed cell without one fails with
  `records.decryption_grant_required`.
- **CD9. Key holders are the only project membership.** Creating a project key
  and granting, removing, or rotating holders require `secrets.manage` plus the
  credential gate. The last holder cannot be removed; removal rotates the key;
  an administrator's reset of another account orphans that account's wraps.
  Records live in a `record.keys` store in the global databases, never
  registered with Database Manager, and the public key of record is read only
  from that store. Audit records carry ids and counts only.
- **CD10. Core seals at capture, and no clear encrypted value persists.** A
  preflight fails the run before dispatch when the project has no active key
  (`records.encryption_key_unavailable`); K4a's record capture seals before
  building outputs, on every dispatch path (CD13); K4d's
  `withheldResultPayload` already keeps any `recordOutput` payload out of saved
  command attempts (CD15), so K11 adds no `protectedResultPaths`; a seal error
  fails the whole batch; downgrading a field
  from `encrypt` requires the credential gate and is audited. An end-to-end
  canary test scans every file a run wrote.
- **CD11. `SQLiteRepository` gains a revision-checked put** as K11's first
  step, so key grants and rotation are never lost to last-write-wins. K0's
  re-seal is idempotent and heals under blind writes, so it does not wait.
- **CD12. Sealing in the extension is not chosen:** it needs extension crypto
  and a gateway contract change, and downstream D13 does not claim to protect a
  live process.
- **CD13. Capture lives in node execution, not `io-policy.ts`.** The three
  dispatch paths merge only in `dispatchAutomationStudioEffects`
  (`AS/runtime/executor/node-execution.ts:141-164`), so `record-capture.ts`
  runs there after each successful dispatch, validates rows by allowlist copy
  (unknown and `exclude` keys never survive), and replaces the `recordsPath`
  subtree of `outputs.result` with the validated array. `builtin.policy.action`
  parses `recordOutput` in `execute`, and an invalid or `encrypt` value fails
  the node before any dispatch.
- **CD14. The saved trace holds markers, not rows.** Rows would otherwise reach
  it through `values`, every later attempt's `inputs`, and `outputs.result`. A
  run-scoped summary replaces each captured array with
  `{ $dataset: { datasetId, recordCount, schemaDigest } }` and each captured row
  with `{ $datasetRow: { datasetId, ordinal } }`, by identity and including
  Call Flow children; the withholding walk leaves the markers untouched.
- **CD15. Saved command attempts withhold the payload of any `recordOutput`
  dispatch** (`withheldResultPayload`, K4d), because the framework runtime
  otherwise writes `result.payload`, rows and all, to `attempt.json` before
  Automation Studio sees it.
- **CD16. Rows are stored raw in `project.sqlite`, protected, never stripped,**
  since substring withholding would corrupt extracted text. Dataset endpoints
  require `programs.read` and check the project's domain first, like the
  reusable-context handlers. Domain scope is a caller-named filter, not an
  authorization boundary (`k11-encrypted-fields` §1), so the run endpoints that
  skip that check leak nothing new and stay unchanged. There is no JSONL
  fallback and no per-row content object: when the store cannot be opened, the
  attempt fails.
- **CD17. Datasets live as long as their project,** because nothing purges runs
  today. Users can delete a run's datasets, or one of them, from the datasets
  panel or the Data window (`delete-run-datasets` with an optional `datasetId`,
  `flows.write`, audited); `persistence.md` says so
  plainly, and a future run purge calls the same store method.
- **CD18. No `$output` binding and no withholding exemption.** State paths
  reach dotted recorded node ids through a longest-own-key-prefix lookup in
  `parameter-bindings.ts`; runtime variables become run-scoped;
  `builtin.control.for-each` grants `maxStepsPerIteration` per body pass under a
  whole-run ceiling of 100,000 steps; `builtin.data.write-records` emits a
  `records.write` effect that capture persists without a dispatcher.
- **CD19. `recordsPath` is required on a stored record output.** A proposal
  takes it from the candidate, or else from the domain output's
  `metadata.recordsPath`, and is rejected otherwise; `recordOutput` is carried
  into node definitions, and an invalid one rejects the candidate, unlike
  `expectedState`. K7 also lifts an optional candidate `timeoutMs` into
  `parameterValues.timeoutMs`, because a recorded `builtin.policy.action`
  otherwise dispatches with its 5,000 ms default (downstream D14 and D16). Core
  never hard-codes `extracted`. Read-only extraction's
  side-effect class is unchanged, because nothing reads it for policy actions.
- **CD20. Caps and audit:** at most 200 schema fields; `maxRecords` default
  1,000 and ceiling 10,000 per capture; 64 KiB per row (larger rows count as
  invalid); 100,000 rows per dataset per run, then `truncated`; pages of 1-200
  (default 50) through the shared paging helper; inline export up to 10,000
  rows and 5 MiB, else `tooLarge` with a streaming link; streams up to 100,000
  rows and 256 MiB. Export and deletion write typed audit rows with no free
  text. K8.0 registers the missing `export-flow-run-audit` handler.
- **CD21. Core gets a first-class Data window and a record-output editor**
  (`k12-data-view`). The Data window is a thirteenth canonical Automation
  Studio view, id `project-datasets`, labelled "Data", project-scoped, opened
  from a toolbar button or Add Tab: tables per Flow, their runs, a paged
  preview, CSV/JSON export, delete, "Open run" into Runtime Debug, and an empty
  slot for K11's encryption status. Domains cannot contribute views, so it is
  domain-neutral Core UI. It needs `flow_id` and a `run_dataset_catalog` table
  in K2's migration, store methods in K2, collaborator methods in K4b, and
  `list-project-datasets` and `list-dataset-runs` in K8. The `recordOutput`
  parameter gets a `record-output` control (K3) and a dedicated editor (K12d):
  table settings and a fields table with names, ids, value types, required,
  key, ordering, and an Include / Exclude column / Encrypt column control
  carrying downstream D12's info hover, with Encrypt disabled until K11. K12d
  lands before K7 or downstream X4 write real record outputs, because today's
  generic json editor corrupts them on the first edit.

## Design

### Contracts (owned here)

In `@fluxiq/contracts/automation-studio`, new `packages/contracts/src/record-sets/`:
- `AutomationStudioRecordSchema`: `schemaVersion`,
  `fields[{ id, label, valueType: string|number|boolean|url|datetime|json,
  required?, handling?: include|exclude|encrypt }]`, `primaryKey?`. A field
  with `handling: exclude` is absent from node outputs, stored rows, the stored
  schema, previews, and exports; the domain does not read it, and Core drops it
  anyway if a payload carries it (downstream D12). `encrypt` is refused by K1
  and accepted only once K11's record keys are wired; an `encrypt` field cannot
  be `primaryKey`.
- `AutomationStudioRecordOutput`: `{ datasetId, label?, recordsPath, schema,
  writeMode: append|replace, maxRecords? }`, with `recordsPath` required (CD19).
- `AutomationStudioRunDatasetSummary`: `{ runId, datasetId, label?, nodeIds,
  schemaDigest, recordCount, truncated, invalidCount, updatedAt,
  encryptedFieldIds? }`.
- `AutomationStudioRunDatasetPage`: `{ summary, schema, rows, nextCursor }`.
- Pure `parseAutomationStudioRecordSchema` and
  `parseAutomationStudioRecordOutput` (stable issue codes such as
  `record_schema.encrypt_unavailable`); `storedAutomationStudioRecordSchema`,
  which drops `exclude` fields and is what gets stored and hashed;
  `validateAutomationStudioRecords` (allowlist copy, CD20 caps); CSV header and
  row encoders (RFC 4180, with formula-injection escaping of string, url, and
  json cells, and of datetime cells too, since `Date.parse` accepts
  `@SUM(1) 2020`). Execution detail: `reports/k-datasets-execution.md` §4 K1.
  K1 also exports `parseAutomationStudioRecordsPath` for K4 and K7, and K3 maps
  `record_schema.encrypt_unavailable` to `record_output.encrypt_unavailable`.
- K11 adds `encrypted-cell.ts`, `record-encryption-status.ts`, and
  `reveal-cells.ts`.

### Runtime capture and persistence

- `builtin.policy.action` gains a non-bindable `recordOutput` parameter and a
  `records` data port; `execute` parses it and fails before dispatch when it is
  invalid (CD13).
- `AS/runtime/executor/record-capture.ts`, `record-summary.ts`, and
  `run-state.ts`: capture in node execution, the marker summary (CD14), and
  run-scoped state. `onRecordBatch` on `AutomationStudioGraphExecutionOptions`
  persists each batch before the attempt returns; a throwing hook fails the
  attempt with `record_output.persist_failed`.
- `withheldResultPayload` on the framework runtime's dispatch context (CD15).
- Migration `0019_run_datasets` (`AS/storage/project/schema/run-datasets.ts`):
  `run_datasets`, `run_dataset_rows`, and `run_dataset_audit_events`, with a
  foreign-key guard to `runtime_runs`.
- Store `AS/storage/project/run-dataset-store.ts`: a transactional
  `appendBatch` that rejects a changed schema digest or a key outside the
  stored schema, paging, row reads for streaming, audit, and
  `deleteRunDatasets`. If retries reuse a `runId`, a batch with the same
  `attempt_id` replaces the earlier one.
- Collaborator `AS/runtime/service/datasets/`, reached through a `readonly
  runDatasets` field so the frozen service gains no members; a pure move of the
  recording candidate helpers out of `service.ts` first frees the lines the
  wiring adds.
- `AutomationStudioFlowRunDetail.datasets?`, joined in the stream store, and an
  attempt `recordCount` read from the marker.

### Iteration and output references

- `builtin.control.for-each`: input `items`; branches `body` and `done`; data
  outputs `item`, `index`, and `count`; `maxIterations` (default 100, at most
  10,000) and `maxStepsPerIteration` (default 50); loop state kept in the run
  state through a node `iteration` context (CD18).
- Runtime variables become run-scoped, so `append-list` accumulates; a Call
  Flow child's variables stay isolated from its parent's.
- `builtin.data.write-records` emits `records.write`, which capture persists
  without a dispatcher.
- A longest-own-key-prefix path lookup in `parameter-bindings.ts`; no `$output`
  binding.

### Recording proposal, API, and UI

- `recordOutput` on `AutomationStudioRecordingMapperCandidate` and
  `RecordingFlowActionCandidate`, lifted with CD19's `recordsPath` resolution
  and written to `parameterValues` and node-destination definitions.
- Endpoints in `AS/api/handlers/datasets.ts`: `list-run-datasets`,
  `get-run-dataset-page`, and `export-run-dataset` (`programs.read`), and
  `delete-run-datasets` (`flows.write`), each checking the project's domain
  first. K8.0 registers the missing `export-flow-run-audit` handler.
- A streaming GET route,
  `WEB/app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/route.ts`:
  session cookie (401), `programs.read` (403), id and format validation (400),
  domain check (404), `Cache-Control: private, no-store`, `nosniff`, a sanitized
  attachment name, and an audit row on completion, truncation, or failure.
- `WEB/features/automation-studio/datasets/`, added to the web architecture
  contract's directory list: `RunDatasetsPanel` mounted beside Export Audit;
  `RunDatasetTable` on `DataTable` with columns from the stored schema, "Load
  more" paging, and URLs rendered as text; inline export, or a stream link when
  `tooLarge`; and a delete action. K9 adds the `datasets` style domain.
- K12 (CD21): the `project-datasets` view in `WEB/features/automation-studio/datasets/`
  with its own connector file (the canonical connector file is frozen), and
  `WEB/features/automation-studio/parameters/record-output/`. K12c imports K9's
  panel through the `datasets` barrel. Execution detail:
  `reports/k12-data-view.md` sections 4-8.

### Dataset execution (K1-K10)

Execution detail is `reports/k-datasets-execution.md` §4 (files, exports,
tests, acceptance commands, and mutation targets per phase), with file
ownership in its §5 table, amended by CD16-CD17 (`delete-run-datasets` joins K8
and K9). Order:
1. In parallel: K1, K4d, K4c.0 (candidate-helper move), K8.0 (Export Audit
   handler).
2. After K1: K2, K3, and K4a; K7 also waits for K4c.0.
3. After K2 and K4a: K4b and K5.
4. After K4c.0 and K4b: K4c.1-2 (service wiring). After K4a: K6, serial on the
   executor files.
5. After K4b and K4c: K8; after K8: K9; then K10 (docs, versions, baseline
   ratchet, gates).
6. K12d after K1 and K3, before K7 and downstream X4; K12c after K8 and K9.
   K2, K3, K4b, and K8 absorb K12's server share (CD21) in their briefs.

Serial files: `AS/runtime/service.ts` (K4c.0, then K4c.1-2);
`recordings/candidate-definitions.ts` (K4c.0, then K7); the executor files
(K4a, then K6); `.structure-baseline.json` only through `pnpm structure:baseline`;
the generated reference only in K10.

### Credential and key hardening (K0)

Execution detail is `reports/k0-secret-keys-kdf.md` sections 4-7 (design,
files, tests, mutation targets), amended by CD5. Worker partition:
1. **K0.1 Shared KDF, first and alone:** `FX/programs/_shared/password-kdf/`
   (`scrypt-parameters.ts`, `derive-scrypt-key.ts`,
   `scrypt-derivation-limiter.ts`, password hash and verify, barrel) and its
   `tests/`; placement confirmed against `code-structure.md` before writing.
2. **K0.2 Secret Keys, after K0.1:** owns `FX/programs/secret-keys/types.ts`,
   `runtime/service.ts`, `api/handlers.ts` and their tests,
   `FX/programs/tests/global-secret-keys.test.ts`, and
   `FX/programs/_shared/tests/runtime-llm-grants.test.ts`. Single-flight
   `load`; v1/v2 envelopes; async seal and open; re-seal with held-key swap and
   a per-record write chain; `sealedByUserId`; `lastRotatedAtMs` comparison;
   verified `createRevealAuthorization`; the password-change re-seal
   subscriber.
3. **K0.3 Identity Access, parallel with K0.2:** owns
   `FX/programs/identity-access/runtime/service.ts` (747 lines, about 37
   methods, so its crypto at 631-707 moves to a new module first), the new
   credential-seal module and credential-change port under `runtime/`, a new
   `runtime/tests/service.test.ts`, and
   `FX/programs/tests/global-identity-access.test.ts`. Single-flight `load`;
   async gates; v2 envelope and PHC hashes; one derivation per operation;
   re-seal and rehash; PIN rehash; zeroed keys; `pinVerifierHash` removed;
   hashed session ids; the dummy derivation.
4. **K0.4 Database Manager, parallel:** owns
   `FX/programs/database-manager/api/handlers.ts` and its tests: the credential
   recheck on sensitive `put-record` and `delete-record`.
5. **K0.5 Wiring, docs, and version, serial after K0.2-K0.4:**
   `FX/programs/_shared/runtime.ts` subscribes Secret Keys to the port
   (subscribers register in the Identity Access constructor, so construction
   order changes); `upsertUser` refuses to change an existing account's
   credentials (CD5); the login limiter's per-address bound (`WEB/app/api/auth/login/route.ts:8-52`);
   `docs/operations/data-and-state.md`, `docs/programs/global-programs.md`,
   `persistence.md`, `package-boundaries.md` (0.5.0 and Migration Notes);
   regenerated framework reference; `packages/fluxiq/package.json`.
6. **K0.6 Validation:** targeted `npx vitest run <files> --no-file-parallelism`,
   `pnpm check`, `pnpm test`, `pnpm build`, one at a time; a mutation proof per
   guard (report section 7); one manual web login against an isolated fixture
   root seeded with v1 records, never the user's `.fluxiq`.

### Encrypted record fields (K11)

Execution detail is `reports/k11-encrypted-fields.md` (records, lifecycle,
capture, contracts, files, ordered steps, tests, mutation targets), amended by
CD10, CD11, and CD13, and consuming K0's KDF module and credential-change port.
Ordered steps:
0. Revision-checked put in `SQLiteRepository` (CD11), with tests.
1. Contracts: encrypted cell, encryption status, reveal request and response;
   K1's refusal of `encrypt` lifted only when record keys are wired.
2. `FX/programs/record-keys/crypto/`: sealed box, padding, cell codec,
   account-key seal over K0's module.
3. `record-keys/storage/` and account keys: creation at first login (not while
   the default password is in force; never failing login), password change
   through the port (prepare, write, commit), administrator reset orphaning
   wraps, login and logout calls.
4. Project record keys (create, grant, remove, rotate, audit), API handlers,
   catalog, and runtime wiring without Database Manager registration.
5. Confirm that K4d's `withheldResultPayload` covers every encrypt dispatch, so
   no `protectedResultPaths` is needed (CD10).
6. Capture: preflight, sealing in K4a's `record-capture.ts` before outputs are
   built, schema rules, dataset summary fields.
7. Reveal, export `encryptedFields: omit|clear` (default `omit`), and the
   streaming route taking credentials in a POST body.
8. Decryption grants and their `run-runtime-session` binding.
9. Web: masked cell with Reveal, export option, and a project "Encrypted
   columns" panel (key status, holders, rotate, audit).
10. Docs: `persistence.md` record-key custody, `automation-studio.md` runs and
    grants, native nodes, `package-boundaries.md`, regenerated reference.
11. Gates, one at a time, including the canary test
    `FX/programs/tests/global-record-keys-canary.test.ts`.

### Compatibility

- `@fluxiq/contracts` 0.2.0 → 0.2.1: record-set contracts, K11's cell, status,
  and reveal contracts, and the summary field are additive.
- `fluxiq` 0.4.0 → 0.5.0 with a Migration Notes entry above
  `package-boundaries.md:104`: K0's upgraded records (CD6) and hashed session
  ids, which sign existing sessions out; run-scoped variables; longest-prefix
  state paths; policy actions gaining `records`; saved-trace dataset markers;
  withheld attempt payloads for `recordOutput` dispatches; the `for-each` step
  allowance and ceiling; migration 0019; the dataset endpoints and route; the
  registered `export-flow-run-audit`; `handling: encrypt` running; login
  creating account keys; a password change refused when a re-seal cannot be
  prepared; and a new global program.
- Restoring `projects/{id}` without the `record.keys` store leaves sealed cells
  permanently unreadable; the documentation says so.

## Phases

| Core phase | Work | Downstream phase |
| --- | --- | --- |
| K0 | Credential and key hardening: shared scrypt module at N=2^17 with recorded parameters and self-upgrading records, plus the Secret Keys, PIN, session-id, reveal-authorization, login-timing, and Database Manager fixes (CD2-CD6) | beside X0 |
| K1 | Record-set contracts, schema validation, CSV encoder | X1 |
| K2 | Schema migration and `run-dataset-store` | X2 |
| K3 | `recordOutput` parameter, `records` port, `io-policy` capture | X2 |
| K4 | K4a executor capture, markers, and hook; K4b datasets collaborator; K4c.0 candidate-helper move, then K4c.1-2 service wiring; K4d withheld attempt payloads | X2 |
| K5 | Run detail `datasets` | X2 |
| K6 | Run-scoped variables, `for-each`, `write-records`, output references | X2 |
| K7 | Mapper candidate `recordOutput` and `timeoutMs` lift and approval write (CD19) | X4 |
| K8 | K8.0 `export-flow-run-audit` handler; dataset endpoints including delete, handler, streaming export route | X2 |
| K9 | Web datasets panel and export | X2 |
| K10 | Docs (`persistence.md`, native nodes, versions, Migration Notes) and gates | X2, X4 |
| K11 | Encrypted record fields (CD7-CD12): revision-checked put, record keys, sealing at capture, Reveal, export, decryption grants, UI | Phase 3.7 (Week 3) |
| K12 | K12d record-output field editor (after K1 and K3, before K7 and downstream X4); K12c project Data window (after K8 and K9); design in `reports/k12-data-view.md` (CD21) | K12d before X4 |

## Validation

- One-to-one tests per `code-structure.md`, as listed in each phase's execution
  detail; every guard gets a mutation proof, rerun by the supervisor before its
  ledger entry.
- `npx vitest run <files> --no-file-parallelism`, then `pnpm check`,
  `pnpm docs:check`, `pnpm build`, `pnpm package:validate`, one at a time (the
  parallel suite is unsound on this machine).
- K0: a manual login against an isolated fixture root seeded with v1 records.
- K11: the canary test finds no clear encrypted value in any file a run wrote.
- Downstream Lab proof through X4 and X5.

## Worker Briefs

The first Core brief, `ex-b-core`, is recorded in the downstream document's
Worker Briefs section. Completed briefs (`k0-secret-keys-kdf`, `k11-encrypted-fields`,
`k-datasets-execution`, `k0-1-password-kdf`, `k0-4-database-manager-recheck`,
`k1-record-set-contracts`, `k12-data-view`, `k4d-withheld-result-payload`,
`k8-0-export-audit-handler`, `k4c0-candidate-helpers-move`, `k0-3-identity-access`,
and `k3-policy-action-record-output`) are in the
[planning archive](./first-class-data-extraction-plan/archive/2026-09-15-planning-briefs-and-ledger.md).
Briefs below were recorded at dispatch on 2026-09-15.

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

## Work Ledger

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

Earlier planning entries are in the
[planning archive](./first-class-data-extraction-plan/archive/2026-09-15-planning-briefs-and-ledger.md).

## Open Questions

1. **Dataset-row withholding.** Decided 2026-09-15 as CD14-CD17 from
   `k-datasets-execution`.
2. **Output references and withholding.** Decided as CD18: no `$output`
   binding and no exemption.
3. **Side-effect class.** Decided as CD19: unchanged, because nothing reads it
   for policy actions.
4. **Default `recordsPath`.** Decided as CD19: required on the stored output and
   defaulted from the domain output's `metadata.recordsPath` at proposal lift.
5. **Encrypt column key custody.** Decided 2026-09-15 as CD7-CD12 from
   `k11-encrypted-fields`, which replaced the session unlock at login with a
   password check at each decryption and added an account key level.
6. **Secret Keys' password derivation cost.** Decided 2026-09-15 as CD2-CD6
   from `k0-secret-keys-kdf`; the user ruled the old cost unacceptable.
