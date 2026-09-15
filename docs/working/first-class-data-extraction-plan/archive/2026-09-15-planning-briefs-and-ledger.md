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
