# Migration Plan

The migration starts by preserving concepts, not source files.

## Phase 1: Framework Skeleton

- Create the TypeScript monorepo and Next.js app.
- Define contracts for domains, programs, components, flows, runtime sessions,
  data repositories, auth, compute, and Automation Studio.
- Add the `FluxIQ` host-project bootstrap class so downstream repos can create
  framework folders and register domains.
- Add domain-boundary documentation and repository hygiene rules.

## Phase 2: Flow Foundation

- Implement typed flow parsing and serialization.
- Add flow validation tests.
- Implement a minimal runner with deterministic node transitions.
- Add target-neutral components such as noop, wait, variables, logging, and
  data access.

## Phase 3: Automation Studio Core

- Port task, routine, interface, recording, narration, and dynamic policy models
  into TypeScript.
- Build file-backed repositories for local development.
- Add API routes for listing, loading, saving, and validating documents.
- Keep all generated recordings and policies out of the public repository.

## Phase 4: Control Panel UI

- Port the old React UI into Next.js in smaller modules.
- Split Automation Studio into focused panels, hooks, graph helpers, and API
  clients.
- Keep graph editing as part of Automation Studio rather than a separate Flow Editor program.

## Phase 5: Identity, Data, Compute

- Implement users, roles, sessions, PIN gates, and vault primitives.
- Add repository implementations and migrations.
- Implement compute node registration, heartbeat, commands, and leases.

## Phase 6: Downstream Domain Integration

- Create a separate private or project-specific domain repo.
- Implement domain registration against the domain contracts exported by
  `fluxiq`.
- Register domain component packs and runtime capabilities.
- Validate that FluxIQ can run with no built-in domains.
