# First-Class Data Extraction Plan (Core share)

Status: Active
Status detail: Core design recorded 2026-09-15 from ex-b-core; Core phases K1-K10 start with the downstream plan's X1 at the start of Week 2.
Created: 2026-09-15
Last updated: 2026-09-15
Owner: Senior supervisor agent
Scope: Core's share of making structured data extraction a fundamental FluxIQ capability: domain-neutral dataset contracts (records with a schema), per-run persistence, table preview, CSV/JSON export, iteration over records by later nodes, the web-panel UI for them, and the recording-proposal seam through which a domain proposes extract nodes.
Paired document: `F:\!FluxIQWebExtension\docs\working\first-class-data-extraction-plan.md`
Related: [package boundaries](../architecture/package-boundaries.md), [code structure](../architecture/code-structure.md), [persistence](../architecture/automation-studio/persistence.md), [native nodes](../architecture/automation-studio-native-nodes.md), [ex-b-core report](./first-class-data-extraction-plan/reports/ex-b-core.md)

---

## Current State

**Phase, as of 2026-09-15: design recorded; no Core code changed.** The
downstream user decided that structured data extraction is a fundamental FluxIQ
capability, Core included. The downstream document owns the plan, phases X0-X6,
and sequencing; this document owns the domain-neutral dataset contracts and
Core's phases K1-K10. Path prefixes: `AS/` is
`packages/fluxiq/src/programs/automation-studio/`, `WEB/` is `apps/web/src/`.

**What is true in Core today** (read-only `ex-b-core`, file:line in its report):
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
  (`AS/runtime/service/recordings/proposal-candidates.ts:90-133`), keeping target
  resolution, transition comparison, recovery, and adaptation.
- The program API returns JSON only; domains cannot contribute web views or
  commands; Runtime Debug has an Export Audit precedent and a generic
  `DataTable`.

**Done:** the Core investigation `ex-b-core` and the design below.

**Not done:** phases K0-K11.

**Next steps:** firm up Core's share for execution from three read-only
investigations (`k0-secret-keys-kdf`, `k11-encrypted-fields`,
`k-datasets-execution`); then K0 and K1 start beside downstream X0 and X1.

**Blockers:** none.

---

## Design

### Principle

Extraction stays an ordinary `builtin.policy.action` dispatching a domain output.
Core adds a generic record-output declaration, per-run dataset persistence,
iteration, and UI. A new node type would lose the policy-action paths for
target resolution, expected transitions, and adaptation.

### Contracts (owned here)

In `@fluxiq/contracts/automation-studio`, new `packages/contracts/src/record-sets/`:
- `AutomationStudioRecordSchema`: `schemaVersion`,
  `fields[{ id, label, valueType: string|number|boolean|url|datetime|json,
  required?, handling?: include|exclude|encrypt }]`, `primaryKey?`. A field
  with `handling: exclude` is absent from node outputs, stored rows, the stored
  schema, previews, and exports; the domain does not read it, and Core drops it
  anyway if a payload carries it (downstream D12). `encrypt` is reserved in K1
  and refused until built (downstream D13, open question 5).
- `AutomationStudioRecordOutput`: `{ datasetId, label?, recordsPath, schema,
  writeMode: append|replace, maxRecords? }`.
- `AutomationStudioRunDatasetSummary`: `{ runId, datasetId, nodeIds,
  schemaDigest, recordCount, truncated, invalidCount }`.
- `AutomationStudioRunDatasetPage`: `{ summary, schema, rows, nextCursor }`.
- Pure `parseAutomationStudioRecordSchema`, `validateAutomationStudioRecords`,
  and `encodeAutomationStudioRecordsCsv` with formula-injection escaping.

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

### Compatibility

Additive and patch-level: the contracts (`@fluxiq/contracts` 0.2.1),
`recordOutput`, the `records` port, `datasets?`, new endpoints, new nodes, and the
candidate field. Observable behaviour changes (run-scoped variables, output
references through dotted ids, any withholding change, policy actions gaining
`records`) require `fluxiq` 0.5.0 with a Migration Notes entry.

## Phases

| Core phase | Work | Downstream phase |
| --- | --- | --- |
| K0 | Secret Keys and every other password-derived key: versioned seal recording scrypt parameters at N=2^17 or stronger; older records re-sealed at their next successful unlock | beside X0 |
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
| K11 | Encrypted record fields: project key pair, per-account wrapped private key, dataset data keys, Reveal and export authorization | Phase 3.7 (Week 3) |

## Validation

- One-to-one tests per `code-structure.md`: record-set contract tests;
  `io-policy`, `graph-run`, `node-execution`, and `trace-withholding` tests
  (the saved trace carries a summary only); `proposal-candidates`,
  `run-dataset-store`, `schema`, `datasets` handler, service, route, and web
  datasets tests.
- `npx vitest run <files> --no-file-parallelism`, then `pnpm check`,
  `pnpm docs:check`, `pnpm build`, `pnpm package:validate`, one at a time.
- A mutation proof for each guard; downstream Lab proof through X4 and X5.

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
   strip run-withheld text before storage, or a new explicit policy. Owner:
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
5. **Encrypt column key custody (downstream D13).** Where the key pair for
   `handling: encrypt` fields lives. Secret Keys' encryption is purpose-specific
   and not reused as project-content crypto, and
   `AutomationStudioProjectContentProtection` leaves key custody to the host
   (`automation-studio/persistence.md:180-198`). Owner: senior supervisor agent;
   recommendation, a per-project key pair whose private key is sealed with the
   account password in Secret Keys' pattern (scrypt-derived key, AES-256-GCM,
   session unlock at login) and stored outside project content; runs seal
   values with the public key and never need the password. Required: a fresh
   random key and IV per value; no stored hash or deterministic token of a
   value; a random salt and scrypt at N=2^17, r=8, p=1 or stronger, with the
   parameters recorded in the sealed key.
6. **Secret Keys' password derivation cost.** `deriveSecretKey` calls
   `scryptSync(password, salt, 32)` with Node's defaults (N=2^14, r=8, p=1;
   `packages/fluxiq/src/programs/secret-keys/runtime/service.ts:456-460`), below
   OWASP's scrypt minimum of N=2^17, and the sealed record stores
   `kdf: "scrypt"` without its parameters (`service.ts:471-479`). Owner: senior
   supervisor agent; recommendation, record the parameters in the sealed record,
   raise new seals to N=2^17 with `maxmem` sized to fit, and re-seal existing
   keys at their next successful unlock. Found while designing downstream D13;
   the user ruled the current cost unacceptable, so the fix is phase K0.
