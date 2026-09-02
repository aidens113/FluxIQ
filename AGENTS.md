# Agent Instructions

## Workflow Modes

For every user prompt, the agent must attempt to classify the requested work
into one of the following workflow modes. Classification should follow the
user's intent and the newest instruction takes precedence when the requested
mode changes. These are repository workflow modes, not Codex product or
collaboration-mode settings.

In the first user-facing response after each new user prompt, state the active
workflow mode using `Mode: <mode name>`. If more than one mode is active, list
them in execution order. Do not repeat the mode label in every follow-up or
substantive progress update for the same prompt. When transitioning modes
during a task, announce the new mode once in the next progress update.

If the agent is genuinely unsure which mode the user intends, ask the user to
choose or clarify the mode before beginning substantive work. The agent may
still perform minimal inspection needed to explain the ambiguity, but must not
silently choose a broad planning or implementation workflow when that choice
could conflict with the user's intent.

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

### 2. Execute Plan With Subagents

Use this mode when the user asks to implement an existing plan, complete its
phases, or explicitly requests subagents.

- Read the current working document before assigning work.
- Divide independent phases or steps among subagents when subagents are
  available and parallel work is safe.
- The primary agent owns coordination, integration, conflict resolution,
  review, validation, and the final result; subagent completion reports are not
  sufficient verification by themselves.
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
  based only on compilation or a subagent's completion report.
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
