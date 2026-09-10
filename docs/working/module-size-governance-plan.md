# Module Size Governance Plan

Status: Active
Status detail: Plan authored; the ratchet check and the service.ts
decomposition are both unimplemented.
Created: 2026-09-10
Last updated: 2026-09-10
Owner: Senior supervisor agent
Scope: Preventing unbounded file and class growth across FluxIQ Core and the
downstream web-extension repository, and decomposing the files that already
grew past the point of maintainability.
Paired document: `F:\!FluxIQWebExtension\docs\working\module-size-governance-plan.md`
Related: [AGENTS.md](../../AGENTS.md),
[agent working document protocol](./agent-working-doc-protocol.md)

This document owns the shared size policy. The downstream repository's paired
document references it rather than restating it, and covers only its own
offenders and wiring.

---

## Current State

**Nothing is implemented yet.** This is a plan.

**The measured problem.** `packages/fluxiq/src/programs/automation-studio/runtime/service.ts`
is 12,482 lines. It contains one class, `AutomationStudioService`, spanning
lines 804 to roughly 11,762 with **419 methods**, plus 50 exported types, one
exported function, and 41 imports. It has been revised 43 times and accounts
for 11.6 MB of the repository's git history — the single largest contributor.

**The problem is concentrated, not endemic.** Of 1,196 tracked source files
here, three exceed 2,000 lines and four more exceed 1,000. Downstream, one of
287 files exceeds 2,000. This is a small number of specific failures, not a
codebase-wide culture problem, which means it is fixable cheaply.

**The critical finding.** A rule against this already exists and did not
work. `AGENTS.md` states: "Split modules when a file owns unrelated behavior,
crosses multiple architectural responsibilities, or becomes difficult to
understand, test, replace, or debug independently. Do not accumulate
unrelated functionality in broad catch-all files." That instruction was in
force while this file grew to 419 methods across 43 commits. **Written
guidance alone has been empirically falsified as a control here.** Any plan
that consists of writing a better rule will fail the same way.

