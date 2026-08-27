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
- every global program endpoint declares a required role permission, enforced
  by the shared API registry before its handler runs;
- the viewer role is read-only and cannot invoke identity, data, compute,
  runtime, deployment, secrets, or authoring mutations;
- login sessions last 12 hours;
- first-run credentials default to `admin` / `admin`;
- no default PIN is created;
- PIN can be configured after login;
- PIN is required for privileged post-login actions only after it is configured;
- password/PIN changes require current password and PIN;
- role edits require privileged credentials;
- TOTP setup generates a QR code and must be confirmed before use;
- logout is exposed in the control-panel top bar;
- the UI is split into Users, Roles, and Authentication Policy inner views;
- Users provides name/username/role search, enabled-state filtering, a persistent detail panel, and one row-action menu per account;
- user creation, profile editing, role changes, password/PIN replacement, 2FA enrollment, and 2FA disable use focused dialogs instead of an always-visible form;
- role and credential changes and 2FA disable state their consequence and require the acting user's configured password/PIN/TOTP factors;
- the final enabled administrator cannot be disabled or demoted; this is enforced by both the UI affordance and Identity service;
- initial loading, service failure with Retry, no users, no filter matches, and selected-user detail are distinct states.

Planned improvements:

- stronger first-run setup flow;
- admin recovery procedure;
- persistent audit log for privileged identity actions.


## Secret Keys

Secret Keys manages framework-owned secrets such as LLM provider keys and
custom integration tokens.

Current behavior:

- secrets are stored in the `secret.keys` table inside `global.sqlite`;
- secret values are AES-256-GCM encrypted at rest with `scrypt` password-derived
  keys, matching the identity credential sealing model;
- snapshots return only redacted metadata: name, type, provider, scope, enabled
  state, and rotation/reveal timestamps;
- create, update, rotate, reveal, and delete operations require the
  `secrets.manage` permission plus a fresh password/PIN/2FA credential recheck;
- the Secret Keys UI is list-first with search, LLM/custom and enabled-state filters, selected-key detail, and one row-action menu;
- Add Key starts from explicit intent, captures structured LLM/custom provider and model metadata, lazily loads real Domain and per-project Flow scope objects, then opens a separate authorization dialog;
- built-in, local, missing, and custom-adapter provider readiness is visible without exposing the secret value;
- add requires current password and configured PIN but not TOTP; edit, rotate, reveal, and delete require all configured factors;
- reveal is explicit, copyable, and automatically clears after 30 seconds, close, selection change, failed reauthorization, navigation, or stale key metadata;
- rotate and delete dialogs explain immediate runtime impact, and no workflow exposes raw JSON editing;
- Database Manager treats `secret.keys` as a sensitive store and requires the
  same credential recheck before encrypted rows can be viewed.

Planned improvements:

- runtime key resolution for LLM adapters without exposing raw values to logs;
- audit events for every reveal and rotation;
- optional host-managed key wrapping for password rotation workflows.

## Database Manager

Database Manager is the explorer for framework and domain data stores.

Current behavior:

- uses SQLite repositories;
- global data lives in `.fluxiq/global.sqlite`;
- domain data lives in `.fluxiq/domains/<domainId>/domain.sqlite`;
- record browsing uses repository-level SQL count, escaped search, stable sorting,
  limit, and offset rather than loading complete tables into the API or browser;
- the UI requests 50-row pages, keeps pagination at the bottom, and loads full
  record detail only after the user selects an ID;
- the database/table hierarchy, ID/value search, visible-column filter, sort
  direction, null values, empty/no-match states, and up to 30 page columns are
  presented as structured controls; wider records remain complete in detail;
- Background Tasks state is visible through the `background.tasks` store;
- Credential records in `identity.users` are AES-256-GCM encrypted at rest with
  keys derived from user passwords;
- sensitive-store counts remain absent from snapshots, so summaries never query
  or cache `identity.users` or `secret.keys` records;
- opening either sensitive store requires a modal password/PIN/2FA recheck that
  returns an opaque, store- and user-scoped five-minute authorization grant;
- the browser discards recheck credentials after authorization, displays the
  remaining grant lifetime, and clears rows and detail when the grant expires.
Planned improvements:

- migrations UI;
- record editing with permission gates;
- schema summaries for common framework stores.

## Background Tasks

Background Tasks schedules and runs framework jobs.

Current behavior:

- snapshots expose only the 20 most recent run summaries, while selected-task history uses 50-run server pages with status filtering and bottom pagination;
- the UI owns one run-history table with selected-run result/error detail, stale-request rejection, task search/state filters, and retry through Run Again;
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

- exposes a searchable node list with health and capability filters, selected-node heartbeat/domain/metadata detail, recent commands, and active leases;
- derives healthy, degraded, and offline presentation from reported state and heartbeat age; snapshots include at most 100 recent command summaries without deleting stored history;
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

- checkout and rollback require focused confirmation with target/version context, expose progress and failure status, and render structured results rather than raw JSON;
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

- reads authored host documentation from `docs/`;
- rebuilds runtime/operator Markdown under `.fluxiq/cache/docs`;
- copies the packaged framework API reference into `.fluxiq/cache/docs`;
- generates browseable TypeDoc HTML and JSON artifacts under
  `.fluxiq/cache/docs/reference` when FluxIQ source files and TypeDoc are
  available;
- presents authored and runtime-cache sources in one source-aware explorer with
  page counts, source filtering, title/path search, and bounded 1,000-page tree
  rendering for very large documentation sets;
- supports folder expansion plus Arrow Up/Down/Left/Right, Home, and End tree
  navigation and keeps the active document visibly selected;
- restores and writes the active page through the `doc` URL query parameter so
  documentation links can be shared and refreshed;
- shows Markdown, HTML, and JSON documentation files in a folder-style explorer;
- resolves internal documentation links inside the Docs program and reports
  broken snapshot links instead of silently navigating away;
- restricts web-registered documentation sources to configured documentation
  roots and verifies canonical paths before reading pages;
- renders imported HTML with readable constrained styles inside a CSP-protected,
  script-free sandboxed frame rather than injecting it into the control panel;
- exposes a generated heading outline, explicit page loading/missing/error states,
  visible rebuild progress/errors/warnings, and a narrow-screen explorer drawer;
- background rebuild runs every 24 hours.

Planned improvements:

- richer reference symbol metadata and navigation.

## Production Runner

Production Runner starts and monitors production workloads.

Current behavior:

- launch parameters use target-owned `parameterSchema` controls instead of manual JSON; snapshots are bounded to 100 run summaries and visible log views to 500 entries;
- active workloads retain grouped progress, selected detail, advance, and cancel controls;
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
