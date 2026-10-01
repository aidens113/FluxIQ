# Core UI/UX review and initial fixes

Status: Active
Status detail: Third Core UX batch verified; sign-in navigation, operational freshness and clipboard feedback implementation active.
Created: 2026-09-30
Last updated: 2026-10-01
Owner: Codex senior supervisor
Scope: Core web shell, operational panels and Automation Studio user journeys; paired extension review and draft-preservation fixes.
Paired document: codex-ui-ux-review-2026-09-30.md in the sibling downstream repository.
Related: [current system](../architecture/current-system.md), [working document index](./README.md)

## Current State

Latest continuation: onboarding, read-only Runtime and database authorization
source complete. Database checkpointd5c979a6; supervisor combined82 and full
300files/1852tests passed. Corrected third web typecheck69624 passes14708ms;
corrected audit84320 only inherited service4506/4505. Production build9733 passed
17pages/101959ms. Onboarding1a5afc47, Runtime d011b0ae and databased5c979a6 are
durable. Next auth-navigation and operational-refresh/Compute briefs are released;
supervisor clipboard controls pass22 focused tests and corrected scoped types.
Supervisor fourth combined110tests passed and web types98099 passed67584ms.
Full10138 completed308files/1943tests with1942pass/1failure: source-only global
request contract expected an inline controller in Compute, now owned by the
shared hook. Owning contract follows that boundary; independent focused87610
passed21tests/8.44s including actual cancellation. Production29706 passed17pages,
128724ms. Final full21515/types56689 rerun with source frozen; no product fallback
or assertion relaxation. Auth9d5e2533/refresh e109b226/clipboard0738bc58 saved.
Corrected documentation audit passes; full structure has
only protected inherited service4506/4505 after index regeneration.
Downstream strip is independently verified full1727/types/build/structure and
checkpointed5e162c36; explicit user navigation focus follows. No runtime/backend
or security contract changes.

The downstream paired plan is authoritative for coordination, worker briefs and
reports. This Core task is isolated in task/t224-codex-ui-ux-review. Claude owns
integration; no dev/main merge or push. No private runtime state, storage,
conversation implementation or other agents' worktrees are edited.

Execution resumed 2026-10-01 at the user's explicit request: keep working through
the remaining UX phases with subagents, then find other useful nonconflicting
work. Downstream paired Current State and written continuation briefs own exact
file assignments: authoring navigation, Problems query feedback, extension keyed
rows. Supervisor owns production-runner.tsx and its new owning behavior tests.
No whole-tree validation during active edits; focused runs use shared heavy slots.
No batch-boundary stop, merge/push, panel startup, live/browser/provider calls.
Keep durable reports and checkpoint commits as steps are independently verified.

2026-10-01 checkpoints: c71aa0fd Production Runner (11focusedpass),3d90046b
Compute visible selection (6focusedpass),b2eb277f Problems query states
(supervisor30pass),2594f6c9 authoring review/scope guards (supervisor55pass).
These focused results are independently observed; coordinated broad web checks
wait for the global-question worker to freeze source. Other workers now audit
onboarding and extraction read-only for the next implementation assignments.
Extension final full1695pass and types/build pass in paired downstream tree.

Second batch checkpoints:33864e3e global question queue, b0a4cdda selected run
detail retry/race guards, f1b80c93 Compute fixture typing and445e12d9 exact
optional-prop/test helper/import corrections. Supervisor full web suite63749
passed293files/1775tests before the strict corrections. Worker corrected focused
55 and66 passed; supervisor reviewed exact diffs and corrected web typecheck73179
passed13487ms. Corrected production build36344 passed17pages,120426ms. Core audit
28482 has only inherited unchanged service4506/4505; no new violation/baseline
increase. These results authorize the next disjoint Core source assignments:
guided onboarding entry (trace_endings), read-only Runtime workspace
(lab_bookkeeping), and database authorization UI fencing (supervisor). Whole-tree
gates wait for their next coordinated freeze. Runtime uses existing public read
contracts only; no runtime/backend/security ownership changes.

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
Final supervisor web suite98054 passed287files/1704tests, exit0,212.84s.
Final typecheck62339 exit0,83544ms; production build71345 exit0,17pages,248727ms.
Final full Core audit1037 has only inherited service4506/4505 failure; no new
violation or baseline increase. Initial batch complete; source frozen.

Browser, live provider and panel management are not exercised. Visual and
accessibility certification remains a separate live validation requirement.

## Work Ledger

### 2026-09-30 - Final initial-batch handoff
- Agent: supervisor
- Changed: final current state and integration/resume record.
- Why: checkpoint verified behavior without claiming queued redesigns or live validation.
- Validation: independently observed full web287files/1704tests0, web types0,
  production build0. Core audit1 solely inherited unchanged service4506/4505.
- Outcome: Complete for current-source audit and initial recovery/composer batch.
- Follow-up: Claude owns integration; no merge/push. Preserve root-only recovery
  host, owning tests, composer edit revisions and public-default contract fixture.
  Code commits e6eb33f2/95573296; prior record07acd910. Paired extension
  commits21e915ee/061e8a70. Remaining UX phases and live validation stay queued.

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


Final documentation verification: supervisor session48994 exit0, docs-links and working-docs passed (0warnings/16baselined). Final records/index checkpointed locally; no merge or push.