**The consequence is therefore mechanical enforcement**, described in
[The Ratchet](#the-ratchet). Detection has to happen in `pnpm check`, where
it blocks, rather than in a document an agent may or may not read.

**Next steps**

1. Implement the ratchet check and baseline. Small, self-contained, no
   product risk. Do this first and independently of anything else.
2. Do **not** decompose `service.ts` during the MVP cycle — see
   [Timing](#timing-and-mvp-conflict). The ratchet freezes it; the split
   waits.
3. Decide on CodeGraph after a time-boxed trial — see
   [CodeGraph Assessment](#codegraph-assessment).

**Blockers:** none.

---

## The Ratchet

A size budget that permits existing violations but forbids them from growing.
This avoids a large refactor while making the problem strictly monotonic —
it can only ever get better.

**Rules**

1. Any source file **not** in the baseline may not exceed **800 lines**. The
   check fails.
2. A file **in** the baseline may not exceed its recorded line count. It may
   shrink freely.
3. When a baselined file shrinks, its baseline entry is rewritten downward in
   the same commit. It can never be raised.
4. Warn, but do not fail, above **400 lines**. This is the signal that a
   module is drifting before it becomes expensive to fix.
5. A class may not exceed **40 methods**. Warn at 25.

Rule 3 is what makes it a ratchet rather than a static allowlist. Rule 5
exists because line count alone would not have caught `AutomationStudioService`
early — a 419-method class is the actual defect, and it was a defect long
before it was 12,000 lines.

**Implementation**

- `scripts/size-audit.mjs`, invoked from `pnpm check` so it runs in the same
  place as type checking and cannot be skipped by an agent that did not read
  the instructions.
- `.size-baseline.json` at the repository root, tracked in git, mapping path
  to permitted line count. Generated once, then only ever ratcheted down.
- Scope: tracked `.ts`, `.tsx`, `.mjs`, and `.js` files, excluding
  `node_modules`, build outputs, and generated directories.
- Exit non-zero on violation with the offending path, current count, and
  permitted count, so the failure is self-explanatory without opening docs.

**Expected initial baseline here:** seven files over 1,000 lines, of which
three exceed 2,000. Everything else falls under the 800-line rule
immediately.

---

## service.ts Decomposition

**Do not start this during the MVP cycle.** Recorded now so the intended
shape is not rediscovered later.

The method-name distribution shows the seams clearly. Grouping the 419
methods by verb prefix:

| Concern | Methods | Prefixes |
| --- | --- | --- |
| Retrieval | 84 | `list` (51), `get` (33) |
| Persistence | 108 | `write` (39), `read` (25), `delete` (25), `save` (14), `append` (9) |
| Flow domain | 32 | `flow` |
| Validation | 22 | `ensure` (14), `assert` (7) |
| Lifecycle | 15 | `apply` (8), `review` (4), `migrate` (4) |
| Recording | 7 | `recording` |
| Binding | 7 | `bind` |
| Project | 6 | `project` |

**Target shape: a thin facade over focused collaborators.**
`AutomationStudioService` keeps its public surface exactly as it is and
delegates to collaborators. The 50 exported types stay where they are, or
move to a sibling `types.ts` re-exported from the same path.

This matters because the class is imported across at least ten program
modules. Changing its public surface would ripple through
`automation-studio/api`, `client-gateway`, `background-tasks`,
`compute-control`, `database-manager`, and `deployment-sync`. A facade split
touches none of them, which is the difference between a background task and
a migration.

**Sequence.** One collaborator at a time, each landing independently with
tests green and the ratchet recording the reduction. Persistence first: it is
the largest group, the most mechanical, and the least entangled with flow
semantics. Retrieval second. The domain groups last, since they carry the
most behavior.

---

## Timing And MVP Conflict

Core's `AGENTS.md` and the MVP instructions both argue against doing this
now, and they are right:

- The MVP refactor rule permits refactoring only when architecture blocks a
  requirement, causes serious reliability problems, produces active bugs, or
  makes required functionality unreasonably hard to add. A large file is
  none of those by itself.
- "Working and understandable beats theoretically perfect" during the MVP
  cycle.
- Week 4 is an explicit feature freeze.

A 12,000-line refactor of the class that every program imports, during the
weeks meant to prove the adaptation loop, would risk the MVP to fix a
maintainability problem that is not currently blocking anything.

**So: install the ratchet now, decompose later.** The ratchet costs an
afternoon, blocks all further degradation, and carries no product risk. The
decomposition is post-MVP work, or opportunistic — if a task requires
substantial edits inside one of the concern groups above, extracting that
group first is justified on its own terms.

---

## CodeGraph Assessment

`https://github.com/colbymchenry/codegraph` — verified: 70,403 stars, 4,500
forks, MIT, created 2026-01-18, last push 2026-09-09,
`@colbymchenry/codegraph@1.6.0` on npm published 2026-08-26. Real, popular,
actively developed.

It builds a local SQLite knowledge graph of a codebase using tree-sitter and
exposes it to agents over MCP, so an agent queries for symbols, callers, and
call paths instead of grepping and reading files.

**Where it would genuinely help here.** Tracing call paths into a 419-method
class is exactly the task it is built for, and impact analysis before a change
matches the existing instruction to trace a pipeline end-to-end before
modifying it. It would also reduce the pressure on worker agents to read
broadly when a brief is thin.

**Four reservations, in order of importance.**

1. **It does not solve this problem.** CodeGraph makes a large codebase
   cheaper to navigate. It does nothing to stop a file reaching 12,482 lines.
   If anything it works against that, by removing the friction that would
   otherwise make an oversized module painful enough to split. It is
   complementary to the ratchet, never a substitute.
2. **Cross-repository work is where it would help most and probably will not.**
   It indexes per project. FluxIQ Core and the web extension are linked by
   filesystem `link:` dependencies, so the hardest work — tracing a contract
   from `domain` through to Core — spans two indexes. Expect two disconnected
   graphs.
3. **Windows is a second-class platform for the project.** Of 79 open
   Windows-tagged issues, a cluster concerns its own test suite on Windows:
   temp-directory leaks (~170 per run, 49,646 accumulated), POSIX assumptions
   such as a live PID 1, V8 out-of-memory crashes in the Windows test pool,
   and one issue stating a failing test is "a hard blocker" preventing
   Windows builds from being promoted. These are the project's CI problems
   rather than proven runtime failures for users, but weak Windows CI means
   Windows regressions are less likely to be caught before release. This
   environment is native Windows 10, and both repository paths begin with
   `!`, which is unusual enough to warrant explicit verification.
4. **Context cost.** The project's own documentation notes it leaves roughly
   80% more retrieval context resident at session end. That is in direct
   tension with the recent decision to scope required reading by agent role
   precisely to conserve context.

**Recommendation.** Worth a time-boxed trial, on Core only, since that is
where 1,196 files and the god class live. Verify first that it indexes a path
containing `!` and that the file watcher behaves on an `F:` drive. Judge it on
whether it actually reduces tool calls on a real task, not on the README's
benchmarks. It is independent of the ratchet — do not let evaluating it delay
that.

---

## Work Ledger

### 2026-09-10 — Plan authored

- Agent: supervisor
- Changed: this document and its downstream pair.
- Why: A 12,482-line, 419-method class reached production while an
  instruction forbidding exactly that was already in force, so the failure is
  one of enforcement rather than of policy.
- Validation: measurements taken directly — `wc -l` across tracked source
  files in both repositories, `grep` counts of exports and methods in
  `service.ts`, per-path history size via `git rev-list --objects --all`,
  and CodeGraph metadata from the GitHub API and `npm view`. Plan only, so
  no code check applies.
- Outcome: Accepted
- Follow-up: Implement the ratchet check and baseline.

---

## Open Questions

- **Should the 800-line limit apply to test files?** `service.test.ts` is
  4,790 lines, and large table-driven test files are less harmful than large
  implementation files. Proposal: apply the ratchet to tests but with a
  1,500-line ceiling for new ones. Owner: senior supervisor agent.
- **Should the working-document 800-line compaction threshold and this
  source-file threshold share one tool?** Both are size ratchets over tracked
  files. Owner: senior supervisor agent.
