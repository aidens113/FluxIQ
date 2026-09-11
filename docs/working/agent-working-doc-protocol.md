# Agent Working Document Protocol

Status: Active
Status detail: Protocol adopted; triage, retirement, and Current State retrofits are complete here; compaction of oversized documents remains, on touch.
Created: 2026-09-10
Last updated: 2026-09-10
Owner: Senior supervisor agent
Scope: How the supervisor and workers use `docs/working/` as durable memory and as the coordination substrate for multi-agent work.
Paired document: `F:\!FluxIQWebExtension\docs\working\agent-working-doc-protocol.md`
Related: [AGENTS.md](../../AGENTS.md), [working document index](./README.md)

The normative sections of this document — [The Protocol](#the-protocol) and
[Agent Operating Rules](#agent-operating-rules) — are intentionally identical
in both repositories. A change to either must be mirrored in the same work
unit. Each repository owns its own `Current State`, rollout plan, and ledger.

---

## Current State

This section is authoritative. It is rewritten in place, never appended to,
and must stay under 150 lines. Everything below it is reference or history.

**Adopted.** Every working document in this repository follows the layout,
header block, ledger format, and lifecycle defined in
[The Protocol](#the-protocol). Every agent follows
[Agent Operating Rules](#agent-operating-rules) at the start of a task.

**Done**

- Protocol authored downstream and mirrored here.
- [Working document index](./README.md) exists in both repositories and is
  derived from each document's header block.
- `AGENTS.md` in both repositories links to the protocol and the index.
- Phase 2 triage: all 24 documents here carry a conforming header with a
  real status. Nothing is `Unclassified`.
- Phase 5 retirement: the six Automation Studio plans superseded on
  2026-08-29 carry `Status: Superseded` naming their successor.
- Phase 3 retrofit: every `Active` document carries a `Current State`
  section, written by workers under the briefs below and verified by the
  supervisor. One reclassified itself to Complete on its own evidence
  (`web-panel-ui-ux-functionality-audit-plan.md`). Worker reports, including
  each document's stale or contradictory statements, are under
  `agent-working-doc-protocol/reports/`.

**Not done**

- Oversized documents have not been compacted. Sixteen here exceed 800
  lines; compaction happens on touch, per [Compaction](#compaction).

**Next steps**

1. Compact documents over 800 lines as they are next touched.
2. When a retrofitted document is next edited, resolve the stale statements
   its worker report lists.

**Blockers:** none.

---

## Why This Exists

Agent context does not survive a session. Workers share no context with each
other or with the supervisor. A worker's completion report is a claim,
not a record. Working documents are therefore the only channel through which
one agent's knowledge reaches the next, and they have to be treated as a
durable data structure rather than as prose that accumulates.

The documents as they stand do not meet that bar, for four measured reasons.

**They are too large to read.** Nineteen documents across the two repositories
exceed 800 lines. This repository holds sixteen of them, including
`ui-ux-upgrade-audit-plan.md` at 5,944 lines and
`llm-assisted-deterministic-automation-expansion-plan.md` at 3,459. A document
that cannot be read inside a task budget cannot function as memory, and a
worker that skips it works from assumptions instead.

**Current truth is interleaved with history.** In the downstream
`llm-production-automation-plan.md`, one dated checkpoint section runs from
line 185 to line 1152. An agent looking for "what is true now" has to
reconstruct it from a chronological log. Appending is cheap for the writer and
expensive for every later reader.

**Status is unstructured.** Headers range from `Status: working document` to a
sentence describing partial completion of a certification harness. Some
documents have no header at all. Nothing can be triaged or indexed
mechanically.

**Cross-repository state is duplicated.** The same effort is tracked as
`action-visual-entity-target-plan.md` in both repositories, and this
repository's adaptive-flow and LLM-assisted-expansion documents overlap the
downstream LLM production work. Neither side declares which document owns
which contract, so both drift.

There is also a durability lesson recorded downstream: a crash overwrote all
239,413 bytes of `llm-production-automation-plan.md` with NUL bytes while it
was untracked. Working documents are memory, so losing one loses the project's
accumulated context.

---

## The Protocol

### Directory layout

```text
docs/working/
  README.md                              index of every working document
  <effort-slug>.md                       the working document
  <effort-slug>/
    reports/<agent-label>.md             worker write-back, one file per agent
    archive/YYYY-MM-DD-<topic>.md        compacted history
```

The per-effort subdirectory is created only when it is needed: when workers
are dispatched, or at the first compaction.

### Header block

Every working document opens with an H1 followed by this block, one field per
line, no blank lines between fields:

```text
Status: <controlled value>
Status detail: <one sentence>
Created: YYYY-MM-DD
Last updated: YYYY-MM-DD
Owner: <role, agent, or area>
Scope: <one or two lines>
Paired document: <path in the other repository, or "none">
Related: <links>
```

`Status` takes exactly one of:

| Value | Meaning |
| --- | --- |
| `Active` | Work is in progress or queued. |
| `Paused` | Deliberately stopped; may resume. Say why in `Status detail`. |
| `Blocked` | Cannot proceed. Name the blocker in `Status detail`. |
| `Complete` | Delivered and validated. Retained for reference. |
| `Superseded` | Another document owns this now. Link it in `Status detail`. |
| `Archived` | Historical only. Do not plan current work from it. |
| `Unclassified` | Predates this protocol. Needs a triage pass. |

Nuance belongs in `Status detail`, never in the `Status` value itself.

### Section order

1. `## Current State` — required, authoritative, under 150 lines.
2. Reference sections — objective, design, ownership, invariants, phases.
3. `## Work Ledger` — append-only history.
4. `## Open Questions` — unresolved decisions, each owned by someone.

`Current State` is rewritten in place. It answers, for an agent with no prior
context: what is true now, what is done, what is not done, what is next, what
is blocked. If `Current State` and a ledger entry disagree, `Current State`
wins and the ledger entry is history.

### Work Ledger entries

Append one entry per completed unit of work. Keep each under 15 lines.

```text
### YYYY-MM-DD — <short title>
- Agent: <supervisor | worker label>
- Changed: <files or modules>
- Why: <one or two lines>
- Validation: `<exact command>` -> <actual observed result>
- Outcome: Accepted | Partial | Reverted | Blocked
- Follow-up: <next action, or "none">
```

The `Validation` line records the command that ran and what it actually
printed. "Worker reported success" is not a validation result and must not
appear. If nothing was run, write `not validated` and say why. This mirrors
the rule in `AGENTS.md` that completion reports are not verification by
themselves.

### Compaction

When a document passes 800 lines, or its ledger passes 20 entries, the next
agent to touch it compacts before doing anything else:

1. Fold settled outcomes into `Current State`.
2. Move superseded detail into
   `docs/working/<effort-slug>/archive/YYYY-MM-DD-<topic>.md`.
3. Leave a one-line pointer at the point of removal.
4. Record the compaction as a ledger entry.

Compaction removes redundancy, not evidence. Anything that could still explain
a decision moves to the archive rather than being deleted.

### Worker briefs and reports

Parallel workers must never edit the same file. Two agents editing one
markdown document will silently lose each other's writes. So:

- The supervisor writes a brief into the working document **before**
  dispatch, under a `## Worker Briefs` section.
- Each worker writes its findings to its own file at
  `docs/working/<effort-slug>/reports/<agent-label>.md`.
- Workers never edit `Current State` or the `Work Ledger`.
- A worker writes only its owned files and its report, using filenames unique
  to it. Workers never share a scratch file: two did once, and one overwrote
  the other's staged block after the splice.
- The supervisor reads the report files, independently verifies the claims,
  merges the outcome into `Current State`, and appends the ledger entry.

Brief format:

```text
### Brief: <agent-label>
- Repository: <this repository | FluxIQ Web Extension>
- Task: <what to accomplish>
- Required reads: <this document's Current State, plus specific files>
- Owns (may edit): <explicit paths>
- Must not touch: <explicit paths>
- Definition of done: <observable outcome, including checks to run>
- Report to: docs/working/<effort-slug>/reports/<agent-label>.md
```

`Owns` and `Must not touch` are what make parallel work safe. Partition by
file, never by topic. If two briefs need the same file, the work is serial.

A brief is at most 40 lines. The worker's operating rules — what to read,
what not to touch, never committing — live in the global `worker` agent
definition, not in the brief.

Report file format:

```text
# Report: <agent-label>
## Outcome
Done | Partial | Blocked, with one line of context.
## What changed and why
## Commands run and observed results
## Not verified
## Open questions or contradictions found
```

Return contract, the worker's final message, at most 12 lines:

```text
Outcome: Done | Partial | Blocked
Changed: <files>
Validation: `<command>` -> <observed result, or "not run" and why>
Not verified: <what the worker could not or did not check>
Report: docs/working/<effort-slug>/reports/<agent-label>.md
Notes: <at most three lines>
```

Everything beyond those lines belongs in the report file.

### Cross-repository pairing

An effort spanning this repository and the FluxIQ Web Extension repository
gets one document in each, named identically, each naming the other in
`Paired document`.

Each shared contract has exactly one owning document. The owning side records
the contract's state; the paired side links to it and does not restate it. By
default this repository owns domain-neutral contracts and the downstream
repository owns browser-specific ones, matching the repository boundary rules
in `AGENTS.md`.

A change crossing the boundary gets one full ledger entry in the owning
document and a one-line entry in the paired document referencing it by date
and title. An agent working here at the request of a downstream task follows
this repository's `AGENTS.md`, keeps the change domain-neutral, and reports
compatibility impact back to the coordinating agent.

### Index

`docs/working/README.md` lists every working document with its status, owner,
size, one-line scope, and paired document. It is the cheapest possible entry
point: an agent reads it to find the right document instead of listing the
directory and guessing. Any agent that creates, retires, or re-statuses a
document updates the index in the same work unit.

### Durability

Working documents are tracked in git and committed as part of the work that
changes them, not batched at the end. An uncommitted working document is one
crash away from taking the project's memory with it, which has happened
downstream once already.

---

## Agent Operating Rules

**Starting a task, as the senior supervisor agent**

1. Read `AGENTS.md`.
2. Read [docs/working/README.md](./README.md) and pick the relevant document.
3. Read that document's `Current State` and nothing else yet.
4. Read deeper sections, the ledger, or the archive only when the task demands
   it.

**Starting a task, as a worker**

Read your brief, the files it names, and the `Current State` of the working
document it points to. Nothing else: not the index, not the rest of that
document, not the repository's planning documents. Reading more is how a
worker spends the context its actual task needs. If the brief is not enough
to do the work correctly, say so rather than reading broadly — an
insufficient brief is the supervisor's defect to fix.

**During a task**

Record decisions, findings, and validation results as they happen. A working
document updated only at the end of a session is a summary, not memory: the
reasoning that would help the next agent is exactly what gets dropped.

**Ending a task**

Update `Current State`, append the ledger entry, update the index if status
changed, and commit. Leave enough for the next agent: what changed, why, files
affected, tests performed, known failures, remaining work, and the recommended
next task.

---

## Rollout Plan

**Phase 1 — Define and link.** Complete. Protocol authored in both
repositories, indexes created and populated, `AGENTS.md` updated in both.

**Phase 2 — Triage.** Resolve every `Unclassified` entry. Set a real status,
owner, and pairing. Start with `action-visual-entity-target-plan.md`, which
exists in both repositories. No content rewriting in this phase.

**Phase 3 — Retrofit active documents.** Add a `Current State` section to each
document the index marks `Active`, sourced from its existing status prose and
most recent checkpoint. Do not rewrite history.

**Phase 4 — Compact on touch.** Compact any document over 800 lines the next
time work touches it. Do not schedule a bulk rewrite; compaction with no
active task tends to discard context whose value is not yet visible.

**Phase 5 — Retire the superseded.** The six Automation Studio documents
carrying a 2026-08-29 historical tracking notice are marked `Superseded` in
the index with their successor named, so no agent reads them as current.

---

## Worker Briefs

Dispatched 2026-09-10 for Rollout Phase 3 (retrofit `Current State`). Shared
task definition, then one brief per document.

**Shared task.** Bring the target document into conformance with
[Header block](#header-block) and [Section order](#section-order) by adding,
not rewriting: insert a conforming header block directly after the H1
(mapping any existing status prose onto the controlled vocabulary and
keeping the original wording in `Status detail`), then a `## Current State`
section under 150 lines directly after the header, sourced from the
document's existing status prose and its most recent dated checkpoint. Do
not reorder, delete, compact, or reword any existing content; do not touch
the ledger or open questions; do not commit or push. Set `Last updated` to
2026-09-10. Verify done by confirming the line count grew by exactly the
inserted lines.

**Shared report.** In the report file: the status chosen and why; owner;
best-guess paired downstream document or `none`; the five facts an agent
resuming this work most needs; any internal contradictions found; the exact
`wc -l` before and after.

### Brief: cs-adaptive-flow
- Repository: this repository
- Task: shared task on `docs/working/adaptive-flow-training-roadmap.md`
- Required reads: this document's Header block and Section order; the whole target
- Owns (may edit): `docs/working/adaptive-flow-training-roadmap.md`
- Must not touch: any other file
- Definition of done: shared task complete; report written
- Report to: docs/working/agent-working-doc-protocol/reports/cs-adaptive-flow.md

### Brief: cs-render-data
- Repository: this repository
- Task: shared task on `docs/working/automation-studio-render-data-separation-plan.md`
- Required reads: as above; the whole target
- Owns (may edit): that file only
- Must not touch: any other file
- Definition of done: shared task complete; report written
- Report to: docs/working/agent-working-doc-protocol/reports/cs-render-data.md

### Brief: cs-scalable-data
- Repository: this repository
- Task: shared task on `docs/working/automation-studio-scalable-data-architecture-plan.md`
- Required reads: as above; the whole target
- Owns (may edit): that file only
- Must not touch: any other file
- Definition of done: shared task complete; report written
- Report to: docs/working/agent-working-doc-protocol/reports/cs-scalable-data.md

### Brief: cs-runtime-debug-ui
- Repository: this repository
- Task: shared task on `docs/working/automation-studio-runtime-debug-ui-cleanup.md`
- Required reads: as above; the whole target
- Owns (may edit): that file only
- Must not touch: any other file
- Definition of done: shared task complete; report written
- Report to: docs/working/agent-working-doc-protocol/reports/cs-runtime-debug-ui.md

### Brief: cs-ui-ux-upgrade
- Repository: this repository
- Task: shared task on `docs/working/ui-ux-upgrade-audit-plan.md` (5,944 lines; read it in sections)
- Required reads: as above; the whole target
- Owns (may edit): that file only
- Must not touch: any other file
- Definition of done: shared task complete; report written
- Report to: docs/working/agent-working-doc-protocol/reports/cs-ui-ux-upgrade.md

### Brief: cs-web-panel-ui-ux
- Repository: this repository
- Task: shared task on `docs/working/web-panel-ui-ux-functionality-audit-plan.md`
- Required reads: as above; the whole target
- Owns (may edit): that file only
- Must not touch: any other file
- Definition of done: shared task complete; report written
- Report to: docs/working/agent-working-doc-protocol/reports/cs-web-panel-ui-ux.md

---

## Work Ledger

### 2026-09-10 — Protocol authored and adopted in both repositories

- Agent: supervisor
- Changed: `docs/working/agent-working-doc-protocol.md`,
  `docs/working/README.md`, `AGENTS.md`, and the mirrored trio in
  `F:\!FluxIQWebExtension`.
- Why: Working documents were already serving as agent memory without a format
  that made them readable, indexable, or safe for parallel worker writes.
- Validation: `wc -l` and `git ls-files docs/working` across both repositories
  -> 23 tracked documents here and 5 downstream, 19 of them over 800 lines.
  Documentation-only change, so no build or test check applies.
- Outcome: Accepted
- Follow-up: Phase 2 triage of `Unclassified` documents.

### 2026-09-10 - Role model, push policy, and AGENTS.md role scoping

- Agent: supervisor
- Changed: `AGENTS.md`, this protocol, and the downstream equivalents.
- Why: The user defined the senior supervisor / worker split, asked the
  supervisor to push `dev` on its own after validated work, and flagged that
  agent instruction files were too large to be mandatory reading for every
  agent.
- Validation: every internal link target and the `#repository-boundary`
  anchor resolved by file check; `wc -l AGENTS.md` -> 266 here and 277
  downstream. Documentation only, so no build or test check applies.
- Outcome: Accepted
- Follow-up: Phase 2 triage of `Unclassified` documents.

### 2026-09-10 — Rollout Phases 2 and 5: triage and retirement

- Agent: supervisor
- Changed: conforming header blocks inserted on 17 documents — the 10
  previously `Unclassified` (now 5 Complete, 5 Paused), the 6 Superseded
  Automation Studio plans, and `automation-studio-element-target-fingerprints-plan.md`
  (Complete). Each document's original status wording is preserved in
  `Status detail`; loose metadata lines directly under the H1 were replaced
  by the block, and the 2026-08-29 historical notices were kept.
- Why: Every document needs a machine-readable status before the index can
  be derived from headers rather than maintained by hand. Statuses were set
  from each document's own ledger: Complete where its phases or steps are
  all marked done, Paused where unfinished items remain with no activity
  since before 2026-09-01.
- Validation: the insertion script printed before/after line counts for all
  17; three headers were read back — superseded notice preserved, a wrapped
  `Scope` folded correctly, loose metadata replaced. Documentation only.
- Outcome: Accepted
- Follow-up: Phase 3 retrofits by workers; regenerate the index from headers.

### 2026-09-10 — Rollout Phase 3: Current State retrofits

- Agent: supervisor, with workers cs-adaptive-flow, cs-render-data,
  cs-scalable-data, cs-runtime-debug-ui, cs-ui-ux-upgrade, cs-web-panel-ui-ux
- Changed: six `Active` documents gained a header block and `Current State`
  (+151, +116, +151, +35, +63, +50 lines); six reports under
  `agent-working-doc-protocol/reports/`; index regenerated from headers.
- Why: Every `Active` document needs an authoritative `Current State` an
  agent can read without reconstructing it from history.
- Validation: each retrofit checked by script — eight header fields in
  order, `Current State` directly after the header and under 150 lines,
  `git diff` additions-only in one hunk at the top. Three needed a
  supervisor fix before passing: two omitted the blank line after the H1,
  one wrapped `Scope` onto a second line. `ui-ux-upgrade-audit-plan.md`
  showed CRLF in the working copy; the committed file has none and
  `git diff` reports 63/0, so repository content is unaffected. A
  cross-contamination grep between the two workers that shared a scratch
  file returned 0 hits each way.
- Outcome: Accepted
- Follow-up: compaction on touch; unique scratch filenames in briefs.

### 2026-09-10 — Worker scratch-file rule added

- Agent: supervisor
- Changed: "Worker briefs and reports" gained a bullet requiring unique,
  worker-owned filenames and forbidding shared scratch files; mirrored in
  both repositories. Header fields in this document are unwrapped to one
  line each, as the header rule requires and the audit now enforces.
- Why: Two workers sharing one scratch file overwrote each other's staged
  block during the Current State retrofits; targets were verified
  unaffected.
- Validation: the bullet is present in both copies; `pnpm structure:check
  --rule working-docs` reports zero header findings. Documentation only.
- Outcome: Accepted
- Follow-up: none.

---

## Open Questions

- **Where does this protocol live long term?** It is a standing convention,
  not a plan, so `docs/architecture/` may be its eventual home. Kept in
  `docs/working/` for now because that is where agents are already told to
  look. Owner: user.
- **Should the 800-line cap be enforced mechanically?** A documentation lint
  could flag oversized or badly headed working documents. Deferred until the
  protocol has survived real use. Owner: senior supervisor agent.
