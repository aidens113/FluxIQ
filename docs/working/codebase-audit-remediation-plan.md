# Codebase Audit Remediation Plan

Status: working document  
Created: 2026-08-04  
Scope: FluxIQ public framework repository

This document preserves the findings from the August 2026 codebase audit and
tracks remediation work. It is intentionally a working document. Decisions,
migrations, and completed validation should be recorded here until the work is
stable enough to fold into the permanent architecture and operations docs.

## Working Rules

- Complete and validate one numbered point before starting the next.
- Stop after each point for review.
- Do not silently combine global framework state with domain-owned state.
- Do not introduce domain-specific behavior into this repository.
- Treat points 4 and 5 as explicit design gates. Their implementation should
  not begin until their detailed package and module boundaries are agreed.
- Update authored documentation alongside substantial framework changes.

## Baseline

The audit found a sound domain-neutral core and healthy compile/test results,
but also several release-blocking security and packaging issues.

Baseline validation on 2026-08-04:

- `pnpm check`: passed.
- `pnpm test`: passed, 113 tests.
- `pnpm build`: passed, including the production Next.js build.
- `pnpm audit --prod`: 6 advisories (4 high, 2 moderate).
- Tracked files: 598.
- Generated documentation: 300 tracked files, approximately 5.37 MB.
- First-party TypeScript: approximately 28,270 lines in 265 files.
- Current local `.fluxiq`: 41 directories for 9 files.

## 1. Secure The API And Documentation Boundaries

Status: completed 2026-08-04

Problems:

- HTTP routes validate sessions but do not consistently enforce role
  permissions.
- Viewer permissions are currently descriptive rather than authoritative.
- Identity session creation and TOTP/user operations allow unsafe cross-user
  actions.
- Database, task, compute, production, docs, and deployment mutations lack a
  consistent central authorization policy.
- Docs sources can point at arbitrary local directories.
- Imported HTML uses an incomplete regex sanitizer and is inserted into the
  page as HTML.

Planned implementation:

1. Add actor identity and permission requirements to the global program API
   registry.
2. Require every registered endpoint to declare its permission.
3. Pass the authenticated actor from the Next.js route into the registry.
4. Keep credential/PIN checks as an additional gate, not a replacement for
   role authorization.
5. Restrict docs sources to configured allowed documentation roots.
6. Remove unsafe raw HTML injection or place imported HTML behind a safe,
   deliberately constrained renderer.
7. Add tests for viewer denial, admin access, identity escalation attempts,
   docs path containment, and unsafe HTML.

Initial permission policy:

| Capability | Required permission |
| --- | --- |
| Program snapshots, lists, and ordinary reads | `programs.read` |
| Program/project configuration changes | `programs.write` |
| Task, routine, policy, and flow authoring | `flows.write` |
| Background jobs, deployments, recordings, client actions, and production runs | `runtime.control` |
| Compute node, command, and lease mutation | `compute.control` |
| Users, sessions, credentials, TOTP, roles, and vault mutation | `identity.manage` |
| Database writes/migrations and docs source registration | `data.manage` |

Completion criteria:

- A viewer cannot invoke any mutating endpoint.
- An administrator retains current intended operations.
- Sensitive operations still enforce existing PIN/password/TOTP checks where
  applicable.
- Docs cannot scan outside approved roots.
- Host HTML cannot execute active content in the web panel.
- Relevant checks, tests, and production build pass.

Implemented:

- `GlobalProgramApiRegistry` now requires every endpoint registration to name a
  permission and rejects missing/insufficient actors before invoking handlers.
- The Next.js program route constructs the API actor exclusively from the
  validated server-side session and maps authorization failures to 401/403.
- All 96 registered global-program endpoints declare an explicit permission.
- Framework setup requires `programs.write`.
- Client pairing approval/rejection and active recording context require
  `runtime.control`.
- Docs source registration requires `data.manage`.
- Docs sources are restricted to configured roots and canonical paths are
  checked again before scanning or reading cached page paths.
- Imported HTML is cleaned and rendered in a sandboxed frame without script,
  forms, same-origin access, or top navigation.
- The generated program API map now includes endpoint permissions.

Validation:

- `pnpm check`: passed.
- `pnpm test`: passed, 115 tests.
- `pnpm build`: passed, including the production Next.js build.

## 2. Repair Client Gateway Identity And Session Scoping

Status: completed 2026-08-04

Problems:

- Saved WebSocket tokens cannot authenticate a new connection because they are
  bound to the old socket session and deleted on disconnect.
- Automation Studio's active project context is process-global rather than
  user/client/session-specific.
- Origin policy defaults are safe only while the listener remains loopback-only.

Detailed implementation plan:

1. Separate durable trust from transient connectivity.
   - A socket connection creates a new transient session every time.
   - Web-panel approval creates a durable trusted-client record bound to the
     approving operator and the client's stable `clientId`.
   - Sessions reference a trusted-client ID and operator ID; they do not own
     the durable credential.
