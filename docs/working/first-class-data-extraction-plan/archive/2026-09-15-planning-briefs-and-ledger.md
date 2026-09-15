# First-Class Data Extraction Plan (Core share): planning archive

Superseded detail moved from [the plan](../../first-class-data-extraction-plan.md)
on 2026-09-15 to keep it under the 800-line compaction threshold: the three
completed investigation briefs and the planning-phase ledger entries. Their
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
