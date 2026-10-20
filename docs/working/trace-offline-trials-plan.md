# Traces And Offline Trials

Status: Active
Status detail: Plan of record approved and implementation approved by the user on 2026-10-19; lane T (t729) created, not yet dispatched; P0 is next.
Created: 2026-10-19
Last updated: 2026-10-19
Owner: Senior supervisor agent
Scope: Core records what it receives from clients during live builds, tests and runs (traces) and runs candidate Flows against those traces through the normal runtime (offline trials), to cut live trial time in the test and repair phases. Not a site simulator; the final judged whole run stays live.
Paired document: `docs/working/trace-offline-trials-plan.md` in FluxIQWebExtension (extension side)
Related: [source plan](./trace-offline-trials-plan/source-consultant-plan.md) (the consultant's original, kept verbatim); downstream `docs/working/extension-core-boundary-audit.md` (prerequisites)

---

## Current State

**Approved (user, 2026-10-19):** this plan, which is the supervisor's revision of the consultant's plan in
`trace-offline-trials-plan/source-consultant-plan.md`. "don't implement yet" was the instruction while reviewing;
the user then approved the plan. No code has been written.

**Why:** live trials dominate build time. In the downstream breadth round on 2026-10-19 the social build spent 20.5
of its 25 working minutes in 7 whole trials (one took 337 s), and site-reset failures blocked every trial in three of
four builds. Model spend was small ($0.23 for four builds); time and live-site effects are the bottleneck.

**Implementation approved (user, 2026-10-19):** with subagents, together with the downstream boundary audit's
move plan. Execution is run from the downstream `docs/working/trace-offline-trials-plan.md` (lane table). This plan
is lane T, branch `task/t729-traces-offline-trials` in both repositories (worktrees under
`C:/Users/osrs_/FluxStuff/fxwork/t729/`), created and not yet dispatched.

**Dispatched 2026-10-19:** lane T is running P0 and P1 (brief in the downstream execution hub); the boundary moves are tracked in [extension-boundary-moves.md](./extension-boundary-moves.md).

**Next:** P0, all in parallel: downstream audit Phases 0 and 1 (provider-call guard; offline queue scoped to its
session, project and recording) in lanes H and G; Core owns recording and capture policy (lane S); a baseline from
the Lab's per-step files; an inventory of everything Core accepts from clients and reads later; and the page-snapshot
spike (see P2), in lane T. P1's evidence-loop and executor edits wait for the reset redesign (t724) to merge.

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

## Open Questions

None requiring user input.
