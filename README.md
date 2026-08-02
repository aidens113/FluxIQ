# FluxIQ

FluxIQ is a domain-neutral automation framework for building scoped control
panels, automation studios, flow engines, data services, identity layers, and
compute orchestration for downstream projects.

This repository is public-facing framework code only. It must not contain
domain-specific automation behavior, private datasets, game-specific assets, or
project-local policy artifacts. Domain projects consume FluxIQ and provide their
own domain packages, data, component packs, and runtime capabilities.

## Goals

- Provide a reusable TypeScript/Node.js framework for automation products.
- Use Next.js for the control panel and program surfaces.
- Keep domains modular and external to the framework.
- Make Automation Studio the central authoring surface for tasks, routines,
  recordings, and generated policies.
- Keep authentication, data management, program routing, and compute control as
  framework-level capabilities.

## Repository Shape

```text
apps/
  web/                  Next.js control panel shell
packages/
  fluxiq/               Importable framework package
  client-gateway-websocket/
                         Typed WebSocket client for FluxIQ web-panel clients
docs/
  architecture/         Framework architecture and migration notes
```

## Domain Boundary

Domains live outside this repository. A downstream project can register a
domain by implementing the domain contracts exported by `fluxiq` and providing
its own:

- domain manifest;
- input definitions for observable state, events, records, or external signals;
- output definitions for actions, writes, dispatches, or other effects;
- component specs and component handlers;
- capabilities and runtime adapters;
- task/routine/interface documents;
- private datasets, recordings, and generated artifacts.

FluxIQ core packages must never import a downstream domain package directly.
Domain loading is registry-driven through manifests and explicit adapters.

Importer repositories/domains define the available inputs and outputs. FluxIQ
uses those declared surfaces to automate; it should not assume domain-private
state, commands, files, or effects.

The internal `programs` module is only for global framework programs. Domain-specific
programs belong to the host/importing project, under its configured domain
program root. By default that root is:

```text
domains/programs
```

## Importing From A Host Project

Downstream projects should import the main framework package and run setup once
during installation, development startup, or project initialization:

```ts
import { FluxIQ } from "fluxiq";

const fluxiq = FluxIQ.create({
  rootDir: process.cwd()
});

await fluxiq.setup();
```

This creates the host-owned folders FluxIQ needs for local config, data,
recordings, generated policies, logs, temporary files, and custom downstream
domains. Domain projects can override any path through `FluxIQ.create(...)`.

The same root and storage paths can be configured with environment variables:

```bash
FLUXIQ_ROOT=.
FLUXIQ_DIR=.fluxiq
FLUXIQ_DATA_DIR=.fluxiq/data
FLUXIQ_DATABASES_DIR=.fluxiq/databases
FLUXIQ_INPUTS_DIR=.fluxiq/inputs
FLUXIQ_OUTPUTS_DIR=.fluxiq/outputs
FLUXIQ_STREAMS_DIR=.fluxiq/streams
FLUXIQ_DOMAINS_DIR=domains
FLUXIQ_DOMAIN_PROGRAMS_DIR=domains/programs
FLUXIQ_DOMAIN_INPUTS_DIR=domains/inputs
FLUXIQ_DOMAIN_OUTPUTS_DIR=domains/outputs
FLUXIQ_DOMAIN_CONFIGS_DIR=domains/configs
FLUXIQ_DOMAIN_DATA_DIR=domains/data
FLUXIQ_DOMAIN_DATABASES_DIR=domains/databases
FLUXIQ_RECORDINGS_DIR=.fluxiq/recordings
FLUXIQ_POLICIES_DIR=.fluxiq/policies
FLUXIQ_LOGS_DIR=.fluxiq/logs
FLUXIQ_TEMP_DIR=.fluxiq/tmp
```

Explicit `FluxIQ.create(...)` options take precedence over environment
variables. In plain Node hosts, `FluxIQ.create()` loads `.env` and `.env.local`
from the current working directory by default before resolving paths.

## Development

This scaffold is intentionally light while the framework is being carved out.
Install dependencies before running checks:

```bash
pnpm install
pnpm check
```

## Client Gateway

WebSocket-capable clients such as browser extensions can connect through the
global client gateway. See
[`docs/integrations/client-gateway-websocket.md`](docs/integrations/client-gateway-websocket.md)
for the approval flow, message examples, and development endpoint.
