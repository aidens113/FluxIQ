# Global Programs

Global programs are framework-owned programs available to every FluxIQ host
project. They live under `packages/fluxiq/src/programs`.

Domain-specific programs must live in the importing repository, normally under
the configured domain program root. This public framework repository must not
contain domain-specific programs.

## Identity & Access

Identity & Access owns framework authentication and authorization.

Current behavior:

- login is required before using program APIs;
- login sessions last 12 hours;
- first-run credentials default to `admin` / `admin`;
- no default PIN is created;
- PIN can be configured after login;
- PIN is required for privileged post-login actions only after it is configured;
- password/PIN changes require current password and PIN;
- role edits require privileged credentials;
- TOTP setup generates a QR code and must be confirmed before use;
- logout is exposed in the control-panel top bar.

Planned improvements:

- stronger first-run setup flow;
- admin recovery procedure;
- persistent audit log for privileged identity actions.

## Database Manager

Database Manager is the explorer for framework and domain data stores.

Current behavior:

- uses SQLite repositories;
- global data lives in `.fluxiq/databases/global.sqlite`;
- domain databases are supported separately;
- the UI shows database/table hierarchy, records, values, search, and filters;
- Background Tasks state is visible through the `background.tasks` store.
- Credential records in `identity.users` are AES-256-GCM encrypted at rest with
  keys derived from user passwords.
- The `identity.users` store is protected by a modal password/PIN/2FA recheck
  before encrypted credential records can be viewed.

Planned improvements:

- migrations UI;
- record editing with permission gates;
- schema summaries for common framework stores.

## Background Tasks

Background Tasks schedules and runs framework jobs.

Current behavior:

- scheduler runs by default;
- scheduler pause/resume state persists;
- each task enabled/stopped state persists;
- task countdowns update every second in the UI;
- task state is stored in global SQLite;
- database writes are batched on a 10 second window;
- the documentation rebuild task runs every 24 hours by default.

Planned improvements:

- task categories;
- retry policy controls;
- richer run logs;
- manual schedule editor.

## Compute Control

Compute Control tracks connected compute nodes, commands, and leases.

Current behavior:

- compute nodes can be upserted;
- commands can be queued;
- leases can be acquired with TTLs;
- the UI displays node summary, heartbeat, capabilities, and domain assignment.

Planned improvements:

- live websocket transport;
- compute health timeline;
- command acknowledgement flow;
- worker capability matching.

## Deployment Sync

Deployment Sync coordinates repository-oriented deployment state.

Current behavior:

- detects Git state for the importing repository;
- lists branches, remotes, working tree status, and recent versions;
- can checkout branches;
- versions are clickable;
- rollback can checkout a selected commit.

Planned improvements:

- protected rollback confirmation;
- dirty-worktree handling guidance;
- deployment environment adapters beyond local Git.

## Docs

Docs renders authored and generated repository documentation.

Current behavior:

- reads the repository `docs/` tree;
- rebuilds generated Markdown under `docs/generated`;
- generates TypeDoc HTML and JSON artifacts under `docs/generated/reference`;
- shows Markdown, HTML, and JSON documentation files in a folder-style explorer;
- resolves internal documentation links inside the Docs program when a matching
  page exists;
- background rebuild runs every 24 hours.

Planned improvements:

- link and docs freshness checks.

## Production Runner

Production Runner starts and monitors production workloads.

Current behavior:

- supports routine, task, and interface targets;
- tracks scheduled/running/completed/cancelled runs;
- exposes run parameters, loop counts, delays, and logs.

Planned improvements:

- real execution adapters;
- run approval gates;
- persistent run history in SQLite;
- integration with Compute Control.

## Automation Studio

Automation Studio is the central authoring program for tasks, routines,
configurations, recordings, and generated policies.

Current behavior:

- registered as a global program;
- full functionality is intentionally not ported yet.

Planned work:

- port models from v1 into TypeScript;
- design modular subfolders instead of huge program files;
- rebuild policy generation around declared domain inputs and outputs;
- add recording review, narration, proposal, and approval workflows.
