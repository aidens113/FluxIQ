# Traces And Offline Trials

Status: Active
Status detail: P0-P5 complete (t729, t734, t736, t742, t746, t749); P6 next, after downstream t751.
Created: 2026-10-19
Last updated: 2026-10-21
Owner: Senior supervisor agent
Scope: Core records what it receives from clients during live builds, tests and runs (traces) and runs candidate Flows against those traces through the normal runtime (offline trials), to cut live trial time in the test and repair phases. Not a site simulator; the final judged whole run stays live.
Paired document: `docs/working/trace-offline-trials-plan.md` in FluxIQWebExtension (extension side)
Related: [source plan](./trace-offline-trials-plan/source-consultant-plan.md) (the consultant's original, kept verbatim); downstream `docs/working/extension-core-boundary-audit.md` (prerequisites)

---

## Current State

**Approved (user, 2026-10-19):** this plan, which is the supervisor's revision of the consultant's plan in
`trace-offline-trials-plan/source-consultant-plan.md`. "don't implement yet" was the instruction while reviewing;
the user then approved implementation. P0-P5 are now merged; the downstream execution hub owns current recovery status.

**Recovery (2026-10-21):** UI task t753 is verified and merged in both repositories (Core `d1c39c0a`, downstream
`daabd593`), with post-merge owning tests/types/build/audits and the mandatory 64 prompt-contract tests passed.
Reset t751 and judge/read t752 continue in isolated paired trees. Review additionally requires retained own-list/
control witnesses when optional runtime diffs are absent, and explicit gaps for inert automatic text disclosures.
Independent retained-witness checks passed36 tests; the final reset review still requires a captured original before
every project exploration act, including custom tool routes. t752 integrated owner checks passed except two stale
labels; their corrected focused rerun passed7 tests, and the frozen Core build is running. Package exports cleanup
is dispatched independently in paired t754 worktrees. P6 still waits for t751; no paid execution or daily full sweep
has been launched by Codex. The t754 lifecycle automatically performs its initial downstream workspace build;
do not repeat that broad build as a per-fix gate.

**Why:** live trials dominate build time. In the downstream breadth round on 2026-10-19 the social build spent 20.5
of its 25 working minutes in 7 whole trials (one took 337 s), and site-reset failures blocked every trial in three of
four builds. Model spend was small ($0.23 for four builds); time and live-site effects are the bottleneck.

**Implementation approved (user, 2026-10-19):** with subagents, together with the downstream boundary audit's
move plan. Execution is run from the downstream `docs/working/trace-offline-trials-plan.md` (lane table). This plan
was lane T, initially `task/t729-traces-offline-trials`; its completed phases and successor tasks are recorded below.

**Progress (2026-10-20): P0-P5 complete.** P0/P1 (t729, t734): the trace and trial-evidence contracts, the
environment port (a clock plus a gateway channel scope, decision D1) and capture where Core accepts what bypasses the
gateway (D3); live trials are 49.8% of build time. P2 capture (t736): at the client gateway and Core's ingress into
each project's store, the extension's DOM-plus-resource-map snapshots, tracing on for every Lab live run, about +11.5%
overhead. P3 intake parity (t742): 3,333 of 3,333 saved-Flow delivery points and 4,274 of 6,941 live points matched
(honest capture gaps), 0 intake defects; trace payloads chunked and protected (migrations 0031-0032). Keyed content
addresses in protected projects (t745, migrations 0033-0035) and the storage follow-ups (t747: sweep race, re-seal
job, `gateway-trace` storage layout, migration 0036). P4 offline trials tier 1 (t746): the candidate trial runner
against a recorded trace through the real intake, a strict trace matcher (`client-gateway/trace-matcher/`), virtual
timers, U5 results with explicit gaps; source tests T05-T08, T10, T12-T16, T20, T22-T24 pass; round 4's social trials
reproduce their live judged outcome exactly offline.

**Moved to P5:** P4's corrected-candidate gate item (the social correction changes a filter inside the extension's
read, so it needs tier 2). The downstream experiment deep-loads three unexported modules (brief scope, scoped
submission, whole-candidate assembly); P5 replaces that with a public seam.

**P5 complete (2026-10-20, t749):** a changed read runs the extension's own content code over the recorded page
snapshot (scripts and network off) through a reevaluation port on the trace matcher, or returns an explicit gap
(`snapshot_unavailable`, `dynamic_content`); offline equals live on job-board 84/84 cells, photo 566/566 and social
906/906; P4's corrected-candidate item met; public seams replace the downstream deep loads, and new audit rules
`package-exports` and `module-reach` refuse such loads.

