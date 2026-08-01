# Architecture

FluxIQ is split into framework packages and downstream domain packages.

Framework packages provide reusable mechanics:

- program routing and scoped control-panel surfaces;
- authentication, authorization, action gates, and vault contracts;
- data repositories and migration contracts;
- flow documents, validation, execution, and result semantics;
- component registry contracts and domain-neutral node packs;
- runtime sessions and compute dispatch contracts;
- Automation Studio documents, recordings, and policy artifacts.

Downstream projects provide domain behavior:

- domain manifests;
- input definitions for observable state, events, records, or external signals;
- output definitions for actions, writes, dispatches, or other effects;
- domain component packs;
- runtime capabilities;
- data adapters;
- domain-specific programs;
- generated policies, recordings, and private assets.

Framework packages must not directly import downstream domains. Domain behavior
is loaded through manifests and explicit adapters.

## Domain Inputs And Outputs

Importer repositories are responsible for specifying what a domain can observe
and what it can affect. FluxIQ should automate through those declared surfaces,
not through hidden domain globals.

Domain manifests can declare:

- `inputs`: state, events, records, snapshots, external data, or signals the
  domain exposes to the framework;
- `outputs`: actions, commands, writes, dispatches, generated artifacts, or
  effects the framework may request through domain adapters.

Framework components and Automation Studio actions can then declare
`requiredInputs` and `requiredOutputs`. The runtime can validate that a domain
can satisfy a policy before attempting to execute it.

## Internal Boundaries

The framework is published as one importable package, `fluxiq`. Internally it
keeps clear folders rather than many tiny workspace packages.

| Internal Area | Owns | Must Not Own |
| --- | --- | --- |
| `src/core` | shared primitives and result types | domain concepts |
| `src/domains` | domain manifest and registry contracts | built-in domain packages |
| `src/programs` | global framework programs, program catalog, scope model, and global program API registry | domain program implementations |
| `src/api-contracts` | shared API schemas | private domain payloads |
| `src/flows` | flow graph model and validation | runtime side effects |
| `src/framework` | host-project bootstrap and top-level FluxIQ class | domain implementation code |
| `src/components` | component metadata and neutral node packs | domain actions |
| `src/engine` | session lifecycle and node dispatch | domain decision logic |
| `src/io` | input/output adapter contracts, streams, dispatch, and validation | domain implementation details |
| `src/ui` | reusable React UI primitives | domain-specific screens |

Global program internals use the layout described in
[`program-layout.md`](./program-layout.md).

## Authored Architecture Docs

- [Current System](current-system.md)
- [Automation Studio Architecture](automation-studio.md)
- [Client Gateway WebSocket Integration](../integrations/client-gateway-websocket.md)
- [Documentation System](docs-system.md)
- [Program Layout](program-layout.md)
- [UI Theme](ui-theme.md)
- [Migration Plan](migration-plan.md)
- [Roadmap](roadmap.md)

## Loading Model

The framework should discover domains from downstream registrations supplied by
the host application. A domain registration is data plus adapters:

```ts
import type { DomainRegistration } from "fluxiq";

export const domain: DomainRegistration = {
  manifest: {
    id: "example",
    title: "Example Domain",
    category: "Examples",
    description: "A downstream domain package.",
    icon: "blocks",
    capabilities: ["capture", "input"]
  },
  componentPacks: ["@example/components"],
  programExtensions: ["@example/programs"]
};
```

The framework can display and scope this domain without importing its
implementation directly.

## Host Project Setup

Downstream projects can import the main framework package and let FluxIQ create
the local folder structure it needs:

```ts
import { FluxIQ } from "fluxiq";
import { domain } from "./domains/example/domain";

const fluxiq = FluxIQ.create({
  rootDir: process.cwd(),
  domains: [domain]
});

await fluxiq.setup();
```

By default this creates:

```text
.fluxiq/
  config/
  data/
  databases/
  inputs/
  logs/
  outputs/
  policies/
  recordings/
  streams/
  tmp/
domains/
  configs/
  data/
  databases/
  inputs/
  outputs/
  programs/
```

The `.fluxiq` folder is for host-project runtime state, generated artifacts,
recordings, and local framework config. The `domains` folder is for downstream
domain code owned by that project.

The internal `programs` area contains global framework programs only. Host projects own
domain-specific programs in the configured domain program root, which defaults
to `domains/programs`.

Host projects can set `FLUXIQ_ROOT` to move the framework root without changing
code. They can also override individual folders with `FLUXIQ_DATA_DIR`,
`FLUXIQ_DOMAINS_DIR`, `FLUXIQ_DOMAIN_PROGRAMS_DIR`, `FLUXIQ_RECORDINGS_DIR`,
`FLUXIQ_POLICIES_DIR`, `FLUXIQ_LOGS_DIR`, and `FLUXIQ_TEMP_DIR`. Constructor
options override environment variables. `FluxIQ.create()` loads `.env` and
`.env.local` from the current working directory by default for non-Next.js Node
hosts.
