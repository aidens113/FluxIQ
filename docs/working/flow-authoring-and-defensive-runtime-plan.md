# Flow Authoring And Defensive Runtime Plan (Core share)

Status: Active
Status detail: Executing 2026-09-22. Wave one landed in Core; the correction that makes exploration run the real node registry landed with it; four paired task branches are open.
Created: 2026-09-22
Last updated: 2026-09-22
Owner: Senior supervisor agent
Scope: Core's share of making a model-authored Flow faithful to what the model actually did, and of making a Flow's execution survive a site nobody controls: the build loop that explores by running real registry nodes, the accruing draft and its edit and dry-run seams, the per-node retry and recovery ladder that reads recorded state, and the permission gate a Flow's own steps must pass. It deliberately does not cover the browser, the DOM, selectors, the Testing Lab, or any judgement about what a particular page means, all of which stay downstream.
Paired document: `F:\!FluxIQWebExtension\docs\working\flow-authoring-and-defensive-runtime-plan.md`
Related: [automation studio](../architecture/automation-studio.md), [code structure](../architecture/code-structure.md), [package boundaries](../architecture/package-boundaries.md), [week 2 loop](./mvp-week2-automation-loop-plan.md)

---

## Current State

The downstream document is authoritative for sequencing, evidence and the
per-step plan. This document exists because the user authorized Core edits for
this work on 2026-09-22 — "yes good, i want to edit core" — and Core's own
instructions require a Core-side record of what is being changed here and why.

**Why the work exists.** A live campaign round on 2026-09-21 built roughly
seventy Flows from instructions across ten realistic sites and produced one Flow,
which then failed on replay. Two causes were structural rather than incidental,
and both are Core's:

1. **Authoring was a separate act from exploring**, so the Flow the model saved
   was not what the model did. On one site the build dismissed a cookie banner
   and a notification prompt, then proposed a Flow containing neither, and its
   `navigate` node reported success while the tab never moved.
2. **A failing node had no cheap way to recover.** There was no per-node retry at
   all; the recorded expected state written onto every node was read by nothing;
   and the only escalation was the model, which is the expensive last resort and
   was itself blocked for granted runs.

**What the user settled, and it is binding.** Recorded state is the product's
central selling point, so retries are on by default with a real attempt count;
the recorded state is read at execution time rather than merely stored; and a
recorded delay is a **maximum wait for the expected state, not a sleep** — if the
state appears sooner the node runs immediately, and if it never appears the node
is attempted at the deadline anyway, because the recording is evidence the action
was possible there. Separately, the model explores by running the **real output
nodes with real parameters**, drawn from the dynamic registry — Core's built-ins
plus whatever a domain or a host registered — never a hand-written list, so the
Flow is assembled from nodes that provably worked.

**What has landed in Core.** Merged on `dev`:

- `cda4bb1` — the recovery ladder: per-node retry on by default, the recorded
  wait ceiling gated by expected state, expectation evaluation on a *failed*
  attempt, the recorded state link finally read, recovery candidates consumed and
  dropped so a deterministic candidate stops suppressing escalation, and the four
  inert retry surfaces resolved rather than left as traps.
- `bf8792b` — the accruing draft: the decision input retained beside each
  evidence entry, `runtime/exploration-reduction/` wired to the bootstrap path it
  was written for and never connected to, an assembler that builds a proposal
  from accrued steps instead of re-emitted prose, decision kinds for dropping,
  amending and marking a step exploratory, and the draft given its own reserved
  place in the evidence window — the direct fix for the per-tool eviction that
  left the model unable to see its own dismissals.
- `1987317` — exploration runs the real nodes. One verb, `core.run_node`, whose
  argument enumerates the live registry (59 nodes in the measured configuration),
  executed through the same gateway command a finished Flow dispatches. The
  second tool vocabulary is gone, and with it the gap between what was proved and
  what shipped. It also carried the consequence-declaration reader that the
  permission work needed.

**What is open**, one Core branch each, all paired downstream:

| Branch | Core's share |
| --- | --- |
| `task/t081-flow-permission-gate` | a Flow's own steps put to the permission gate, and the grammar that lets a step say what pressing something would lastingly do |
| `task/t087-service-seams` | the state-digest hook wired for builds, the trace sanitizer no longer dropping result codes, a wait reachable on the authoring path, an unpermitted authoring action made recoverable rather than thrown, escalation unblocked for granted runs, and the recorded gap carried onto the node |
| `task/t088-draft-dry-run` | replaying the accrued draft from a reset page during the build, and refusing to propose until it replays clean |
| `task/t089-adversarial-measurement` | publishing what the run detail drops, so a retried node can be attributed to a rung at all |

**The measurement that is still missing.** The ladder is built, unit-tested and
observed running live, but its own implementer found that **no variant in the
scenario corpus is absorbable by a deterministic ladder**, because that corpus
was built to prove model repair. So the ladder has never been shown to absorb
anything. Until `task/t089` lands its adversarial conditions, Core's honest claim
about the ladder is "it runs, and it declines correctly", not "it recovers".

**The standing constraint on this work.** `runtime/service.ts` is the serial
bottleneck and belongs to exactly one task at a time. It is now 4,637 lines, down
from 6,275, so the zero-headroom rule that shaped the first partition has
relaxed — but the file takes wiring only, and every behaviour lands in a module
beside it.

**Blockers:** none.

---

## What Core Owns Here, And What It Does Not

The boundary is the same one the paired document states, and it decides where a
defect gets fixed rather than being a matter of taste.

Core owns the build loop and its decisions, the draft and its edit, replay and
proposal seams, the node registry the model draws from, the executor's retry and
recovery ladder, the recorded state contracts and the clocks they carry, the
permission gate and the consequence vocabulary, and the run detail the Lab reads.

The downstream web domain owns which actions change a page, how a DOM state
digest is taken, how an overlay is recognised, how a handle resolves to an
element, and every word said about a particular control. The extension owns the
browser. Neither may be approximated here: a judgement that needs to have seen a
page does not belong in Core, and a mechanism that would work for any domain does
not belong downstream.

---

## Work Ledger

### 2026-09-22 — Core's share recorded; wave one merged; wave two opened
- Agent: supervisor
- Changed: this document, and Core's working index.
- Why: the user authorized Core edits for this work, and Core's instructions
  require a Core-side record. The paired downstream document had been carrying
  the whole account, including three Core merges.
- Validation: not validated — this commit is documentation. The Core merges it
  describes were each verified in their own task, downstream and here.
- Outcome: Done
- Follow-up: update this document as t081, t087, t088 and t089 land, and record
  the ladder's absorption measurement here once t089 produces one, since the
  claim it settles is Core's.
