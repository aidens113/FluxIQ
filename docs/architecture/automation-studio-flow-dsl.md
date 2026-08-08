# Automation Studio Flow DSL and Compiler

FluxIQ exposes a declarative TypeScript authoring surface from
`fluxiq/automation-studio/dsl`. It constructs the same canonical Flow IR used
by the visual editor. It is not a general script runner and does not grant
filesystem, environment, process, or network access.

## Defining a Flow

```ts
import { defineFlow } from "fluxiq/automation-studio/dsl";

export default defineFlow({
  "flowId": "flow.example",
  "name": "Example",
  "scope": { "kind": "global" },
  "nodes": [
    {
      "id": "start",
      "definitionId": "builtin.control.start"
    }
  ],
  "edges": [],
  "dependencies": []
});
```

The constrained module format intentionally uses JSON-compatible values. Only
the exact `defineFlow` import and one default `defineFlow(...)` export are
accepted by source loading. The compiler parses this shape without evaluating
the module, so executable expressions and additional imports are rejected with
module/line/column diagnostics.

Definitions may declare the Flow interface, variables, errors, nodes, edges,
regions, region handoffs, execution defaults, and exact dependency pins. Call
Flow nodes must declare the target Flow and version in `dependencies`.
Importer-native/Code Node instances pin their node-definition version and must
declare the matching `node` dependency. Named schema types similarly require a
schema version and matching `schema` dependency. Generated source emits these
pins from canonical IR; the compiler refuses missing or mismatched pins.

## Deterministic compilation

Compilation normalizes IDs, port collections, dependency pins, region
ownership, handoffs, positions, and other order-independent fields. It then
validates canonical structure, scoped node definitions, ports, regions, and
declared dependencies. Successful output includes normalized IR, a region
execution map, compiler version, dependency pins, and a SHA-256 plan digest.

Created and updated timestamps are excluded from the digest. Identical source,
module identity, project context, and dependency pins therefore produce the
same digest. Code-owned Flows retain source and compiler digests; runtime and
persistence reject IR changed without recompilation.

## Source ownership

A visual-owned Flow stores canonical IR as its authority. Its Source tab shows
stable generated TypeScript for inspection or export. Generated text is
read-only and does not become a second mutable authority.

Making code authoritative is an explicit, PIN-authorized conversion. FluxIQ
compiles the supplied module, replaces the draft IR only after validation, and
locks visual graph editing. Converting back to visual ownership is separately
confirmed, resets publication to draft, and warns that future module edits no
longer control the Flow.

Invalid source is returned as diagnostics and is not persisted. Published
versions continue to use their immutable compiled snapshots.

## CI commands

After building the FluxIQ package, validate one file or recursively scan a
directory for `*.flow.ts` modules:

```bash
pnpm flows:check -- ./flows --project my-project
```

Emit normalized execution plans into the ignored
`.fluxiq/cache/compiled-flows/` directory:

```bash
pnpm flows:build -- ./flows --project my-project
```

Both commands return a failing exit code for unsafe module shapes, invalid IR,
unknown nodes or ports, missing region handoffs, and undeclared dependency
pins. They do not start the web editor or execute Flow source.