2. Persist credentials safely.
   - Generate 256-bit bearer credentials.
   - Return the raw credential only in `server.session_ready`.
   - Persist only a SHA-256 digest with client identity, approving operator,
     approval/usage timestamps, expiry, and optional revocation metadata.
   - Store framework-owned trust state in the existing program-data area for
     now; point 3 will migrate its location with the rest of `.fluxiq`.
3. Implement lifecycle semantics.
   - Pairing approval creates trust and marks the current session ready.
   - Reconnect accepts a valid credential only for the same `clientId`, then
     atomically replaces its digest and returns the rotated credential.
   - Disconnect ends only the transient session.
   - Expired, revoked, unknown, or mismatched credentials all fall back to the
     same pairing-required response without disclosing which check failed.
   - Revocation persists immediately and disconnects any live sessions using
     that trusted-client record.
4. Scope Automation Studio context.
   - Replace the process-global active project with operator-scoped entries and
     optional operator+client overrides.
   - A recording request resolves the client override first, then the
     approving operator's default context.
   - Context freshness remains bounded so a closed/stale browser cannot keep
     redirecting future recordings.
5. Preserve recording continuity where safe.
   - In-process active recording ownership uses durable trusted-client identity
     rather than transient session ID.
   - Recording state itself is not added to the credential store; recovery of
     interrupted recording writes remains a separate persistence concern.
6. Add management and observability.
   - Gateway snapshots expose safe trusted-client metadata but never hashes or
     raw credentials.
   - Add a permission-gated revocation operation and UI control.
   - Audit pairing, reconnect, rotation, expiry fallback, revocation, and
     disconnect events without recording secrets.
7. Validate the protocol.
   - Unit-test pair/disconnect/reconnect, one-use rotation, restart through a
     persisted store, expiry, revocation, client-ID mismatch, and concurrent
     operator/client project resolution.
   - Update permanent integration/architecture documentation and environment
     configuration, then run `pnpm check`, `pnpm test`, and `pnpm build`.

Protocol state model:

```text
connected
  | valid saved credential (consume + rotate)
  v
ready <---------------- web-panel approval ---------------- pairing_required
  | disconnect/revoke                                      ^
  v                                                        |
disconnected                 invalid/expired/revoked token -+
```

Security and compatibility decisions:

- Protocol version remains `0.1`; existing clients already replace their
  stored token on every `server.session_ready`, so rotation is compatible.
- A bearer token used by the recordings HTTP API authorizes only while its
  associated gateway session is live and ready. Durable credentials are not a
  general offline API key.
- Pairing codes remain short-lived approval references, not credentials.
- Origin allowlists remain required for non-loopback deployments; no broader
  listener or origin-policy change is included in this point.

Completion criteria:

- Pair, disconnect, reconnect, restart, revoke, and expired-token flows are
  covered by tests and documentation.
- Concurrent operators/projects cannot redirect each other's recordings.

Implemented:

- Durable trusted-client records are separate from transient WebSocket
  sessions and persist through the framework program-data store.
- Credentials use 256 bits of randomness; only SHA-256 digests persist, raw
  credentials never appear in gateway snapshots, and successful reconnects
  rotate them before a session becomes ready.
- Disconnect preserves trust; expiry, revocation, client-ID mismatch, and
  unknown credentials return to operator approval without revealing the failed
  check.
- Pairing approval is bound to the authenticated approving user. The deprecated
  client-side pairing-code submission path can no longer self-approve.
- Trusted clients can be inspected and PIN-authorized revocation disconnects
  associated live sessions immediately.
- Automation Studio project heartbeats are isolated by operator with optional
  client overrides. Client-requested project IDs must match the approving
  operator's fresh context.
- Active recording ownership uses trusted-client identity in process, allowing
  a recording to continue across a socket reconnect.
- Non-loopback gateway listeners require a restrictive origin allowlist and
  reject missing or wildcard origin policies.
- Integration, architecture, and environment configuration documentation now
  describe persistence, rotation, expiry, revocation, scoping, and listener
  requirements.

Validation:

- `pnpm check`: passed.
- Focused gateway, bridge, context, transport, and origin tests: passed.
- `pnpm test`: passed, 121 tests across the workspace.
- `pnpm build`: passed, including the production Next.js build.

## 3. Simplify And Migrate `.fluxiq` Storage

Status: completed 2026-08-05

Problems:

- Framework setup eagerly creates many directories, guides, and placeholders.
- Automation Studio eagerly creates roughly twenty directories per project and
  additional directory trees per recording.
- Active-domain paths alias global and domain concepts.
- Selecting a domain can move nominally global identity/program state below a
  domain root.
- JSON indexes and multi-file artifact writes do not have transactional
  integrity.

Current inventory:

- `FluxIQ.setup()` creates 19 logical directories, then adds a `.gitkeep` and
  `README.md` to each by default.
