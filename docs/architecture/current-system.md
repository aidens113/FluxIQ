# Current System

FluxIQ is a public, domain-neutral automation framework written in TypeScript.
It is built as one importable framework package with a Next.js control panel
for local operators and downstream projects.

This repository must not contain domain-specific automation code. Host projects
provide domains, inputs, outputs, programs, policies, private data, and runtime
adapters through explicit registrations.

## Runtime Shape

The framework entry point is `FluxIQ` from the `fluxiq` package. A host project
creates a runtime with:

```ts
import { FluxIQ } from "fluxiq";

const fluxiq = FluxIQ.create({
  rootDir: process.cwd()
});

await fluxiq.setup();
```

The runtime owns:

- host paths and setup;
- domain registration;
- input/output adapter registration;
- global program runtime services;
- global program API registry;
- validation for domain IO requirements.

## Host Project Folders

By default, FluxIQ creates a `.fluxiq` folder in the importing repository for
runtime state and generated artifacts:

```text
.fluxiq/
  config/
  data/
  databases/
  inputs/
  outputs/
  streams/
  domains/
    programs/
    inputs/
    outputs/
    configs/
    data/
    databases/
  policies/
  recordings/
  logs/
  tmp/
```

The framework repo also has a normal `docs/` folder for authored and generated
Markdown documentation. The Docs program reads this same folder, so Git readers
and control-panel users see the same hierarchy.

## Global Programs

Global programs live under `packages/fluxiq/src/programs`. They are framework
capabilities shared by all host projects:

- Identity & Access;
- Database Manager;
- Background Tasks;
- Compute Control;
- Deployment Sync;
- Docs;
- Production Runner;
- Automation Studio.

Automation Studio is intentionally registered as a program but its full port is
planned separately. Accounts Manager and any OSRS-specific programs are not
part of this public framework.

## Data Model

Framework state should be persisted in the host project, not inside package
source. The main persistent database path is:

```text
.fluxiq/databases/global.sqlite
```

Database Manager exposes framework stores as SQLite-backed repositories. Domain
databases are separate and belong to host projects.

Background task state is stored in the global SQLite database under the
`background.tasks` store. Writes are batched on a 10 second window to avoid
excessive database churn.

## Control Panel

The local web control panel lives in `apps/web`. It uses the shared FluxIQ
runtime and exposes:

- login and session-gated access;
- 12 hour authentication sessions;
- program directory pages;
- fullscreen-capable global program workspaces;
- global alerts;
- AWS-inspired operational styling.

The panel must be run manually by the user:

```bash
pnpm --filter @fluxiq/web dev
```

## Domains And IO

Domains are provided by importing repositories. A domain declares what FluxIQ
can observe and what FluxIQ can affect:

- inputs describe readable or streamable state;
- outputs describe dispatchable effects;
- adapters implement those surfaces at runtime.

Automation must go through declared inputs and outputs. Framework code should
not reach into private domain files or hidden global state.
