# t911 takeover, phase 1 (worker report)

Status: Active
Status detail: Phase 1 done: the goal, state and conflict forecast are recorded; package check passed on the tip. Phase 2 (merge dev, resolve, finish) waits for t929.
Created: 2026-11-17
Last updated: 2026-11-17
Owner: Senior supervisor agent (written by its worker-heavy worker for t911)
Scope: Taking over Codex's t911 runtime lease isolation in Core: what it set out to do, what is done and unfinished, the dev merge forecast, and the storage layout questions met on the way.
Paired document: none
Related: [FluxNode plan](./fluxnode-plan.md), [t911 brief](./fluxnode-plan/reports/codex-t911-lease-brief.md), [Codex's t911 report](./fluxnode-plan/reports/codex-t911-lease-isolation.md)

Worker: worker-heavy (Claude Opus 5.5), 2026-11-17. Worktree
`C:/Users/osrs_/FluxStuff/fxwork/t911/!FluxIQ`, branch
`task/t911-runtime-lease-isolation`, tip `842588df4`. No git command that
changes anything was run.

## Outcome

Phase 1 is done. Items 1 and 3 are done, and so are the lead's revised
questions (a) and (b). The lead withdrew item 2 (Core `setup()` must not
migrate implicitly); my `setup()` change was written and tested (18/18
passed), then reverted, and is saved as a patch. Its `storage-migration.ts`
part moves to the separate `storage-migration` task. After the restart,
`pnpm --filter fluxiq check` passed on the branch tip. The structure audit
failed only on this report (see the results below). The working tree is the
branch tip plus this report.

## 1. What t911 set out to do

Source: `docs/working/fluxnode-plan/reports/codex-t911-lease-brief.md` (the
lead's brief and review notes), `.../codex-t911-lease-isolation.md` (Codex's
report), `docs/working/fluxnode-plan.md` line 16, and the branch diff.

**Goal:** fix ambient cross-instance and cross-domain host-lease authority.
Before t911, `AutomationStudioHostLeaseScope` was process-wide and static: a
lease that runtime A held (its frame, or a strict session-less grant) was read
through `AutomationStudioHostLeaseScope.current()` / `.gatewaySource` by every
runtime in the process. Codex reproduced two real leaks with two
model-disabled `createGlobalProgramRuntime()` instances paired to the same
trusted domain: B's independent command was refused because A held a strict
lease, and B's command was sent stamped with A's lease.

**Design (approved by the lead, 2026-11-12):**

- `runtime/project-agents/host-resources/authority.ts`:
  `AutomationStudioHostLeaseAuthority.for(instance)` gives one authority per
  real Automation Studio instance (an opaque capability in a `WeakMap`, never
  on the wire). `forDomain(domainId)` returns an immutable `binding.ts` view
  with `current()`, `isCurrent()` and `requiresLease()`. Each physical port
  keeps its one shared capacity scheduler.
- Gateway: a new discriminated `ClientGatewayHostLeaseTargetSource`
  (`kind: "owner-domain.v1"`; `host-lease/target-source.ts`, `adapter.ts`)
  sits beside the unchanged legacy source. The target's domain comes from the
  ready session's server-bound trusted-client record, never from hello
  metadata (`client-gateway/service.ts`, `hostLeaseTarget`).
- Truthful pre-send refusal: a command refused for lease reasons after its
  durable ledger claim but before the socket send is settled as a terminal
  `refused_unsent` record. That uses a new SQL table (schema migration
  `0038_gateway_command_unsent_refusals_v1`), a private branded
  `unsent-refusal.ts` proof, and `refuseUnsent` on the store and on the
  command-run wrapper. It is never written as `send_uncertain` and never gets
  a fabricated receipt. `transport.ts` checks admission again after trace and
  timer preparation, right before the socket send.
  `runtime/client-gateway-transport.ts` maps `refused_unsent` to the existing
  failed/retryable/unacted result before its generic Stop.
- Consumers move from the static reader to an explicit binding:
  runtime-session admission and page-held, the project-parts driving gate,
  project-build and its subflow trials, candidate-trial start, trial ports,
  the FluxNode host pool, `server/cli/run-dev.ts` and
  `programs/_shared/runtime.ts`.

## 2. State of the branch

- Commits `553ad0342` to `b0b5c8c13` hold documents only (the brief,
  decisions and acceptance requirements).
- `842588df4` is Codex's uncommitted work, committed unchanged by the lead
  and marked "Not validated" (76 files across the branch, +1986/-262).
- Last recorded validation (from Codex's report, not re-run here):
  - The authority foundation passed 14/14; the lead re-ran it in 1.29 s.
  - A first integrated narrow run: 67 passed, 2 failed, over 8 files. Both
    original leak regressions were green. The two failures were in tests (an
    old no-socket assertion, and an immediate-close test that was not
    synchronised); both tests were edited, and the rerun was never recorded.
  - A first `pnpm --filter fluxiq check` failed with six null-narrowing
    errors. Codex reports a fix but never re-ran the check.
  - A four-file real-SQL job (terminal refusal, reopen, corruption,
    owned-command-run retry, executor retry, trace/timer admission) was
    "queued/running" when Codex stopped. Its result is unknown.

**Done (the code exists):** the authority, binding and lease-scope bindings;
the target source and adapter; stamping; durable dispatch; the ledger
controller and contracts; the unsent-refusal proof and settlement; the store
table and its migration; command-run withdrawal; final admission in the
transport; the runtime mapper; the consumer migrations; the host pool; and
their adjacent tests.

**Unfinished or unverified:**

1. No green run of all the adjacent tests after Codex's last edits.
2. The package check was not re-run after the null-narrowing fix, and the
   structure audit has never run on this branch.
3. `client-gateway/service/commands.ts`: Codex's report says the rejection
   path for a refusal-persistence failure "is still being reviewed", so that
   diagnostic history does not suggest a socket send happened.
4. Downstream (t912, extension):
   `domain/src/runtime/web-sessions/leased-web-session.ts` and its callers
   still read the static `current()` / `gatewaySource`, and the downstream
   dispatcher sends every non-completed result through `Stop`. Both must
   learn the binding and `refused_unsent`. Not started.
5. Real-runtime acceptance (the lead's final independent check).

## 3. Storage layout: the lead's questions (a) and (b), and the withdrawn fix

**(a) t911 does not change the `.fluxiq` storage layout or the layout
migration.**
- It touches none of `framework/index.ts`, `storage-layout.ts`,
  `storage-migration.ts` or `uncommitted-v2-adoption.ts`.
- Its only storage change is a SQL schema migration inside the Automation
  Studio project database:
  `persistence/automation/project/command-ledger/unsent-migration.ts`
  (`0038_gateway_command_unsent_refusals_v1`, a new table) is added to the
  store's migration runner (`command-ledger/store.ts`). It runs automatically
  and has nothing to do with v1 and v2. dev's highest schema migration id is
  `0037_dataset_snapshots`, so the ids do not collide.
- The error the user saw comes from the existing check at
  `framework/index.ts:360-361`, in place since `636857460` (2026-08-06) and
  unchanged on dev.

Why the user's root was v1: `scripts/run-fluxiq-web.mjs:20` sets
`FLUXIQ_ROOT` to the main checkout. Its `.fluxiq` holds only stray task logs
from 2026-11-02 (`runtime-*.log`, `runtime-refactor-sweep/`) and no
`config.json`. Core's own inspection, run read-only on both roots:

```
node --experimental-strip-types --no-warnings <scratch>/t911-inspect.mjs <t911>/packages/fluxiq/src/framework/storage-layout.ts "C:/Users/osrs_/FluxStuff/!FluxIQWebExtension/.fluxiq" web-automation
{"layout":"v1","migrationRequired":true,"legacyRoots":[]}
same command on C:/Users/osrs_/FluxStuff/fxwork/t915/!FluxIQWebExtension/.fluxiq
{"layout":"v2","migrationRequired":false,"legacyRoots":[]}
```

`inspectFluxIQStorage` (`storage-layout.ts:58-70`) classes any marker-less
root with content as v1, even one with no legacy roots. For a root like this,
the host-side `migrateStorage()` the lead added downstream archives nothing,
then writes `config.json`, `migration-history.json` and an empty
`legacy/v1-<ts>/`, which is harmless.

**(b) How Core hosts treat a v1 root. None of them migrates; every one stops
the person.**

| Host | Where | Behaviour on v1 or migration_incomplete |
| --- | --- | --- |
| `fluxiq dev` (headless engine) | `server/cli/run-dev.ts:44` opens the instance, `:59` calls `initializeFluxIQServerStorage` | `server/headless/initialize-storage.ts:11-14`: a fresh root gets `setup()`; anything else throws "FluxIQ web runtime requires storage layout v2; found v1. Use the protected framework storage migration before starting the panel." Stops. (`run-dev.ts` is t931's; not touched.) |
| Web panel (`apps/web`) | `instrumentation.ts:8-9` awaits `initializeFluxIQWebRuntime`; `lib/fluxiq.ts:203` calls `initializeFluxIQWebStorage` (a re-export of the same function, `lib/workspaces/initialize-storage.ts:3`) | Same refusal at server start. The panel's migrate action (`app/api/framework/setup/route.ts:33-38`, `{ "action": "migrate" }`, `operational-route-contract.ts:26`, "api-only", no UI) needs a signed-in user on a running panel. On a v1 root the panel never starts, so a person can never reach that action. |
| Tenant workspaces | `lib/workspaces/create-tenant.ts:39` | Same refusal per workspace. |
| Accounts CLI, offline mode | `platform/provisioning/cli/main.ts:40-46` | No check. It opens `FluxIQ.create()` and, because a v1 instance resolves v1 paths, uses `layoutVersion` 1 against `.fluxiq/databases`. It writes `platform/` on a v1 root without migrating, the only host that does neither. |
| e2e fixture seeders | `apps/web/e2e/support/seed-fixtures.mjs:78`, `seed-chat-threads.mjs:42` | Call `setup()` on a fixture root, so they would stop with the `index.ts:361` error on v1. Test only. |

**A defect in the migration itself, which the lead's host-side
`migrateStorage()` will meet. Seen on unchanged code:** a v1 root that has
Automation Studio data (`data/programs/automation-studio/...`) and also a
legacy runtime store under `.fluxiq/artifacts/runtime` makes the migration
archive the legacy roots first, then throw at cutover. The root is left as
`migration_incomplete`, with its data moved into `legacy/`. A v1 instance
always resolved `paths.artifacts` to `.fluxiq/artifacts`
(`framework/index.ts:200`), and `programs/_shared/runtime.ts` puts its
`FileRuntimeStore` at `artifacts/runtime`, so any v1 root that ever ran has
that directory. Probe output (temporary test, run through a slot, then
deleted):

```
T911PROBE {"outcome":"threw: Migration source and target both exist during cutover: ...\\.fluxiq\\artifacts","layout":"migration_incomplete","dataStillInPlace":false,"archived":["v1-1794972420990"]}
```

`rollbackStorageMigration()` can restore it. The same cause sits in
`storage-migration.ts:96-106`: the cutover renames a whole directory and
throws when its destination exists, and nothing checks for this before
archiving. A second, smaller race: `migrateFluxIQStorage` inspects the root
before it takes the lock (`:53-66`), so a second process can run a migration
over the result of one another process just finished. It overwrites
`migration-history.json` and creates an empty archive.

**The withdrawn fix, saved for reuse.** My patch fixes both defects as well as
the implicit migration in `setup()`. It holds the lock-held inspection, a
collision check before archiving, a cutover that moves children into an
existing directory, and waiting for a lock held by a live process on this
machine. It also has seven tests; with the existing migration and adoption
tests, the run passed 18/18:

```
node .../heavy-slot.mjs run t911 -- pnpm --filter fluxiq exec vitest run src/framework/tests/setup-storage-migration.test.ts src/framework/tests/storage-migration.test.ts src/framework/tests/uncommitted-v2-adoption.test.ts --maxWorkers 1 --minWorkers 1
 Test Files  3 passed (3)
      Tests  18 passed (18)
   Duration  139.52s
```

Saved as
`C:/Users/osrs_/AppData/Local/Temp/claude/bc302d3e1bd85154/c3e61aca-8771-4705-be3f-167ef5b2d3e3/scratchpad/t911-setup-migrates.patch`
(covers `framework/index.ts`, `storage-migration.ts` and
`docs/operations/data-and-state.md`) and `.../scratchpad/t911-setup-storage-migration.test.ts`.
The scratchpad may not survive the restart. If the lead wants only the
migration-safety part (without `setup()` migrating), it is the
`storage-migration.ts` hunks of that patch.

## 4. Conflict forecast for merging dev into t911

The merge base is `04e7b1650`; dev is 39 commits and 1373 files ahead.
Files changed on both sides, with in-flight worktrees read through a
read-only `git status`:

| File | t911 | dev | Forecast |
| --- | --- | --- | --- |
| `client-gateway/service.ts` | the `ClientGatewayCommands` constructor (l.131) gains `hostLeaseTarget` | +61/-8: a `sessionMetadata` resolver, the trust issuer, `changes`, constructor arguments at l.127/130/133 | **Conflict.** Take dev's version and re-add `hostLeaseTarget`. t928 and t929 (uncommitted) also edit this file. |
| `framework/automation-service/service/runtime-session/admission.ts` | static reader replaced by `ports.leaseBinding` (l.39-44) | adds the `ownLeaseAdmits` port and a guard on l.43 | **Conflict.** Combine them: `ports.ownLeaseAdmits !== false && lease?.sessionId !== undefined && ports.leaseBinding!.isCurrent(lease) && ...`. |
| `docs/working/README.md` | l.33 | insert at l.34 | Probably a trivial conflict. |
| `programs/_shared/runtime.ts` | import at l.34; `hostLease` at l.175 | +113/-93, including the trusted-client store at l.181 | Probably clean (6 lines apart); recheck that `hostLease:` uses the authority. |
| `.../project-parts/run/driving-gate.ts` | l.31-62 | l.21, l.94 | Probably clean in text. In meaning, dev's gate passes `ownLeaseAdmits: false`, and the merged gate must also pass the binding. |
| `.../runtime-session/tests/admission.test.ts`, `.../project-parts/run/tests/driving-gate.test.ts` | | small inserts | Probably clean; the tests need both features. |
| `client-gateway/service/types.ts`, `framework/automation-service/service.ts` | | | Clean (hunks far apart). |

Risks that the text diff will not show:

- **t929 (revoke pairing, uncommitted, 21 paths):** it edits
  `trusted-clients.ts`, `trust-grant.ts`, `revocation/*`, `access.ts`,
  `lifecycle.ts` and `inbound.ts`. t911's `hostLeaseTarget` reads
  `trustedClients.get(id)`, `trustedClients.isActive(trusted)` and
  `trusted.domainId`. If t929 changes what "active" means after a revocation,
  or changes those signatures, the lease target's domain follows. A revoked
  client should end with domain `undefined` (no stamping, explicit claims
  refused), which is what t911's rule for an inactive record already does.
  Check after t929 merges.
- **t928 (key backend, uncommitted):** it edits `client-gateway/service.ts`,
  `service/index.ts` and `trace-tap/tap.ts`. t911 changes trace preparation in
  `transport.ts`, so read `trace-tap` against t911's admission check that runs
  after preparation.
- **t927:** no overlap with t911.
- dev added no new static `AutomationStudioHostLeaseScope.current()` /
  `.gatewaySource` consumers since the base: the same nine call sites.
- None of dev's 28 renames or deletions touch a t911 file. The schema
  migration ids do not collide (dev's highest is 0037; t911 adds 0038).

## Commands run and observed results

- `heavy-slot run t911 -- pnpm install --frozen-lockfile --prefer-offline`
  -> exit 0, "Done in 2m 30.4s". One warning: the `apps/web` bin link for
  `fluxiq` was not created because `fluxiq/dist` is not built.
- Read-only inspection of the two roots (section 3) -> v1 with no legacy
  roots in the main checkout; v2 in t915.
- The tests for the withdrawn `setup()` change, through a slot -> 3 files,
  18/18 passed, 139.52 s (section 3).
- The probe plus the existing migration tests on unchanged code, through a
  slot: `vitest run src/framework/tests/t911-probe-cutover.test.ts
  src/framework/tests/storage-migration.test.ts
  src/framework/tests/uncommitted-v2-adoption.test.ts --maxWorkers 1
  --minWorkers 1` -> 3 files, 12/12 passed, 239.41 s, and the `T911PROBE`
  line above.
- The `git log`, `git diff`, `git grep`, `git worktree list`,
  `git for-each-ref` and `git -C <t927|t928|t929> status --short` commands
  behind section 4 (all read-only).

- After the restart, on the branch tip `842588df4` (the gate script was
  replaced at 20:54 and my first queued runners ended with 127 before
  getting a slot, so these are the re-runs):
  - `node .../heavy-slot.mjs run t911 -- pnpm --filter fluxiq check` ->
    exit 0. tsc `--noEmit` over the package, 110 s, no diagnostics
    (`{"build-cache":"build","step":"fluxiq:check",...,"ms":110028}`). This
    confirms that Codex's six null-narrowing errors are fixed.
  - `node .../heavy-slot.mjs run t911 -- pnpm structure:check` -> exit 1,
    "2 violation(s) across 1 rule(s)", both under `working-docs`:
    `docs/working/README.md is out of date with the documents' header blocks`,
    and `docs/working/t911-takeover.md:3: expected "Status:"`. Both come from
    this report: the rule indexes only top-level `docs/working/*.md`
    (`scripts/structure-audit/rules/working-docs.mjs:74-81`), and this report
    had no header block and no index row. There were no code violations. It
    also printed "3 baseline entries can be lowered" (advisory). I have since
    added the header block. Regenerating the shared index
    (`pnpm structure:baseline`, which rewrites `docs/working/README.md`) is
    the lead's, at commit time.

## Not verified

- The audit was not re-run after the header block was added; that README is
  the only remaining failure is inferred from the rule's code, not observed.
- The t911 lease test set (phase 2).
- No merge was simulated (`git merge-tree` is blocked for workers); the
  forecast comes from comparing hunk ranges.

## Phase 2 notes received from the lead

- Merge dev into this branch after t929 lands, then resolve the conflicts and
  finish t911.
- Addition: `packages/fluxiq/src/framework/automation-service/service/conversation-requests/list.ts`
  lists each project in turn, and one project's `listConversations` throwing
  fails the whole cross-project list. Make each project's result independent:
  list the readable ones and report an unreadable one by id with its reason,
  and add a test with one failing project.
- The migration fix goes to its own task, `storage-migration`
  (`storage-migration.ts` part only, from
  `C:/Users/osrs_/FluxStuff/fxwork/.held/storage-migration/`), when the lead
  sends its path.

## Open questions or contradictions found

1. The working-document claim that t911 broke storage (extension
   `usable-client-plan.md`, commit `a26ba0f96`) is wrong; see (a).
2. The lead's host-side `migrateStorage()` will hit the cutover defect above
   on any real v1 root a runtime ever used. Core should fix that in
   `storage-migration.ts` (the patch is ready). Until then such a root is left
   `migration_incomplete`, and only `rollbackStorageMigration()` restores it.
3. The Core panel and `fluxiq dev` refuse a v1 root, and the panel's migrate
   action cannot be reached on a v1 root because the panel does not start.
   Under the user's rule that no person runs a migration, they need the same
   host-side migrate step the lead added downstream (`run-dev.ts` is t931's;
   `apps/web/src/lib/fluxiq.ts` is being edited by t927).
4. The accounts CLI's offline mode writes to a v1 root without migrating
   (`platform/provisioning/cli/main.ts:40-46`).
