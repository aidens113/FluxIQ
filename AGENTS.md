# Agent Instructions

## Agent Roles

**Senior supervisor agent** — the agent the user prompts directly. It owns
coordination, delegation, integration, verification, and the final result. It
declares the workflow mode, maintains working documents, and is the only role
that commits and pushes.

**Worker** — any agent invoked by another agent rather than by the user. A
worker executes one bounded brief, writes back to its own report file, and
reports honestly on what it did and did not verify. Workers never declare a
mode, never edit a shared document, and never commit or push.

A worker's completion report is a claim, not verification. The supervisor
confirms the result itself before treating it as done.

## Start Here

What you need to read depends on your role. Context is a budget; do not
spend it on documents your task will not use.

**Senior supervisor agent.** Read this file, then the
[working document index](docs/working/README.md) and the `Current State`
section of the relevant document before touching work already in progress.

**Worker.** Read your brief, the files it names, and the `Current State` of
the working document it points to. Do not read the rest of a working document
or the rest of this file unless your brief says to. If your brief is not
enough to do the work correctly, say so instead of reading broadly. A worker
sent here from the downstream FluxIQ Web Extension repository should also
read the [Repository Boundary](#repository-boundary) section, since keeping
this framework domain-neutral is the constraint most easily broken from
outside.

**Both roles.** The repository boundary, documentation, and validation rules
in this file are binding whether or not you read the background documents.

Re-read background documents only when the task changes scope or the user
asks for their current guidance.

## Working Documents Are Agent Memory

Agent context does not survive a session, and workers share no context with
each other or with the supervisor. Documents under `docs/working/` are the
only channel through which one agent's knowledge reaches the next.

- Record findings, decisions, and validation results as the work happens, not
  as an end-of-task summary.
- Brief every worker in writing before dispatch; each writes back to its own
  report file. Partition briefs by file, never by topic.
- Commit working document updates with the work that changed them.

The [agent working document protocol](docs/working/agent-working-doc-protocol.md)
defines layout, status vocabulary, ledger format, compaction, brief format,
and cross-repository pairing. Read it when creating or restructuring a working
document, not for routine updates. Its normative sections are mirrored
verbatim in the downstream repository; a change to either must be mirrored in
the same work unit.

## Workflow Modes

The senior supervisor agent classifies each user prompt into one of the modes
below and states it in the first user-facing response as `Mode: <mode name>`,
listing several in execution order if more than one applies. Do not repeat
the label in later follow-ups or progress updates for the same prompt, but
announce a transition once when it happens. Workers do not declare modes.
Classification follows the user's intent, and the newest instruction takes
precedence.

If you are genuinely unsure which mode the user intends, ask them to choose
or clarify before beginning substantive work. Minimal inspection needed to
explain the ambiguity is allowed, but do not silently choose a broad planning
or implementation workflow when that choice could conflict with the user's
intent. These are repository workflow modes, not Codex product or
collaboration-mode settings.

### 1. Plan And Write Working Doc

Use this mode when the user asks to investigate, audit, design, scope, or plan
work before implementation.

- Inspect the relevant implementation and documentation before proposing work.
- Create or update an authored working document under `docs/working/`.
- Record findings, decisions, dependencies, risks, validation requirements, and
  detailed implementation phases and steps.
- Keep the document concrete enough that another agent can execute it without
  having to rediscover the intended architecture.
- Do not begin broad implementation unless the user also asks to execute the
  plan. Small investigative changes or probes are allowed when needed to make
  the plan accurate.

### 2. Execute Plan With Workers

Use this mode when the user asks to implement an existing plan, complete its
phases, or explicitly requests subagents.

- Read the current working document before assigning work.
- Divide independent phases or steps among workers when parallel work is
  safe, partitioning by file. If two briefs need the same file, the work is
  serial.
- The supervisor owns coordination, integration, conflict resolution, review,
  validation, and the final result.
- Update and reference the working document as each step or phase is assigned,
  completed, validated, blocked, or revised.
- Continue through every requested phase unless the user pauses the work or a
  genuine blocker requires user input.
- Run the relevant checks and record their results in the working document.

### 3. Editing, Iteration, And Bug Fixes

Use this mode for focused implementation requests, UI refinements, regressions,
debugging, test failures, and incremental changes that do not require execution
of a full working plan.

- Reproduce or inspect the current behavior before changing code whenever
  feasible.
- Trace bugs to their underlying cause instead of applying symptom-specific
  workarounds.
- Keep edits scoped, preserve established architecture, and add or update tests
  proportional to the risk.
- Validate the affected behavior directly, including live browser testing when
  the user requests it and the panel is available.
- Update existing authored documentation when the change is substantial under
  the documentation rules below; a new working document is not required for
  every focused edit.

### 4. Testing And Live Validation

Use this mode when the user asks to test existing behavior, verify completed
work, reproduce a problem live, operate the web panel for a testing session, or
make the application available for the user to test interactively.

- Establish the expected behavior and select the narrowest useful combination
  of automated, integration, browser, performance, and manual tests.
- Run relevant checks and inspect their actual results; do not report success
  based only on compilation or a worker's completion report.
- When browser behavior is involved, perform live browser testing when the
  required browser tooling and environment are available.
- The agent may start, stop, or restart the panel only when the user has
  explicitly authorized panel management for the current session. Keep any
  server required for the user's live testing running and provide its local URL
  and relevant test state or credentials without exposing unrelated secrets.
- Preserve user data and avoid destructive fixture resets unless the user has
  requested them or approved the impact. Prefer isolated test data and clean up
  artifacts created solely by automated tests when safe.
- Record exact failures, reproduction steps, environment details, and measured
  results. Clearly distinguish verified behavior from remaining assumptions.
- Testing mode does not authorize broad product changes by itself. If testing
  exposes a defect and the user has requested a fix, transition to Editing,
  Iteration, And Bug Fixes, then return to Testing And Live Validation to verify
  the repair.

If a prompt spans multiple modes, begin with the earliest necessary mode and
transition explicitly as the work advances. When intent is ambiguous, infer the
most practical mode from context when confidence is high. Otherwise, ask the
user to clarify before proceeding.

## Engineering Structure And Modularity

- Organize functionality into folders and files according to strict, cohesive
  responsibilities. A function, class, component, service, store, query owner,
  or adapter should live with the narrowly defined capability it implements.
- Split modules when a file owns unrelated behavior, crosses multiple
  architectural responsibilities, or becomes difficult to understand, test,
  replace, or debug independently. Do not accumulate unrelated functionality in
  broad catch-all files.
- Keep public boundaries explicit. Prefer small, composable modules with clear
  inputs, outputs, ownership, and dependency direction over implicit coupling
  through shared mutable state or oversized coordinator components.
- Design for modularity from the beginning and preserve it during iteration.
  New behavior should extend the responsible module or introduce a focused new
  module rather than being inserted wherever it is most convenient.
- Use the Automation Studio structure as repository-local inspiration for
  capability folders, model/query/command separation, view ownership, and
  focused tests. Follow the actual domain responsibility and existing local
  architecture rather than copying its folder names mechanically.
- Keep tests near or clearly associated with the module whose contract they
  protect. Cross-module integration tests should validate explicit boundaries
  rather than compensate for unclear ownership.

## Repository Boundary

FluxIQ is a public, domain-neutral framework repository. Do not add
domain-specific automation code, private project data, OSRS-specific behavior,
generated private policies, recordings, or downstream domain assets here.

Global framework programs belong under:

```text
packages/fluxiq/src/programs/
```

Domain-specific programs belong in importing repositories under their configured
domain program root.

## Documentation Maintenance

After substantial framework changes, update authored documentation in the same
work unless the user explicitly says not to.

Substantial changes include:

- global program behavior or UI changes;
- framework setup or folder layout changes;
- persistence, database, or migration changes;
- authentication, authorization, or privileged action changes;
- input/output contract changes;
- generated documentation behavior changes;
- Automation Studio architecture or model changes.

When the user directly asks for documentation updates, treat that as required
work, not a follow-up suggestion.

Generated docs under `docs/generated/` are useful inventory, but authored docs
must explain intent, ownership, behavior, and planned work.

## File And Directory Structure

These budgets are enforced by `scripts/structure-audit.mjs`, which runs as
the first step of `pnpm check` and fails the build. Existing violations are
recorded in `.structure-baseline.json`; a baselined entry may shrink but
never grow, and new files and directories must satisfy the limit outright.

- **800 lines per file** (advisory warning at 400).
- **25 source files per directory** (advisory warning at 15).
- **40 methods per class** (advisory only — the check is a heuristic).
- **One exported thing per file**: one class, one component, or one cohesive
  function group.
- **A shared filename prefix becomes a directory.** When three or more files
  in a directory share a `noun-` prefix, make it a subdirectory and strip the
  prefix from the filenames.
- **Every directory has an `index.ts` barrel**, and imports target the
  directory rather than individual files. This is what makes moving a file
  invisible to its consumers.

When a file approaches a limit, split it by diagnosing why it grew — a god
class, oversized function bodies, a declaration dump, and a multi-component
module each need a different cut. The
[module size governance plan](docs/working/module-size-governance-plan.md)
describes each pathology, the corresponding fix, and the target layout.

Run `pnpm structure:baseline` after shrinking a baselined file, to record the
improvement.

## Validation

For code changes, run the relevant checks before final response whenever
feasible:

```bash
pnpm check
pnpm test
pnpm build
```

Do not run the web panel by default. When the user explicitly asks the agent to
start, stop, or restart it, the agent may manage the panel for that session.
Otherwise, tell them to run it manually with:

```bash
pnpm --filter @fluxiq/web dev
```

## Committing And Pushing

Only the senior supervisor agent commits or pushes. Workers never do.

Push `dev` without being asked once all of the following hold:

1. The work is a complete, coherent unit — not a partial refactor or an
   experiment left mid-flight.
2. The relevant checks were actually run and observed to pass. Compilation
   alone, or a worker reporting success, does not qualify.
3. Nothing known to be broken is included.

When a change spans this repository and the downstream FluxIQ Web Extension
repository, push both `dev` branches in the same work unit so the two sides
do not drift, and say so. A framework change that downstream code depends on
must not sit unpushed while the downstream change ships.

Otherwise: commit locally and explain what is holding the push. Always state
what was pushed and what was not.

These actions still require explicit user approval every time:

- pushing to `main`, or opening a pull request into it;
- force-pushing anything;
- rewriting history, including `filter-repo`, `rebase -i`, and amends to
  already-pushed commits;
- deleting branches or tags on the remote.

Never commit secrets, private project data, recordings, or generated runtime
state. Never use `--no-verify`.
