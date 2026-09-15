# First-Class Data Extraction Plan (Core share)

Status: Active
Status detail: Design firming 2026-09-15; K0 (credential and key hardening) and K11 (encrypted record fields) are decided from their investigations, and K1-K10 execution detail is pending k-datasets-execution.
Created: 2026-09-15
Last updated: 2026-09-15
Owner: Senior supervisor agent
Scope: Core's share of making structured data extraction a fundamental FluxIQ capability: domain-neutral dataset contracts (records with a schema), per-run persistence, table preview, CSV/JSON export, iteration over records by later nodes, the web-panel UI for them, the recording-proposal seam through which a domain proposes extract nodes, encrypted record fields, and the credential and key hardening they depend on.
Paired document: `F:\!FluxIQWebExtension\docs\working\first-class-data-extraction-plan.md`
Related: [package boundaries](../architecture/package-boundaries.md), [code structure](../architecture/code-structure.md), [persistence](../architecture/automation-studio/persistence.md), [native nodes](../architecture/automation-studio-native-nodes.md), [ex-b-core report](./first-class-data-extraction-plan/reports/ex-b-core.md), [k0 report](./first-class-data-extraction-plan/reports/k0-secret-keys-kdf.md), [k11 report](./first-class-data-extraction-plan/reports/k11-encrypted-fields.md)

---

## Current State

**Phase, as of 2026-09-15: design firming; no Core code changed.** The
downstream user decided that structured data extraction is a fundamental FluxIQ
capability, Core included, then ruled Secret Keys' password-derivation cost
unacceptable and added an Encrypt column. The downstream document owns the
overall plan, phases X0-X6, and sequencing; this document owns the
domain-neutral dataset contracts, Core's phases K0-K11, and decisions CD1-CD12.
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

**Done:** investigations `ex-b-core`, `k0-secret-keys-kdf`, and
`k11-encrypted-fields`; decisions CD1-CD12; K0 and K11 designs.

**Not done:** phases K0-K11; `k-datasets-execution` (K1-K10 detail and open
questions 1-4) is still running.

**Next steps:**
1. Merge `k-datasets-execution` into K1-K10 and settle open questions 1-4.
2. Start K0 (steps K0.1-K0.6) and K1 beside downstream X0 and X1.
3. K11 follows K0, K1, K3, K4, K6, K8, and K9, built with downstream Phase 3.7.

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
  `$scrypt$ln=17,r=8,p=1$<salt>$<hash>`. Readers accept v1 and v2. After a
  successful unlock, login, reveal, or PIN check, an older record is re-sealed
  with no user step: once per record, compare-and-swap in memory, held keys
  swapped and their old buffers zeroed, `updatedAtMs` and `lastRotatedAtMs`
  unchanged. A failed attempt changes nothing.
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
    `secret.keys` require the credential recheck.
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
  (`records.encryption_key_unavailable`); `io-policy` seals before building
  outputs; dispatch passes `protectedResultPaths`, so saved command attempts
  carry `[encrypted]`; a seal error fails the whole batch; downgrading a field
  from `encrypt` requires the credential gate and is audited. An end-to-end
  canary test scans every file a run wrote.
- **CD11. `SQLiteRepository` gains a revision-checked put** as K11's first
  step, so key grants and rotation are never lost to last-write-wins. K0's
  re-seal is idempotent and heals under blind writes, so it does not wait.
