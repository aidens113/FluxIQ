# Global Program Layout

Global programs live in `packages/fluxiq/src/programs/<program-id>`.

Each program should stay modular. Avoid single files that mix catalog metadata,
API handlers, storage, runtime behavior, and UI state.

## Standard Shape

```text
programs/<program-id>/
  index.ts              Public barrel for this program
  metadata.ts           Program catalog entry only
  types.ts              Program-owned domain-neutral document types
  api/
    contracts.ts        Request/response contracts and endpoint names
    handlers.ts         Framework handler registration, when implemented
  runtime/
    contracts.ts        Runtime adapters, services, runners, schedulers
    service.ts          Program orchestration, when implemented
  storage/
    contracts.ts        Repository interfaces and storage keys
    repositories.ts     File/database repository implementations
  ui/
    contracts.ts        View state and UI-facing DTOs
    navigation.ts       Program tabs, panels, and route metadata
```

Folders should be added when they have real ownership. `metadata.ts` and
`index.ts` are the minimum for every global program.

## Current Global Programs

- `automation-studio`
- `flow-editor`
- `identity-access`
- `database-manager`
- `background-tasks`
- `compute-control`
- `deployment-sync`
- `docs`
- `production-runner`

## Boundaries

Global programs can depend on framework services such as `core`, `io`,
`domains`, `components`, `flows`, and `engine`.

Global programs must not import downstream domain implementations. Domain-owned
programs belong to the importing repository under its configured
`domains/programs` root.

Accounts Manager is intentionally not being ported yet. OSRS, GE, merchanting,
and other domain-specific programs are out of scope for this public framework.