- Selecting an active domain changes the base directory used by `data`,
  `databases`, identity, background tasks, global program JSON, Automation
  Studio, recordings, policies, logs, and temporary files.
- `AutomationStudioService.prepareStorage()` creates the node-library root and
  a directory for every built-in node class even when the importer has no
  custom nodes.
- Each Automation Studio project eagerly creates 20 directories. Starting a
  recording creates session folders and ten empty derived-artifact folders.
- The current framework-development `.fluxiq` demonstrates the shape problem:
  41 directories contain only 9 files (about 191 KB).
- Global program JSON stores live under `data/programs/<programId>/`; the
  database repository uses `databases/global.sqlite` and
  `databases/domains/<domainId>.sqlite`.
- Automation Studio writes a project manifest, hierarchy documents, workspace
  preferences, artifact documents, recording documents, timelines, snapshots,
  pipeline indexes, derived artifacts, and runtime indexes as independently
  committed JSON files.
- `ProgramJsonStore` makes one file replacement atomic, but an operation that
  changes an artifact plus one or more indexes can be interrupted between
  replacements.

### Layout v2

The canonical target is:

```text
.fluxiq/
  config.json
  global.sqlite
  artifacts/
    automation-studio/
      projects/<projectId>/
        objects/
          <sha256>.<extension>
  domains/
    <domainId>/
      config/
      data/
      domain.sqlite
  cache/
  logs/
  tmp/
```

Only paths with actual content are created. Empty `artifacts`, `domains`,
`cache`, `logs`, and `tmp` directories do not exist in a fresh installation.

`config.json` is portable and contains logical/relative configuration, the
layout version, and framework metadata. It must not record machine-specific
absolute paths. Explicit external path overrides remain supported but are
marked as externally managed and are not moved automatically.

Authored importer code does not belong under ignored runtime state. Domain
programs, adapters, custom nodes, and fixtures remain in the importing
repository under configured source roots. `.fluxiq/domains/<domainId>` contains
only domain-owned runtime configuration, data, and its database.

### Ownership decisions

| State | Canonical owner | Storage |
| --- | --- | --- |
| Users, credentials, roles, sessions, and vault | Global framework | `global.sqlite` |
| Background tasks, compute, deployments, production, docs registration/cache metadata, and trusted clients | Global framework | `global.sqlite` |
| Automation Studio projects, categories, hierarchy, workspace preferences, tasks, routines, configs, flows, policies, runtime sessions, recording metadata, events, and derived JSON artifacts | Global Automation Studio program | `global.sqlite` |
| Large/binary recording payloads, images, imported files, and oversized JSON snapshots | Owning Automation Studio project | Immutable content-addressed files under the project `objects/` directory, referenced from `global.sqlite` |
| Domain-specific runtime records | Importing domain | `domains/<domainId>/domain.sqlite` |
| Domain configuration or non-database domain data | Importing domain | Created lazily under `domains/<domainId>/config` or `data` |
| Rebuildable docs/runtime snapshots | Framework cache | `cache/` |
| Logs and temporary work | Framework runtime | `logs/` and `tmp/`, created on first write |

Automation Studio remains a global program. Activating a domain can filter or
target project data, but it never relocates the program's database or project
catalog. A recording's `domainId` is data ownership metadata, not a switch for
the global storage root.

### Database and artifact model

1. Add one shared SQLite database abstraction with schema migrations and an
   explicit transaction/unit-of-work API. Program repositories must no longer
   open unrelated connections when one logical operation needs atomicity.
2. Keep existing global repository tables compatible, then add Automation
   Studio tables for projects/categories, project documents, recordings,
   ordered recording entries, derived artifacts, runtime sessions, and object
   references.
3. Remove JSON index files as sources of truth. Project, recording, pipeline,
   and runtime listings become indexed database queries inside the same
   transaction that changes their underlying records.
4. Store ordinary JSON directly in SQLite. Payloads over a documented threshold
   (initial target: 256 KiB) and binary data use immutable object files.
5. Write an object to a temporary file, flush/close it, atomically rename it to
   its SHA-256 name, and only then commit its database reference. A failed
   database transaction can leave an unreferenced object, but can never leave a
   committed reference to a missing file. Garbage collection removes only
   verified unreferenced objects after a grace period.
6. Store live recording events as ordered SQLite rows. SQLite page management
   supplies the durable chunking boundary; canonical recordings do not require
   one directory per event type or pre-created empty derived folders.
   Portable NDJSON chunks are generated exports under `cache/exports`, not a
   second source of truth.
7. Deleting a project or recording removes database references transactionally.
   Object deletion is deferred to garbage collection, making interrupted
   deletes recoverable.

### Path-resolution changes

- Global paths are always rooted directly under `.fluxiq`, regardless of
  `domainId` or `FLUXIQ_HOST_DOMAIN`.
