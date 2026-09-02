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
- create, profile, role, credential, and 2FA operations share a synchronous operation gate; while one privileged command is in flight, duplicate or competing submissions are rejected and the active operation is announced;
- filtering, deletion, or page replacement reconciles the selected user to a visible row, or clears detail when no visible row remains.

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
- create, edit, rotate, reveal, and delete are mutually exclusive operations in the browser, retain retryable errors, and cannot be submitted twice by rapid input;
- key filters reconcile detail to a visible key and clear stale detail after deletion.

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
- initial request loading, request failure with Retry, Git unavailable, no registered targets, and ready repository state are separate product states; branch mutations remain disabled until repository state is ready;
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
  page counts, source filtering, title/path search, centralized disclosure state,
  and a fixed-row virtual viewport; every indexed page remains reachable while
  only the visible navigation window and overscan are mounted;
- supports folder expansion plus Arrow Up/Down/Left/Right, Home, and End tree
  navigation and keeps the active document visibly selected;
- restores the active page through the `doc` URL query parameter; deliberate page
  and internal-link selections use browser history entries, while `popstate`
  restores Back/Forward navigation without creating replacement history;
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
- initial loading, request failure with Retry, valid no-target state, valid no-run/log state, and ready state are distinct; launch controls stay disabled without a registered target;
- execution rows are sorted by timestamp descending with a stable run/loop tie-breaker before the newest-500 cap is applied;
- active workloads retain grouped progress, selected detail, advance, and cancel controls;
- supports routine, task, and interface targets;
- tracks scheduled/running/completed/cancelled runs;
- exposes run parameters, loop counts, delays, and logs.

Planned improvements:

- real execution adapters;
- run approval gates;
- persistent run history in SQLite;
- integration with Compute Control.

## Web Request And Route Recovery

All global-program requests use the shared web request coordinator.

- safe reads use in-flight deduplication, caller-specific cancellation, a bounded timeout, and at most two exponential-backoff retries when the typed response marks the failure retryable;
- Docs and Deployment reads use 20-second timeouts; other global reads use 15 seconds;
- ordinary mutations use a 30-second timeout; Docs rebuild, Deployment sync/rollback, and database migrations use 120 seconds;
- mutations are never retried automatically, because their idempotency cannot be assumed;
- when every consumer cancels a deduplicated read, the underlying fetch is aborted;
- root, domain, and program routes provide authored loading and error boundaries with Retry, an optional error reference, and a safe return to Programs; unknown domains and routes use the authored not-found surface.

Every shared `DataTable` requires an accessible label at its type boundary and renders that label as both the table name and a visually hidden caption.

Shared program fields, segmented controls, icon buttons, menus, pagination,
modals, drawers, tables, badges, and loading/empty/error states use one visual
contract. Narrow programs use page scrolling; labelled table and explorer
regions may own bounded inner scrolling. Docs, Database Manager, Background
Tasks, and Compute Control do not impose fixed 520-720 pixel workspace
minimums. At 320 pixels, actions stack, modal and drawer surfaces occupy the
dynamic viewport, and tables retain local horizontal scrolling. The complete
viewport and state matrix is maintained in
[Web Panel responsive and visual certification](../operations/web-panel-responsive-visual-certification.md).

## Operational Framework Routes

Operational routes are intentionally API-only host-integration contracts. They are not ordinary end-user program commands and must not be exposed by an importing UI without preserving the permission and recovery contract below.

| Operation | Method and route | Permission | Disposition | Recovery |
| --- | --- | --- | --- | --- |
| Inspect setup/storage | `GET /api/framework/setup` | `programs.read` | API-only | Read-only; safe to retry. |
| Idempotent setup | `POST /api/framework/setup` with `action: setup` or omitted | `programs.write` | API-only | Inspect current state and retry after interruption. |
| Storage migration | `POST /api/framework/setup` with `action: migrate` | `programs.write` | API-only | Collision preflight fails before archiving; inspect journal/state before retry. |
| Storage rollback | `POST /api/framework/setup` with `action: rollback-migration` | `programs.write` | API-only | Available only for an incomplete pre-commit migration; restore archive, then reload runtime. |
| Inspect framework I/O | `GET /api/framework/io` | `programs.read` | API-only | Read-only; safe to retry. |
| Validate framework I/O | `POST /api/framework/io/validate` | `programs.read` | API-only | Side-effect free; safe to retry after interruption. |

Unknown setup actions fail closed with `400`; anonymous callers receive `401`; callers without the declared permission receive `403`. The route-disposition registry is executable and tested, so a new operational route must be classified before it can be considered supported.

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
