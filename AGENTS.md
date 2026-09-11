# Agent Instructions

## Agent Roles

**Senior supervisor agent** — the agent the user prompts directly. It owns
coordination, delegation, integration, verification, and the final result. It
declares the workflow mode, maintains working documents, and is the only role
that commits or pushes.

**Worker** — any agent invoked by another agent rather than by the user. A
worker executes one bounded brief, writes back to its own report file, and
reports what it did and did not verify. Workers never declare a mode, never
edit a shared document, and never commit or push.

A worker's completion report is a claim, not verification. The supervisor
confirms the result itself before treating it as done.

## Start Here

What you read depends on your role. Context is a budget; do not spend it on
documents your task will not use.

**Senior supervisor agent.** Read this file. Before touching work already in
progress, read the [working document index](docs/working/README.md), then the
`Current State` section of the relevant document. Read
[code structure](docs/architecture/code-structure.md) before creating,
moving, or splitting source files.

**Worker.** Read your brief, the files it names, and the `Current State` of
the working document it points to. Read nothing else unless your brief says
to. If the brief is not enough to do the work correctly, say so instead of
reading broadly. A worker sent from the downstream FluxIQ Web Extension
repository must also read [Repository Boundary](#repository-boundary).

**Both roles.** Repository Boundary, Code Structure, Documentation
Maintenance, and Validation below are binding whether or not you read the
background documents.

Re-read background documents only when the task changes scope or the user
asks for their current guidance.

## Working Documents Are Agent Memory

Agent context does not survive a session, and workers share no context with
each other or with the supervisor. Documents under `docs/working/` are the
only channel through which one agent's knowledge reaches the next.

- Record findings, decisions, and validation results as the work happens, not
  as an end-of-task summary.
- Brief every worker in writing before dispatch; each writes back to its own
  report file. Partition briefs by file, never by topic. If two briefs need
  the same file, the work is serial.
- Commit working document updates with the work that changed them.

The [agent working document protocol](docs/working/agent-working-doc-protocol.md)
defines layout, status vocabulary, ledger format, compaction, brief format,
and cross-repository pairing. Read it when creating or restructuring a working
document, not for routine updates. Its normative sections are mirrored
verbatim in the downstream repository; change both in the same work unit.

## Workflow Modes

The supervisor classifies each user prompt into one mode below and states it
in the first user-facing response as `Mode: <mode name>`. If more than one
applies, list them in execution order. Do not repeat the label in later
updates for the same prompt; announce a transition once when it happens.
Workers do not declare modes.

Follow the user's intent; the newest instruction takes precedence. If the
intended mode is genuinely unclear, ask before substantive work. Minimal
inspection to explain the ambiguity is allowed; silently choosing a broad
planning or implementation mode that could conflict with the user's intent
is not.

### 1. Plan And Write Working Doc

For investigation, audit, design, scoping, or planning before implementation.

Inspect the relevant implementation and documentation first. Create or update
a document under `docs/working/` recording findings, decisions, dependencies,
risks, validation requirements, and implementation phases and steps, concrete
enough that another agent can execute it without rediscovering the intended
architecture. Do not begin broad implementation unless the user also asks for
it; small probes needed to make the plan accurate are allowed.

### 2. Execute Plan With Workers

For implementing an existing plan, completing its phases, or when the user
asks for subagents.

- Read the current working document before assigning work.
- Divide independent phases among workers where parallel work is safe,
  partitioning by file.
- The supervisor owns coordination, integration, conflict resolution, review,
  validation, and the final result.
- Update the working document as each step is assigned, completed, validated,
  blocked, or revised, and record the results of checks run.
- Continue through every requested phase unless the user pauses the work or a
  genuine blocker requires user input.

### 3. Editing, Iteration, And Bug Fixes

For focused implementation, UI refinements, regressions, debugging, test
failures, and incremental changes that do not require executing a full plan.

Reproduce or inspect current behaviour before changing code whenever feasible.
Trace bugs to their cause instead of patching symptoms. Keep edits scoped,
preserve established architecture, and add or update tests in proportion to
risk. Validate the affected behaviour directly, including live browser testing
when the user requests it and the panel is available. Update authored
documentation when the change is substantial; a new working document is not
required for every focused edit.

### 4. Testing And Live Validation

For testing existing behaviour, verifying completed work, reproducing a
problem live, operating the web panel for a testing session, or making the
application available for interactive testing.

- Establish the expected behaviour, then choose the narrowest useful
  combination of automated, integration, browser, performance, and manual
  tests.
- Inspect actual results. Do not report success from compilation alone or
  from a worker's report.
- For browser behaviour, test live when the tooling and environment allow.
- Preserve user data. Avoid destructive fixture resets unless the user has
  requested or approved them; prefer isolated test data and clean up
  artifacts created solely by automated tests when safe.
- Record exact failures, reproduction steps, environment details, and
  measured results. Distinguish verified behaviour from assumptions.
- This mode does not authorize broad product changes. If testing exposes a
  defect the user wants fixed, move to mode 3, then return here to verify.

If a prompt spans modes, begin with the earliest necessary one and announce
each transition.

### Delegation

Delegate to a worker when the task needs more than about five files read
whose content the supervisor will not need afterwards, when a run-fix-rerun
loop is expected, when edits are bulk and partitionable by file, or when
independent pieces touch no common file. Keep with the supervisor one- or
two-file edits it already understands, verification of worker claims,
integration, conflict resolution, and anything that needs the user's
conversation context. Dispatch has fixed overhead and a worker's claim still
needs verifying, so reads are the cost: route discovery through a worker or
`Explore` and read the conclusion. Briefs follow the protocol format, at most
40 lines; the worker's final message follows the protocol's return contract.

## Repository Boundary

FluxIQ is a public, domain-neutral framework. Do not add domain-specific
automation code, private project data, generated private policies,
recordings, or downstream domain assets. Global framework programs live under
`packages/fluxiq/src/programs/`; domain-specific programs live in importing
repositories under their configured domain program root. Framework code never
imports a downstream domain. The internal area ownership table is in the
[architecture README](docs/architecture/README.md); public package boundaries
are in [package boundaries](docs/architecture/package-boundaries.md).

## Code Structure

Full methodology: [code structure](docs/architecture/code-structure.md).
The binding rules:

- **Placement is a procedure.** Every source file's path is
  ownership / layer / feature / kind, decided in that order. Do not place a
  file where it is convenient.
- **A shared filename prefix is a directory.** Three or more files sharing a
  `noun-` prefix become `noun/` with the prefix stripped.
- **One exported thing per file**, named for that thing. No `utils`,
  `helpers`, `misc`, or `common`.
- **Every directory has an `index.ts` barrel**; imports target the directory.
  Reorganizing inside a layer must leave the layer's `index.ts` exports
  unchanged.
- **Tests live in a `tests/` subfolder of the directory that owns their
  subject.** `a/b.ts` is covered by `a/tests/b.test.ts`. Never loose beside
  source; never in a separate mirrored tree. Test support that ships —
  exported publicly or imported by non-test code — is source and stays in
  `src/<area>/testing/`.
- **Never extract-and-drop.** Code pulled out of a large file goes where the
  placement procedure puts it, not beside the file it came from.

**Enforcement.** `scripts/structure-audit.mjs` runs first in `pnpm check`
and fails the build. It checks every rule above that a machine can check:
file length (800 lines), directory size (25 source files), class size (40
methods), exported values per file (one class, one component, at most 15
values), test placement (a test file must sit directly in a `tests/` or
`e2e/` directory), path depth (8 segments), banned names, shared-prefix
groups of three or more files, imports that reach past a directory's barrel,
imports that cross a declared boundary, and the working-document header,
`Current State`, size, and index rules. Existing violations are frozen per
rule in `.structure-baseline.json`; an entry may shrink but never grow, and
a new violation fails outright. Run `pnpm structure:baseline` after removing
one, and `pnpm structure:check --rule <id>` to run a single rule (`--list`
names them). What the audit cannot check — placement judgement,
extract-and-drop, whether a split was the right cut — remains a review
obligation. When a file nears a limit, diagnose why it grew before cutting;
the methodology lists the cut for each cause.

## Documentation Maintenance

After a substantial change, update authored documentation in the same work
unit unless the user says not to. Substantial means: global program behaviour
or UI; framework setup or folder layout; persistence, database, or migration;
authentication, authorization, or privileged actions; input/output contracts;
generated-documentation behaviour; Automation Studio architecture or model.

When the user asks for documentation, it is required work, not a follow-up.
Current-state design lives in `docs/architecture/`; task plans live in
`docs/working/`. Generated docs under `docs/generated/` are inventory, not a
substitute for authored intent.

## Validation

Before the final response for a code change, run the relevant checks and
read their output:

```bash
pnpm check     # structure audit, then per-package type checks
pnpm test
pnpm build
```

Use `pnpm structure:check` to run the audit alone.

Do not start the web panel unless the user has explicitly authorized panel
management for the session. When authorized, manage it and keep any server
the user's live test needs running, giving its local URL and relevant state
without exposing unrelated secrets. Otherwise tell the user to run
`pnpm --filter @fluxiq/web dev` themselves.

## Committing And Pushing

Only the supervisor commits or pushes.

Push `dev` without being asked when all of the following hold:

1. The work is a complete, coherent unit, not a partial refactor or an
   experiment left mid-flight.
2. The relevant checks were run and observed to pass. Compilation alone, or a
   worker's report, does not qualify.
3. Nothing known to be broken is included.

When a change spans this repository and the downstream FluxIQ Web Extension
repository, push both `dev` branches in the same work unit and say so. A
framework change that downstream code depends on must not sit unpushed while
the downstream change ships.

Otherwise commit locally and say what is holding the push. Always state what
was pushed and what was not.

Require explicit user approval every time for: pushing to `main` or opening a
pull request into it; any force-push; any history rewrite, including
`filter-repo`, interactive rebase, and amending pushed commits; deleting
remote branches or tags.

Never commit secrets, private project data, recordings, or generated runtime
state. Never use `--no-verify`.