- Domain selection affects only `domainRoot`, `domainData`,
  `domainDatabases`, and configured domain source roots.
- `FluxIQHostPaths` retains deprecated compatibility aliases during this point,
  but aliases resolve to the v2 owners rather than changing with the active
  domain. Removal is deferred to the package/API design in point 4.
- Legacy environment variables are honored with deprecation diagnostics.
  External absolute overrides are never silently copied, merged, or deleted.
- Runtime construction is read-only: `FluxIQ.create()` resolves paths and
  inspects layout metadata but creates no directories or databases.
- Fresh `setup()` creates only `.fluxiq/config.json`. Databases and directories
  appear when the owning service performs its first write.

### Migration v1 to v2

Migration must recognize all of these inputs:

1. unscoped state under `.fluxiq/data` and `.fluxiq/databases`;
2. accidentally scoped global state under
   `.fluxiq/<activeDomainId>/data` and `databases`;
3. old domain databases under `.fluxiq/databases/domains/<domainId>.sqlite`;
4. both the legacy Automation Studio `projects.json` document and the current
   per-project JSON tree;
5. a partially staged or interrupted v2 migration; and
6. explicitly configured external storage roots.

Migration API:

- `inspectStorage()` returns layout version, source inventories, external
  overrides, conflicts, estimated bytes, and required actions without writing.
- `migrateStorage({ mode: "apply" })` is an explicit operation. Normal runtime
  startup does not silently migrate or delete host state.
- The authenticated framework setup route exposes the same plan/apply result;
  a future packaged CLI can call the framework API rather than reimplementing
  migration logic.

Restartable migration stages:

```text
inspect -> lock -> inventory -> stage -> verify -> cutover -> archive -> complete
```

- Acquire an exclusive `.fluxiq/migration.lock` containing process, host, and
  start metadata. Another runtime refuses writes while a live/incomplete
  migration exists.
- Record every source, destination, digest/count, conflict decision, and stage
  in an atomically replaced migration journal.
- Build the v2 database and objects below `.fluxiq/.migration/v2/staged`.
- Verify row counts, stable record IDs, object sizes, and SHA-256 hashes before
  cutover.
- Treat `config.json` with `layoutVersion: 2` as the commit marker. Runtime
  refuses normal writes when a migration journal is between cutover stages and
  requires resume or rollback.
- Move recognized v1 roots into
  `.fluxiq/legacy/v1-<timestamp>/` only after verification. This archive is the
  rollback source and is never deleted automatically.
- Write the v2 config last, record migration history in `global.sqlite`, then
  remove the temporary lock. Explicit cleanup of the legacy archive is a later
  operator action.

Conflict policy:

- Identical records or artifacts are deduplicated by stable ID plus content
  digest.
- Divergent records with the same stable ID stop the plan before writes. The
  operator must choose/rename a source; migration never uses last-write-wins.
- Scoped copies of nominally global identity or program state are proposed for
  merge into `global.sqlite`, with all collisions reported.
- Domain repository records move to the matching `domain.sqlite`.
- External overrides are reported and left in place unless a future explicit
  import mapping names both source and destination.

### Implementation sequence

3A. Introduce layout-v2 path resolution, storage inspection types, migration
journal/lock primitives, and fresh lazy setup. Keep v1 runtime reads intact.

3B. Add the shared transactional SQLite layer and migrate existing global and
domain repositories to canonical database paths without changing service
contracts.

3C. Add the Automation Studio SQLite repositories/object store, replace eager
directory creation and JSON indexes, and test atomic project/recording/pipeline
operations.

3D. Implement v1 inventory, staging, verification, conflict handling, cutover,
resume, rollback, and safe legacy archiving.

3E. Update setup/API UI, environment examples, authored architecture and
operations docs, then validate a fresh host plus unscoped, scoped, mixed,
conflicting, and interrupted migration fixtures.

Each substage must keep existing point-1 authorization and point-2 client trust
semantics intact. Do not delete or rewrite the current ignored `.fluxiq` in the
framework checkout while developing migration code; use isolated fixtures.

### Test matrix

- Fresh setup creates only `config.json`; first writes create only their owning
  database/artifact parent.
- Creating a domain never changes global identity, trusted clients, tasks,
  projects, or database paths.
- Global and domain repositories remain distinct across restart and active
  domain changes.
- Project creation produces no empty directory tree.
- Recording append/finalize and pipeline derivation are atomic under injected
  failures and concurrent writers.
- Object write failure, database commit failure, and garbage collection cannot
  produce a referenced missing object or delete a referenced object.
- Unscoped v1, active-domain-scoped v1, mixed layouts, old `projects.json`, and
  current project trees migrate with equal IDs and content.
- Identical collisions deduplicate; divergent collisions fail during planning
  without modifying sources.
- Migration resumes after interruption at every journal stage and rollback
  restores the v1 runtime before the v2 commit marker.
