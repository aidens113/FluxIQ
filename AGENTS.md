# Agent Instructions

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

Do not run the web panel for the user. Tell them to run it manually with:

```bash
pnpm --filter @fluxiq/web dev
```