**Next:** P6 build-loop integration (offline first in test and repair; live for action changes, gaps and the final
judged run; production passes the live session's view and hosts the snapshot page), after downstream t751 merges;
then P7. **Handoff (2026-10-20 evening):** the work goes to Codex; operating detail in the downstream
`docs/working/trace-offline-trials-plan/reports/handoff-2026-10-20.md`.

**Blocked:** nothing needs the user.

## Decisions (the supervisor's changes to the source plan)

1. **Names.** "Recording" already means a person's demonstration (recording-as-evidence) and "replay" already
   means a provider-free live rerun of a saved Flow. This effort uses **trace** (what Core received during a live
   run) and **offline trial** (a candidate run against traces).
2. **Offline trials only in the test and repair phases.** The user's 2026-09-30 rule: a build explores and drafts
   in real time and never replays from the start during exploration or the initial build; replays from the start
   are allowed in judgement and repair. Offline trials start once the model says the Flow is ready, and in repair.
   They are never a gate the build must pass to continue exploring.
3. **The final judged whole run stays live, with a site reset.** An offline pass never satisfies the "whole Flow run
   from its start judged successful at least once" rule (2026-10-02) and never counts as a live success.
4. **Capture inside Core.** Core's client-gateway service sees every command it sends and every message it
   accepts; capturing there records exactly what Core received, through the same intake it uses live. The extension
   only puts in-band anything Core later dereferences and, in tracing mode, captures page snapshots.
5. **Value where revisions change.** Most of the breadth round's failed revisions changed reads and targets (a
   link column, row matching, list coverage, filters), so the work is staged by tier and the riskiest piece (page
   snapshot fidelity) is spiked first.
6. **No site reset for offline trials.** They have no live effects; live trials keep the reset rules.
7. **Audit prerequisites.** The extension's offline queue currently persists recorded page data across browser
   restarts and replays it to any later session; it is fixed before traces are trusted. The recording/capture
   policy is owned by Core, not the extension. Moving the gateway client protocol into Core helps but does not block.

## Tiers

| Tier | Candidate change | Offline result |
| --- | --- | --- |
| 1 | Computation only: output mapping, conditions, filters and post-processing on rows already read, sort and dedupe, loop limits over recorded rows | Full offline trial, then the same judges, with recorded provenance |
| 2 | A changed read or target: new columns, a different read scope, re-resolving a target | A captured page snapshot loaded in a sandboxed browser with scripts and network off, running the same extension extraction and target code; anything dynamic is an evidence gap |
| 3 | Changed actions or action order | Evidence gap, leading to a focused live test from that node (the existing run-from-node tool) instead of a whole live trial |

## Phases

- **P0, prerequisites and baseline (parallel):** downstream audit Phases 0 and 1; Core owns recording/capture
  policy; baseline from the Lab's per-step files over about 25 recent runs (share of build time in live trials,
  resets, exploration, model calls); inventory of every client message type Core accepts, everything it
  dereferences later (screenshots, for example) and any read that bypasses the gateway. Gate: inventory complete
  and the capture boundary written down as a decision.
- **P1, trace contract and environment port (Core):** trace manifest, event envelope and completeness status; one
  environment interface that the executor, the evidence loop and the trial runner already go through, so live or
  offline is a configuration, never a second code path; the result contract (verdict, evidence origins, scope,
  candidate revision, goal contract version, source episodes, missing evidence); a non-browser fixture adapter used
  only in unit tests, proving the contract has no web-specific fields.
- **P2, capture (two lanes after P1):** Core lane: capture at the client gateway into the workspace's existing
  store, with indexed reads and explicit completeness. Extension lane: in-band artifacts and page snapshots at each
  observation and read, Chrome and Edge first. Spike, started in P0: can a captured page be reloaded offline
  faithfully enough for the extension's own extraction and target code. The Lab turns tracing on for every live
  run. Gate: source tests T01-T04, T11, T14; overhead measured on four realistic tasks.
- **P3, intake parity:** traces fed through the same ingress; a parity harness over real Lab traces from all ten
  realistic sites. Gate: the original run matches at every delivery point.
- **P4, offline trials tier 1:** the production executor against a trace environment; strict operation matching
  (action type, target fingerprint, arguments, occurrence, preceding operations); virtual clock; evidence gaps.
  Gate: source tests T05-T08, T10, T12-T16, T20, T22-T24, and an offline trial of a corrected candidate for the
  breadth round's social failure (downstream run-mvfq957o-40103539) reproduces the judged result.
- **P5, offline reads and targets tier 2:** the domain's offline resolver built on the P2 spike. Gate: on the
  breadth round's photo, job and social traces, a changed read evaluated offline matches what the live read
  returned.
- **P6, build-loop integration (test and repair phases only):** offline trial first; a demonstrated failure goes
  back as repair feedback marked recorded; a gap becomes a focused live run from that node; the final judged whole
  run stays live with a reset; live-success accounting by live episode; the chat says which results were offline.