- External overrides are inventoried but untouched.
- Windows rename/retry behavior and SQLite WAL sidecars are covered.
- `pnpm check`, `pnpm test`, and `pnpm build` pass after each implementation
  substage.

Completion criteria:

- Setup creates only immediately required state.
- Global state remains global across domain selection.
- Directories are created lazily.
- Migration is versioned, restartable, tested, and documented.
- Multi-record metadata/index mutations are atomic.
- Large artifacts cannot be referenced before their verified object exists.
- Existing unscoped and active-domain-scoped hosts migrate without silent
  overwrites or data loss.

Implemented:

- Added storage layout v2 inspection and portable `.fluxiq/config.json`
  metadata. `FluxIQ.create()` performs no setup writes and fresh `setup()`
  creates only the config file.
- Global state now remains directly under `.fluxiq` regardless of the active
  domain. Domain runtime state uses `.fluxiq/domains/<domainId>`, while authored
  programs, inputs, outputs, adapters, and custom nodes default to importer
  source roots outside `.fluxiq`.
- Preserved importer ownership of domain identity: registered manifests and
  host modules still supply names, labels, recording contracts, and extensions
  used by the global editor. A domain ID is a target/filter and runtime-storage
  key, not a replacement editor identity or a global-storage root.
- Moved global program documents and Automation Studio's project, hierarchy,
  workspace, authoring, runtime, and pipeline documents into tables in
  `.fluxiq/global.sqlite`. Canonical recording, normalized timeline, signal,
  learned-model, and policy repositories also use the global database.
- Added a serialized SQLite transaction API and a multi-document program-state
  transaction. Project bootstrap and v2 pipeline document/index mutations use
  one database transaction; injected failures roll back all documents.
- Domain repositories now resolve to
  `.fluxiq/domains/<domainId>/domain.sqlite` without changing the global
  repository path.
- Removed eager framework and Automation Studio placeholder directory creation.
  Projects create no filesystem tree unless they write an oversized object.
- Added a verified SHA-256 content-addressed object store with a 256 KiB JSON
  threshold. Objects are written before database references and reads verify
  the stored content hash.
- Added explicit v1-to-v2 migration with inventory, exclusive/stale-lock
  handling, staged database/artifact construction, collision rejection,
  restartable idempotent cutover, legacy archives, and pre-commit rollback.
  Legacy unscoped and accidentally active-domain-scoped global state merge into
  the global database; old domain databases move to their domain owner.
- The authenticated setup API exposes inspection, setup, migration, and
  rollback actions. Web migration/rollback reloads the shared FluxIQ runtime so
  its resolved paths cannot remain on v1.
- Updated environment examples and authored architecture, Automation Studio,
  and operations documentation for sparse v2 storage and importer-owned domain
  naming.

Validation:

- `pnpm check`: passed.
- Focused layout, migration, Automation Studio service, object-store, and
  transaction tests: passed.
- `pnpm test`: passed, 125 tests across the workspace.
- `pnpm build`: passed, including the production Next.js build.

## 4. Make FluxIQ A Real Distributable Framework

Status: implemented 2026-08-05; registry publication remains blocked on the
owner license decision

Problems:

- Package `build` scripts only run `tsc --noEmit`.
- Exports point directly at TypeScript source.
- No JavaScript, declarations, source maps, or publishable `dist` tree is
  produced.
- Lightweight clients inherit the full framework dependency graph.
- Runtime-only and documentation-generation dependencies are attached to the
  main package.

Current packaging inventory:

- `packages/fluxiq/package.json` exports 20 entry points directly from
  `src/**/*.ts`; consumers currently need a TypeScript-aware bundler and are
  coupled to repository source layout.
- Both publishable packages run `tsc --noEmit` for `build`, so neither produces
  JavaScript, declarations, source maps, or a tarball-ready `dist` directory.
- The repository declares ESM, but source-relative imports omit `.js`
  extensions under `moduleResolution: "Bundler"`; unbundled compiler output
  would not execute in Node ESM as written.
- `@fluxiq/client-gateway-websocket` imports protocol and recording types from
  the full `fluxiq` package. Installing the client therefore pulls the Node
  runtime graph, including native `sqlite3`, QR generation, and TypeDoc.
- `typedoc` is dynamically loaded only by generated-doc tooling but is a
  required production dependency. `drizzle-orm` and `drizzle-kit` have no
  first-party imports. React has no runtime imports in `packages/fluxiq` and
  its current `ui` entry is only framework-neutral data/theme contracts.
- Neither publishable package declares `files`, `engines`, publish metadata,
  repository metadata, or a license. No repository license file currently
  exists. The client package is also marked `private`.
- Workspace TypeScript path aliases and Vitest aliases can hide missing or
  incorrect package exports. There is no packed-tarball consumer test.

### Decisions

Use three public packages and keep the web application private:

