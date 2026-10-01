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
increase or unrelated service edit. Supervisor broader web suite88597 completed
exit1:1699pass/1fail, with the sole flow.build contract fixture rejected by a
pre-provider request budget. The fixture correction uses public token defaults
and passes60/60; supervisor inspected the raw completion and exact diff.
Core composer loss was reproduced (2fail/8pass), then corrected10/10 passed.
Checkpoint95573296 preserves these follow-ups; initial recovery e6eb33f2.
Final web suite98054/typecheck62339 are queued; source remains frozen.

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

### 2026-09-30 - Scoped follow-ups verified; final checks running
- Agent: supervisor and fixture worker
- Changed: Core composer edit-revision guard and four owning regressions; contract fixture uses published provider token defaults. Runtime code, scripted responses, assertions and other budgets unchanged.
- Why: preserve newer Core chat drafts and align the test fixture with the current public context window.
- Validation: supervisor reproduced two composer failures (2fail/8pass), then observed corrected10/10 exit0. Inspected worker raw contract completion60/60 exit0 and exact fixture diff. git diff --check0.
- Outcome: Partial
- Follow-up: root full web tests session98054 and web typecheck62339; source frozen. Production build and final documentation checks follow. Initial checkpoints Coree6eb33f2/downstream21e915ee remain recoverable. Claude integration ownership unchanged.