- **P7, measure and roll out:** the same task set (one per realistic site) with offline trials off and on; total
  time to an accepted Flow, live trials per build, recorded-pass/live-fail cases. On by default only if the saving
  holds without lowering acceptance.

Dependencies: P2 needs P1; P3 needs real traces; P4's verdicts need P3's parity; P6 needs P4's isolation. The P0
work and the P2 snapshot spike start immediately.

## Tests Beyond The Source Matrix

The source plan's T01-T24 are kept. Added:

- An offline trial cannot run during exploration or the initial build, and an offline pass cannot satisfy the
  whole-run judgement gate.
- Traces contain no secrets: Core's secret screening runs before storage; a step that typed a secret is a declared
  fidelity limitation and comes back as an evidence gap.
- Traces from the realistic sites never reach model guidance.
- Browser-level tests use only the ten realistic scenarios; the non-browser adapter stays at unit level.

## Risks

- Page-snapshot fidelity is the main risk: script state, shadow DOM, canvas and cross-origin frames do not survive.
  The spike measures how much of tier 2 is real.
- Trace size: page snapshots per observation may be large; measure, and store repeated content once.
- Matching strictness: too loose gives false passes; start strict and loosen only where measured.
- Firefox lacks Chrome's page-capture API; Chrome and Edge first.
- Offline iterations still call the build model and the judges; they save site time, resets and waits, not model
  spend.

## Work Ledger

### 2026-10-19 - Plan of record filed
- Agent: supervisor
- Changed: this document; `trace-offline-trials-plan/source-consultant-plan.md`; the paired downstream document
- Why: the user supplied the consultant's plan, asked the supervisor to review it and make it its own, and approved
  the revision.
- Validation: not validated; planning only, no code.
- Outcome: Accepted (planning)
- Follow-up: P0.

### 2026-10-19 - Implementation approved; lane T created
- Agent: supervisor
- Changed: this document's Current State
- Why: the user asked to implement this plan and the audit's move plan with subagents, after a handoff.
- Validation: downstream `pnpm task start traces-offline-trials --worktree --core` ->
  `"id":"t729","branch":"task/t729-traces-offline-trials"`; both worktrees `git status --short` -> 0 lines.
- Outcome: Partial (nothing implemented yet)
- Follow-up: dispatch lane T from the downstream lane table.

### 2026-10-20 - P2-P4 merged; P5 next
- Agent: supervisor (lane T; execution hub in the downstream repository)
- Changed: P2 capture (t736), P3 intake parity (t742), keyed content addresses (t745), storage follow-ups (t747) and
  P4 offline trials tier 1 (t746) merged to `dev` in both repositories; validation for each is in the downstream
  hub's ledger (`docs/working/trace-offline-trials-plan.md`).
- Validation: t746's gate after its last dev merge: Core trace-matcher, trace, gateway-trace, offline-trial,
  environment, storage gateway-trace, model offline-trial -> `Test Files 62 passed (62)`, `Tests 355 passed (355)`;
  `tsc` 0; `pnpm docs:check` -> reference current; audits passed. Earlier full gate: 364 files, 2504 tests passed.
- Outcome: Partial (P4's corrected-candidate item moved to P5)
- Follow-up: P5 (t749).

### 2026-10-21 — Downstream t753 recovered and integrated
- Changed: Core activity wording/pacing, truthful whole-test history and one ending account, draft promotion
  guard for unfinished builds, UI text checks and web readiness projection. Downstream chat/overlay companion
  merged first; Core merge `d1c39c0a`, downstream `daabd593`.
- Validation: `pnpm.cmd task finish t753 "Readable chat endings and steady activity" --skip-checks` independently
  ran mandatory prompt contracts: `Test Files 3 passed (3)`, `Tests 64 passed (64)`. The user-required narrow
  owning tests/types/audits had passed before finish; the full `pnpm check` was not repeated. Supervisor
  `pnpm.cmd docs:check` reported `Deterministic framework reference is current.` Detailed commands/results and
  rendering limits are in downstream `reports/codex-t753-integration.md` and `reports/codex-integration-review.md`.
- Next: finish reset/judge recovery before P6; no paid round while known fixes remain in flight.

## Open Questions

None requiring user input.

### 2026-10-20 — Codex recovery active
- Agent: supervisor
- Changed: corrected stale planning-only Current State text; downstream paired hub holds recovery briefs for t751/t752/t753.
- Why: resume preserved work before P6 changes the same trial gates.
- Validation: read both task worktrees and reports; no source acceptance claimed from prior lead reports.
- Outcome: Partial; see downstream execution hub recovery entry.
- Follow-up: verify reset/judge/UI tasks, merge paired units, then start P6.