```text
@fluxiq/contracts                  dependency-light shared contracts
fluxiq                            Node framework runtime
@fluxiq/client-gateway-websocket  transport client
@fluxiq/web                       private control-panel application
```

Package ownership:

| Package | Environment | Owns | Must not depend on |
| --- | --- | --- | --- |
| `@fluxiq/contracts` | Browser and Node | JSON primitives, program API contracts/schemas, client-gateway protocol, and the recording/state contract subset required by external clients | Node built-ins, SQLite, framework services, filesystem paths, TypeDoc, React |
| `fluxiq` | Node 22+ | Framework lifecycle, domains/IO, programs, persistence, migrations, Automation Studio runtime, Node-side client gateway, and framework-neutral UI tokens | Next.js or the web application |
| `@fluxiq/client-gateway-websocket` | Modern browsers and Node 22+ | WebSocket transport, protocol message helpers, and the client-side Automation Studio facade | `fluxiq`, SQLite, QR generation, TypeDoc, React |
| `@fluxiq/web` | Supported Next.js Node host | Control panel and concrete WebSocket server adapter | Published as a library |

Do not introduce a separate React/UI package in point 4. The current
`fluxiq/ui` surface contains no React components and can remain a Node package
subpath. If reusable React components emerge, their ownership is a later
package-boundary decision rather than a speculative empty package.

Publish ESM only and support Node `>=22`. CommonJS output would double the
native-runtime and export validation matrix without serving a demonstrated
consumer. Every package declares its environment explicitly; the client and
contracts packages also remain bundler/browser-safe. A future CommonJS build
requires an explicit compatibility request.

### Public API And Compatibility

