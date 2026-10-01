# Core UI/UX review and initial fixes

Status: Active
Status detail: Initial recovery fix passes focused tests, types and build; broader web suite pending, UX roadmap remains active.
Created: 2026-09-30
Last updated: 2026-09-30
Owner: Codex senior supervisor
Scope: Core web shell, operational panels and Automation Studio user journeys; paired extension review and draft-preservation fixes.
Paired document: codex-ui-ux-review-2026-09-30.md in the sibling downstream repository.
Related: [current system](../architecture/current-system.md), [working document index](./README.md)

## Current State

The downstream paired plan is authoritative for coordination, worker briefs and
reports. This Core task is isolated in task/t224-codex-ui-ux-review. Claude owns
integration; no dev/main merge or push. No private runtime state, storage,
conversation implementation or other agents' worktrees are edited.

Confirmed: program API calls await reauthentication after HTTP 401, but generic
program pages mount AuthStatus rather than GlobalTopbar, the only existing
reauthentication host. This can leave requests pending indefinitely. The initial
fix moves one host into the authenticated root shell and resolves pending work
when it unmounts, preserving workspace state and current authentication contracts.

Current-source reviews also identify onboarding choices not consumed by Studio,
authoring proposals without review navigation, and global question selection
that examines only the first conversation. Those require scoped follow-up work,
not changes to framework runtime contracts in this task.

Initial recovery fix is source-complete: focused3files/17tests and web typecheck
pass; supervisor web production build passes17pages,165872ms. Full Core audit
has exactly one inherited unchanged service4506/4505 size failure; no baseline
increase or unrelated service edit. Supervisor broader web suite88597 is queued
through shared heavy slots. Local checkpoint commits preserve the verified
focused implementation without claiming that broader suite has passed.

Browser, live provider and panel management are not exercised. Visual and
accessibility certification remains a separate live validation requirement.

## Work Ledger

### 2026-09-30 — Paired UX review initiated
- Agent: supervisor
- Changed: this task record; product changes underway in web app auth composition.
- Why: user requested primary attention to UI/UX and functional task completion.
- Validation: source review only; tests pending.
- Outcome: Partial
- Follow-up: inspect worker results and run independent checks.

### 2026-09-30 — Initial recovery verification
- Agent: supervisor and worker
- Changed: app/session-reauthentication host, root composition, owning tests and current-system documentation.
- Why: make every authenticated panel recover expired API requests while preserving work.
- Validation: focused17/17, web tsc0, supervisor productionbuild0; full audit only inherited service4506/4505. Broader web suite88597 pending.
- Outcome: Partial
- Follow-up: checkpoint locally, observe broad suite, preserve Claude integration ownership.