- **CD12. Sealing in the extension is not chosen:** it needs extension crypto
  and a gateway contract change, and downstream D13 does not claim to protect a
  live process.

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
  writeMode: append|replace, maxRecords? }`.
- `AutomationStudioRunDatasetSummary`: `{ runId, datasetId, nodeIds,
  schemaDigest, recordCount, truncated, invalidCount, encryptedFieldIds? }`.
- `AutomationStudioRunDatasetPage`: `{ summary, schema, rows, nextCursor }`.
- Pure `parseAutomationStudioRecordSchema`, `validateAutomationStudioRecords`,
  and `encodeAutomationStudioRecordsCsv` with formula-injection escaping.
- K11 adds `encrypted-cell.ts`, `record-encryption-status.ts`, and
  `reveal-cells.ts`.

### Runtime capture and persistence

- `builtin.policy.action` gains an optional `recordOutput` parameter and a
  declared `records` data port; `io-policy.ts` reads `result.payload` at
  `recordsPath`, validates rows, drops `exclude` fields, and emits
  `outputs.records`.
- An executor hook `onRecordBatch` on `AutomationStudioGraphExecutionOptions`
  persists each batch from the executed result, before trace withholding; the
  saved trace keeps `{ datasetId, recordCount, schemaDigest }` only.
- Migration `AS/storage/project/schema/run-datasets.ts`: `run_datasets` and
  `run_dataset_rows`, with bodies over 256 KiB as run-owned content objects and a
  `runtime/runs/{runId}/datasets/` JSONL fallback without a project database.
- Store `AS/storage/project/run-dataset-store.ts`; collaborator
  `AS/runtime/service/datasets/` (the baselined `service.ts` does not grow).
- `AutomationStudioFlowRunDetail.datasets?` and attempt `recordCount`.

### Iteration and output references

- `builtin.control.for-each`: input `items`, branches `body` and `done`,
  outputs `item`, `index`, `count`, enforced `maxIterations`, per-run loop state.
- Runtime variables become run-scoped, so `append-list` accumulates.
- `builtin.data.write-records` for loop bodies, through a record-sink dispatcher.
- Output references: a `$output: { nodeId, portId, path }` binding, or a
  longest-own-key path lookup in `parameter-bindings.ts`.

### Recording proposal, API, and UI

- `recordOutput` on `AutomationStudioRecordingMapperCandidate` and
  `RecordingFlowActionCandidate`, lifted like `expectedState` and written to
  `parameterValues` and node-destination definitions.
- Endpoints `list-run-datasets`, `get-run-dataset-page` (cursor, limit 1-500),
  `export-run-dataset` (JSON or CSV under a byte cap) in
  `AS/api/handlers/datasets.ts`; a streaming route
  `WEB/app/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/route.ts`
  authenticated like state-assets.
- `WEB/features/automation-studio/datasets/`: `RunDatasetsPanel`,
  `RunDatasetTable` on `DataTable` with cursor paging and schema-driven columns,
  CSV/JSON export beside Runtime Debug's Export Audit.

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
   `FX/programs/_shared/runtime.ts` subscribes Secret Keys to the port; the
   login limiter's per-address bound (`WEB/app/api/auth/login/route.ts:8-52`);
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
CD11 and consuming K0's KDF module and credential-change port. Ordered steps:
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
5. `protectedResultPaths` redaction of saved command attempts in
   `FX/runtime/service.ts`.
6. Capture: preflight, sealing in `io-policy` on both dispatch paths, schema
   rules, dataset summary fields.
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
- `fluxiq` 0.4.0 → 0.5.0 with Migration Notes: K0's upgraded records (CD6),
  run-scoped variables, output references through dotted ids, policy actions
  gaining `records`, `handling: encrypt` running, login creating account keys,
  a password change refused when a re-seal cannot be prepared, and a new global
  program.
- Restoring `projects/{id}` without the `record.keys` store leaves sealed cells
  permanently unreadable; the documentation says so.

## Phases

| Core phase | Work | Downstream phase |
| --- | --- | --- |
| K0 | Credential and key hardening: shared scrypt module at N=2^17 with recorded parameters and self-upgrading records, plus the Secret Keys, PIN, session-id, reveal-authorization, login-timing, and Database Manager fixes (CD2-CD6) | beside X0 |
| K1 | Record-set contracts, schema validation, CSV encoder | X1 |
| K2 | Schema migration and `run-dataset-store` | X2 |
| K3 | `recordOutput` parameter, `records` port, `io-policy` capture | X2 |
| K4 | `onRecordBatch` hook and datasets collaborator | X2 |
| K5 | Run detail `datasets` | X2 |
| K6 | Run-scoped variables, `for-each`, `write-records`, output references | X2 |
| K7 | Mapper candidate `recordOutput` lift and approval write | X4 |
| K8 | Dataset endpoints, handler, streaming export route | X2 |
| K9 | Web datasets panel and export | X2 |
| K10 | Docs (`persistence.md`, native nodes, versions, Migration Notes) and gates | X2, X4 |
| K11 | Encrypted record fields (CD7-CD12): revision-checked put, record keys, sealing at capture, Reveal, export, decryption grants, UI | Phase 3.7 (Week 3) |

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
Worker Briefs section. Briefs below were recorded at dispatch on 2026-09-15.

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

## Work Ledger

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

## Open Questions

1. **Dataset-row withholding.** Store rows raw but protected and retention-bound,
   strip run-withheld text before storage, or a new explicit policy. Every
   extracted payload is also saved in clear in runtime command attempts
   (`FX/runtime/storage.ts:51-57`), which this question must cover. Owner:
   senior supervisor agent; recommendation, raw rows protected and
   retention-bound, never copied into the saved trace, with `exclude` columns
   dropped at capture (downstream D12).
2. **Output references and withholding.** Whether `$output` references to
   already-persisted rows are exempt from trace withholding. Owner: senior
   supervisor agent; recommendation, resolve from the dataset store and record
   only a summary in the trace.
3. **Side-effect class.** Every policy action is `external`; read-only extraction
   could derive `read` from the domain output's declared `safe` level. Owner:
   senior supervisor agent; recommendation, derive it, additively.
4. **Default `recordsPath`.** Node parameter only, or also from domain output
   metadata. Owner: senior supervisor agent; recommendation, the domain output
   declares a default (`extracted`) and the node parameter overrides it.
5. **Encrypt column key custody.** Decided 2026-09-15 as CD7-CD12 from
   `k11-encrypted-fields`, which replaced the session unlock at login with a
   password check at each decryption and added an account key level.
6. **Secret Keys' password derivation cost.** Decided 2026-09-15 as CD2-CD6
   from `k0-secret-keys-kdf`; the user ruled the old cost unacceptable.