Preserve the current documented `fluxiq` subpaths for the first distributable
release, but point them at compiled output:

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./framework": { "types": "./dist/framework/index.d.ts", "import": "./dist/framework/index.js" },
    "./automation-studio": { "types": "./dist/programs/automation-studio/index.d.ts", "import": "./dist/programs/automation-studio/index.js" }
  }
}
```

Apply the same conditional shape to every retained subpath. Do not export
`dist/*`, `src/*`, storage internals, test helpers, or arbitrary deep imports.
Add only an explicit `./package.json` export if tooling requires it.

Move shared definitions to `@fluxiq/contracts` before changing dependencies.
The runtime package re-exports those definitions from its existing paths so
current `fluxiq/client-gateway`, `fluxiq/automation-studio`, `fluxiq/core`, and
root type imports remain source-compatible. Use `export type` wherever the
symbol has no runtime value. Runtime schemas/constants remain real exports and
must have one canonical owner; duplicate protocol constants are forbidden.

The initial contracts surface is deliberately bounded:

- core `JsonValue`/`JsonObject` types;
- program scope, summary, directory schemas, and inferred types;
- client-gateway envelopes, capabilities, messages, session-safe views, and
  protocol version;
- Automation Studio state snapshot, recording session/input, domain recording
  event, and request contracts required by external clients.

Do not move service classes, repositories, domain registries, node executors,
policy mining, or framework setup into the contracts package.

### Build Architecture

1. Keep the existing no-emit configs for editor/test checking and add one
   `tsconfig.build.json` per public package.
2. Build with TypeScript project references in dependency order:
   `contracts -> fluxiq -> client-gateway-websocket`. The private web app keeps
   its Next.js build and consumes package exports rather than source aliases in
   the packed-consumer test.
3. Use `module` and `moduleResolution` `NodeNext` for published packages,
   `target` `ES2022`, declarations, declaration maps, source maps, `rootDir`
   `src`, and `outDir` `dist`. Exclude tests and test fixtures.
4. Mechanically convert published source-relative specifiers to `.js`. NodeNext
   resolves those specifiers to TypeScript during compilation and emits valid
   native ESM without a bundler-specific loader. Do not paper over the issue by
   bundling the Node runtime or by retaining `Bundler` resolution for emitted
   code.
5. Use TypeScript build-mode cleaning/output tracking so stale files cannot
   survive a renamed entry point. `pnpm build` must create output; `pnpm check`
   remains a separate no-emit verification.
6. Emit the source directory structure into `dist` so each deliberate subpath
   has a stable JavaScript/declaration pair. Source maps reference packaged
   source only if source files are intentionally included; otherwise validate
   that maps do not expose machine-local paths.
7. Add a root build orchestration script that builds public packages first and
   the web application afterward. Workspace builds must not rely on previously
   generated `dist` files.

### Dependency And Manifest Policy

`@fluxiq/contracts`:

- public, ESM, `sideEffects: false`, Node/browser-neutral;
- direct dependency on `zod` only while it owns runtime schemas;
- no Node or React type dependency in emitted declarations.

`fluxiq`:

- public, ESM, `engines.node: ">=22"`;
- dependencies: `@fluxiq/contracts`, `sqlite3`, `qrcode`, and only other modules
  proven by emitted runtime imports;
- remove unused Drizzle packages;
- move TypeDoc to a development dependency plus optional peer dependency.
  Invoking TypeDoc generation without it returns an actionable installation
  error; ordinary runtime consumers do not install it;
- remove the React peer and React types unless emitted declarations prove they
  are required.

`@fluxiq/client-gateway-websocket`:

- remove `private`, depend only on `@fluxiq/contracts`, and declare browser plus
  Node 22 support;
- do not reference `fluxiq` in source, emitted declarations, lockfile package
  dependencies, or tarball metadata;
- expose a single deliberate root API initially. Add subpaths only when a real
  consumer needs independently versioned surfaces.

Every public package adds `files: ["dist", "README.md", "LICENSE"]`,
description, keywords, repository, homepage, bugs, funding if applicable,
`publishConfig.access: "public"`, and a synchronized pre-1.0 version policy.
Package READMEs contain installation, environment, and minimal executable
examples rather than linking consumers to repository-internal source paths.

Licensing is a blocking owner decision before publication. Recommend MIT for a
permissive public framework, but do not add a license identifier or file until
the repository owner confirms it. Planning/build work can proceed; `publish`
and the release acceptance check cannot.

### Native SQLite And Optional Tooling

- Keep `sqlite3` external rather than bundling a native addon. Validate that a
  clean production install can load it and perform a real layout-v2 write.
- CI tests the minimum supported Node 22 version on Windows and Linux. Add macOS
  when release infrastructure supports it because native prebuild availability
  is part of the package contract.
- The packed runtime smoke test creates an isolated importer, runs `setup()`,
  writes/reads global SQLite state, writes/reads a domain repository, and
  exercises storage inspection. Migration gets a separate v1 fixture smoke
  test so missing packaged migration code cannot pass unnoticed.
- TypeDoc generation is tested in the repository with the optional peer
  installed, plus a clean runtime fixture without TypeDoc to prove ordinary
  imports/setup do not require it.

### Tarball And Consumer Validation

Add repository-owned fixture scripts that always consume packed tarballs, not
workspace links or TypeScript path aliases:

1. Build all public packages from a clean output state.
2. Run `pnpm pack` for contracts, runtime, and client packages into an isolated
   temporary directory.
3. Inspect tarball contents and fail on `src/`, tests, `.fluxiq`, generated
   runtime docs, local paths, secrets, or missing README/license/build files.
4. Create a plain Node ESM consumer, install the contracts/runtime tarballs with
   production dependencies, import every documented export, and run the SQLite
   setup/read/write/migration smoke tests.
5. Create a separate client consumer that installs only contracts and the
   WebSocket tarball. Type-check it and bundle a minimal browser entry. Fail if
   the dependency tree or bundle contains `sqlite3`, `typedoc`, `qrcode`, Node
   filesystem modules, or the `fluxiq` runtime.
6. Run `publint` and `@arethetypeswrong/cli` against every tarball to validate
   exports, declaration resolution, and ESM metadata.
7. Install the runtime tarball into a clean importer fixture and build a small
   TypeScript Node application without repository `paths` aliases.
8. Verify `npm/pnpm` production installation on Windows and Linux in CI.

The fixture harness uses temporary directories and local tarballs, never the
developer's real importer or `.fluxiq` state.

### Implementation Sequence

4A. Add `@fluxiq/contracts`, move the bounded shared contracts, re-export them
from current runtime paths, and prove no runtime behavior/API change with the
existing tests.

4B. Change the WebSocket client to depend only on contracts. Add a dependency
graph assertion that prevents reintroducing `fluxiq` or Node-only modules.

4C. Add NodeNext build configs, `.js` relative specifiers, project references,
real `dist` output, declaration/source maps, and conditional export maps.

4D. Tighten manifests and dependency ownership: remove unused Drizzle and
React entries, make TypeDoc optional, mark the client public, add engines/files
and release metadata, and create package-specific READMEs.

4E. Implement packed-tarball, clean Node importer, browser client, native
SQLite, export-map, and TypeDoc-absence validation.

4F. Add the CI matrix and release dry-run. Record tarball contents/sizes and
dependency trees as review artifacts.

4G. After owner license confirmation, add the root/package license metadata and
run the final publish-readiness gate. Do not publish to a registry as part of
this point unless the user separately authorizes an actual release.

### Risk Controls And Stop Conditions

- Contract extraction must not create a contracts-to-runtime dependency or a
  runtime/client cycle.
- Keep existing public subpath names during 0.1 compatibility work. Any removal
  or renamed symbol gets a documented compatibility shim or is presented as an
  explicit breaking decision.
- Do not combine point 4 with the responsibility/file restructuring from point
  5. Mechanical import-extension changes and ownership-required contract moves
  are in scope; broad service/UI refactors are not.
- Do not change persistence formats during packaging. Packed migration smoke
  tests must use layout v2 from point 3 unchanged.
- Stop before adding license metadata if ownership is not confirmed. Stop
  before registry publication, signing, provenance upload, or release tags
  without explicit authorization.

Completion criteria:

- All three public packages build JavaScript, declarations, declaration maps,
  and source maps into clean `dist` directories.
- Packed tarballs install and execute in clean consumers without workspace
  links, source aliases, TS loaders, or repository files.
- Existing deliberate `fluxiq` imports resolve from compiled conditional
  exports and type-check under NodeNext.
- The WebSocket client installs/bundles without the Node framework, SQLite,
  TypeDoc, QR generation, React, or Node filesystem dependencies.
- The runtime tarball performs real global/domain SQLite writes and a v1-to-v2
  migration on supported CI platforms.
- Tarballs contain only declared distributable files and pass `publint` plus
  `@arethetypeswrong/cli`.
- Supported environments, ESM-only policy, optional TypeDoc behavior, package
  ownership, and release/version policy are documented.
- License ownership is confirmed and metadata is consistent before any
  registry release.

## 5. Consolidate Code Without Losing Ownership Boundaries

Status: pending; detailed design required before implementation

Problems:

- Many ceremonial files contain only a small type or barrel export.
- At the same time, major UI and Automation Studio orchestration remains in
  several 1,000-2,500-line files.
- `AutomationStudioLive.tsx` mixes data orchestration, project lifecycle,
  recording state, selection, window management, and modal workflows.
- `AutomationStudioService` mixes project storage, recording persistence,
  evidence generation, policy proposal logic, runtime sessions, and migration.
- Generic global-program UI remains concentrated in `live-views.tsx` with
  extensive `any` usage.

Design gate:

- Produce a responsibility map and dependency graph before moving files.
- Agree on module-size and ownership heuristics; do not split by line count
  alone.
- Decide whether repeated program `api/runtime/storage/ui` folders represent
  real boundaries or template-driven ceremony.

Candidate extractions:

- Automation Studio application actions/project coordinator.
- Recording repository and derived-artifact repository.
- Evidence/mining pipeline service.
- Policy proposal/application service.
- Runtime session service.
- Web hooks for project, recording, graph, and workspace state.
- One typed web view module per global program.

Completion criteria:

- No behavior change during structural extraction.
- Public exports remain deliberate and tested.
- Large modules have focused ownership rather than arbitrary line-count splits.
- Redundant empty folders and pass-through barrels are removed.

## 6. Separate Stable Documentation From Runtime Snapshots

Status: pending

Problems:

- Generated documentation is more than half the tracked file count.
- Generated pages include timestamps, local Git state, commit authors, database
  counts, and scheduler state, so they are not deterministic.
- Authored docs contain conflicting current/legacy storage layouts and stale
  claims about Automation Studio and TypeDoc.

Planned direction:

- Keep authored design and operator documentation in `docs/`.
- Generate stable API reference in CI or a documentation release job.
- Store runtime/operator snapshots under ignored `.fluxiq/cache/docs`.
- Split the large Automation Studio architecture document by responsibility.
- Add link and freshness validation.

## 7. Raise The Quality Baseline

Status: pending

Work:

- Add route-level API tests and a permission matrix suite.
- Add targeted React tests for authentication, project lifecycle, policy
  editing, and privileged modals.
- Add coverage thresholds for security- and persistence-sensitive modules.
- Add CI for check, test, build, dependency audit, docs links, and clean package
  installation.
- Add lint/format tooling and repository contribution/security guidance.
- Make malformed JSON state a visible recoverable error instead of silently
  treating it as an empty store.
- Remove unused dependencies and resolve known production advisories.

## Progress Log

- 2026-08-04: Full repository and documentation audit completed.
- 2026-08-04: Remediation sequence captured in this working document.
- 2026-08-04: Point 1 authorization design started.
- 2026-08-04: Point 1 completed and validated. Work stopped before point 2 for
  review as agreed.
- 2026-08-04: Point 2 detailed protocol and storage design recorded.
- 2026-08-04: Point 2 implemented and validated. Work stopped before point 3
  for review as agreed.
- 2026-08-05: Point 3 storage ownership, layout-v2, transactional persistence,
  migration, rollback, and validation design completed.
- 2026-08-05: Point 3 implemented and validated. Importer domain manifests
  remain the naming/branding authority while global editor state remains
  framework-owned and stable across domain selection. Work stopped before
  point 4 for review as agreed.
- 2026-08-05: Point 4 package boundaries, ESM/Node support, compiled export
  strategy, dependency ownership, native SQLite validation, tarball fixtures,
  release gates, and implementation sequence planned in detail.
- 2026-08-05: Point 4 implemented through the publication boundary: added the
  contracts package, compiled conditional exports, browser-client isolation,
  package manifests and READMEs, packed clean-consumer validation, and a
  Windows/Linux Node 22 CI matrix. License metadata, registry publication,
  tags, signing, and provenance remain intentionally blocked pending explicit
  owner decisions.
