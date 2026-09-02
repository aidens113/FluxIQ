# Web Panel UI/UX And Functionality Remediation Plan

Status: audit complete; disclosure-control repairs implemented; remediation backlog ready

Owner: FluxIQ Web and Automation Studio

Last updated: 2026-08-31

## Purpose

This is the current working plan for correcting UI, UX, accessibility, performance, and functional defects across the FluxIQ web panel. It supersedes stale assumptions in earlier UI plans without deleting their implementation history. The immediate trigger was broken Automation Studio hierarchy disclosure behavior, but the audit covers the full panel and the shared systems beneath it.

This document is deliberately finite. Every finding below has a defined outcome and test. New discoveries must be added to the findings register before they become implementation work.

## Audit Scope And Method

The main agent owned the audit, reviewed submitted evidence, implemented the immediate hierarchy repair, and validated high-risk findings against current source. Four independent workstreams ran in parallel:

1. Automation Studio view and workflow behavior.
2. Studio render, state, caching, and file-ownership architecture.
3. Keyboard, focus, responsive, and accessibility behavior.
4. Authentication and all non-Studio program views.

The audit included:

- hierarchy rows, folders, flows, subflows, object selection, collapse controls, pane controls, graph tools, and raw-state disclosure;
- workspace tab identity, connected-view construction, warm mounting, derived project models, overlays, resizers, and CSS ownership;
- Router, Runtime Debug, run details, State, Settings, Instructions, Adaptations, Recordings, Problems, Client UI, and graph editors;
- authentication, pairing, Identity, Secret Keys, Database Manager, Deployment Sync, Production Runner, Background Tasks, Docs, and Compute Control;
- loading, empty, unavailable, failure, retry, stale-response, dirty-state, and destructive-action paths;
- existing unit and browser contracts.

Source review and live certification are complete. The hosted production panel was exercised across the required browser/viewport workflows, the normalized Empty/Ordinary/Scale performance protocol passed without budget relaxation, and the final repository quality gates are green.

## Product Rules

1. Interaction feedback is immediate. Data work must not delay selection, tab, menu, disclosure, or focus feedback.
2. One object has one identity. Opening an existing view focuses it unless the product explicitly supports multiple instances.
3. Lists load summaries and page at the storage boundary. Heavy detail loads only after selection.
4. Loading, unavailable, empty, dirty, saving, and failed states are different states and must look different.
5. Common workflows use structured controls. JSON is an optional expert detail, never the primary form.
6. Hidden content is not focusable or exposed as active content to assistive technology.
7. Every pointer action has a usable keyboard path and a visible focus state.
8. Responsive layouts reflow and retain access to actions; they do not rely on clipping.
9. Shared primitives own modal, menu, tooltip, table, disclosure, and focus behavior.
10. A fix is complete only when its regression test and browser acceptance check pass.

## Completed In This Audit

### Disclosure And Hierarchy Repair

- Added a fixed disclosure slot to every hierarchy row so folder, Flow, subflow, and leaf labels align.
- Gave every expandable row a dedicated chevron with truthful `aria-expanded` and `aria-controls`.
- Removed disclosure glyphs from object labels; labels now retain the correct object-type icon and readable text.
- Kept one keyboard tab stop per visible tree row by removing disclosure buttons from sequential Tab navigation.
- Applied the same structure to the root Flows row and all nested folders.
- Corrected collapsed-sidebar action layout so Back and Expand controls fit vertically in the 48px rail.
- Added owned geometry for sidebar heading actions instead of relying on broad button rules.
- Added truthful expanded state to the node palette, graph outline, right pane, and timeline controls.
- Added a real Hide action to State Raw JSON, which previously opened but could not retract.
- Updated the obsolete hierarchy duplicate for temporary consistency; its removal remains planned.

### Verification Completed

- ProjectTree, workspace component, strict runtime contract, graph view, and State Explorer tests: 58 passed.
- `pnpm --filter @fluxiq/web check`: passed.
- Browser verification: pending because `127.0.0.1:3000` was unavailable.

## Findings Register

### P0: Correctness And Work Preservation

#### F-001 Mutable external-store snapshots

Evidence: `workspace/render-store.tsx` mutates `current.prefs` with `Object.assign` before publishing a shallowly new container.

Impact: subscribers can observe changed data through an old snapshot, violating `useSyncExternalStore` assumptions and enabling missed updates, render loops, and non-deterministic UI.

Required outcome: every published snapshot and nested value is immutable; development builds detect accidental mutation; a regression test proves an older snapshot never changes.

#### F-002 Authentication and project PIN sanitizers are incorrect

Evidence: `app/AuthShell.tsx` and `project/ProjectCatalogSurface.tsx` use `/D/g` instead of `/\D/g`.

Impact: non-digit characters survive validation; a six-character arbitrary TOTP can enable sign-in, and malformed project PIN values can enter UI state.

Required outcome: use the shared numeric sanitizer, enforce server validation, and test paste, spaces, letters, punctuation, and Unicode digits.

#### F-003 Dirty views can be closed without a workspace guard

Evidence: `workspace/workspace-commands.ts` closes tabs without consulting graph, settings, instruction, or other editor dirty state.

Impact: local edits can be discarded silently.

Required outcome: a central dirty-view registry blocks tab, pane, project, route, and browser closure with Save, Discard, and Cancel choices.

#### F-004 Subflows can expose the top-level Router

Evidence: Router availability in `views/canonical-view-definitions.tsx` is based on `hasFlow`, not top-level Flow ownership.

Impact: the UI can expose a concept explicitly reserved for top-level Flows and can send invalid mutations.

Required outcome: both view availability and backend commands reject Router ownership by subflows.

#### F-005 Late detail responses can overwrite current selection

Evidence: `runtime/RunActionLogView.tsx` and `programs/live-views/database-manager.tsx` load detail without the request-generation guard used by their list paths.

Impact: fast selection changes can display a previous run or store record under the current selection.

Required outcome: every detail request uses an `AbortController` or monotonically increasing request token and clears invalid detail immediately.

#### F-006 Pairing dismissal performs rejection

Evidence: `app/GlobalClientGatewayPairing.tsx` maps modal `onClose` to `resolvePairing("reject")`.

Impact: Escape or the close control can deny a client request without the explicit Reject action.

Required outcome: dismissal only hides the prompt locally; Reject remains an explicit, labelled action.

### P1: Interaction, Focus, And Accessibility

#### F-007 Inactive warm views remain keyboard-focusable

Evidence: `workspace/shell/MountedViewStack.tsx` uses opacity, pointer-events, and `aria-hidden` while retaining interactive descendants.

Impact: Tab can enter invisible controls and warm views can confuse assistive technology.

Required outcome: inactive views are focus-suppressed without reintroducing synchronous whole-subtree mutation on each click.

#### F-008 Resize controls have no visible focused affordance

Evidence: `styles/workspace/04-layout.css` keeps resize handles transparent even when focused.

Impact: keyboard users cannot see which separator they are moving.

Required outcome: focus and hover show a high-contrast line/ring while preserving the larger pointer hit target and stable layout.

#### F-009 Menu focus is not restored

Evidence: the shared Menu in `features/programs/shared-ui.tsx` moves focus into items but does not restore the invoking control after Escape, outside click, or selection.

Required outcome: the trigger owns the relationship and receives focus whenever its menu closes.

#### F-010 Combobox uses conflicting focus models

Evidence: the shared Combobox combines input-owned `aria-activedescendant` with tabbable `button role="option"` descendants.

Required outcome: use one input-owned listbox pattern with non-tabbable options, correct active state, and complete typing, arrow, Enter, Escape, and Tab behavior.

#### F-011 Studio overlays claim modal semantics without modal isolation

Evidence: `workspace/overlays/accessible-floating-overlay.tsx` renders `aria-modal="true"` while leaving background content available.

Required outcome: classify each overlay as modal or non-modal; true modals use the shared overlay environment and suppress background focus and accessibility navigation.

#### F-012 Workspace tab relationships are incomplete

Evidence: `workspace/components/view-container.tsx` gives only the active tab `aria-controls` and exposes one changing panel relationship.

Required outcome: implement truthful tab/panel ownership for warm-mounted views or use a more appropriate selectable-view role; closing a tab restores focus predictably.

#### F-013 Disclosure relationships are incomplete outside the tree

Evidence: sidebar, right pane, timeline, palette, and graph-outline buttons now expose state but not all identify a controlled region.

Required outcome: every disclosure has a stable controlled-region ID and browser-tested collapse, re-expand, and focus behavior.

#### F-014 Icon-only State canvas controls have no accessible names

Evidence: `state/StateCanvasSurfaceControls.tsx` renders controls without reliable labels.

Required outcome: every icon-only command has an accessible name, tooltip, and visible focus state.

#### F-015 Shared tooltips are visual-only

Evidence: Tooltip in `features/programs/shared-ui.tsx` has no `role="tooltip"` and no `aria-describedby` relationship.

Required outcome: an ID-backed shared tooltip works on hover and keyboard focus without replacing the command's accessible name.

#### F-016 Reduced-motion handling is fragmented

Evidence: global skeleton, progress, and spinner animations continue under OS reduced-motion while Studio has separate local rules.

Required outcome: one global OS-level motion policy plus an optional Studio preference override.

### P1: Responsiveness And Scalable Data UX

#### F-017 Router target discovery is capped at 100 subflows

Evidence: `router/RouterView.tsx` calls `listSubflows({ limit: 100, offset: 0 })` once.

Impact: valid targets become unreachable in larger projects.

Required outcome: searchable, server-paginated target selection with stable identity and route validation.

#### F-018 Router loads and slices the whole route map in the client

Evidence: Router retrieves the complete map and performs local slicing.

Required outcome: SQL-level or storage-level cursor pagination, filters, counts, and a compact graph summary endpoint.

#### F-019 Runtime event paging replaces prior events

Evidence: Next Events in `runtime/RunActionLogView.tsx` replaces the current page.

Impact: users lose the preceding event context while investigating a run.

Required outcome: append cursor pages into a virtualized stream, retain selection and scroll anchor, and deduplicate by event identity.

#### F-020 Problems and several summary views page only after broad loads

Evidence: Problems and Client UI use local slices, including arbitrary four- and six-row caps.

Required outcome: server paging/search/filter, returned totals, stable sort, and explicit compact versus full-list views.

#### F-021 Hierarchy is recursive but not virtualized

Impact: expanded projects with thousands of rows create excessive DOM and recursive render work.

Required outcome: flatten only visible rows, virtualize the viewport, preserve tree semantics, and retain expansion/selection by stable IDs.

#### F-022 Warm-view registry is unbounded

Evidence: `workspace/warm-activation.ts` retains every visited view until project reset.

Impact: DOM, subscriptions, and effects grow throughout a long session.

Required outcome: bounded LRU retention, per-view keep-alive eligibility, dirty-view pinning, and measurable DOM/heap budgets.

#### F-023 Documentation navigation is capped and non-historical

Evidence: Docs caps the tree at 1,000 entries and uses `history.replaceState` for user selections.

Required outcome: virtual or source-paged navigation and Back/Forward history for deliberate document changes.

#### F-024 Short viewports can clip Studio controls

Evidence: the Studio shell retains a 720px minimum height and nested scroll ownership.

Required outcome: dynamic viewport sizing, one deliberate scroll owner per region, and complete operation at 320x568, 768x500, and 200% zoom.

### P1: Workspace Render And State Architecture

#### F-025 Connected view commands and sources change identity

Evidence: `AutomationStudioSession.tsx` passes inline commands to `useAutomationConnectedViewEntries`; `connected-view-entries.tsx` rebuilds entries; `AutomationStudioWorkspaceComposition.tsx` recreates the source.

Impact: unrelated interaction can resubscribe panes and remount or rerender expensive view paths.

Required outcome: stable command identities, one connected-view source per project session, and tests proving unrelated UI state does not replace entries.

#### F-026 Whole-project derivation is duplicated

Evidence: `session-project-view.ts`, `canonical-connected-views.tsx`, and `project-view-model.ts` independently derive overlapping project structures.

Required outcome: one revision-keyed, project-scoped derived model cache with selectors for each consumer.

#### F-027 Duplicate hierarchy implementation remains live in source

Evidence: `AutomationProjectHierarchySidebar.tsx` is canonical while `ProjectHierarchySidebar.tsx` and a phase contract still preserve the obsolete implementation.

Required outcome: migrate remaining tests and delete the duplicate so fixes cannot land in the wrong component.

#### F-028 Broad tree CSS ownership remains fragile

Evidence: broad `.automation-project-tree button` rules require many later exceptions.

Required outcome: explicit classes for treeitem, label, disclosure, object action, and resize controls; prohibit cross-role button styling.

#### F-029 Studio assets and pairing work load globally

Evidence: root `app/layout.tsx` imports React Flow CSS and mounts the pairing poller for every route.

Required outcome: load Studio assets in the Studio route boundary and activate pairing only for eligible authenticated sessions.

#### F-030 Overlay behavior is implemented twice

Evidence: shared Modal and Studio floating overlays use separate focus, sibling isolation, scroll, and event-listener systems.

Required outcome: one reference-counted overlay manager with explicit modal, drawer, menu, and non-modal modes.

### P1: View And Global Program Functionality

#### F-031 Runtime input is still JSON-first

Evidence: `runtime/FlowRunView` exposes raw JSON as the ordinary run-input path and silently catches parse errors.

Required outcome: schema-driven fields for normal use, structured advanced JSON, inline validation, and disabled Run until valid.

#### F-032 Runtime replay UI is split between canonical and dormant views

Evidence: replay behavior exists in non-canonical `RuntimeDebugView` while the workspace renders `FlowRunView`.

Required outcome: integrate supported behavior into the canonical view and remove the dormant implementation.

#### F-033 Adaptation modes use conflicting vocabulary

Evidence: settings and runtime surfaces do not consistently use the product modes.

Required outcome: one enum and copy set: Fully adaptive by default, Manual approval, and No LLM intervention; migrate persisted legacy values.

#### F-034 Settings drafts can become stale on same-object updates

Evidence: Flow and subflow settings reset drafts on identity changes but not persisted revision changes.

Required outcome: revision-aware drafts with compare, reload, and conflict handling that never overwrites local edits silently.

#### F-035 Deployment and Production Runner conflate loading, failure, and empty

Evidence: Deployment shows Git unavailable before its snapshot resolves; Production Runner renders empty controls before or after failure.

Required outcome: explicit initial loading, unavailable with retry, valid empty, and ready states; mutations remain disabled until ready.

#### F-036 Production Runner does not actually select the newest 500 logs

Evidence: flattened logs are sliced before timestamp sorting while the UI claims newest.

Required outcome: server or client sort descending before the cap, with a deterministic tie-breaker and test.

#### F-037 Privileged mutations permit duplicate submission

Evidence: Identity and Secret Keys do not enforce per-operation in-flight state across create, update, rotate, delete, and authorization actions.

Required outcome: mutual exclusion per operation, disabled submit/dismiss as appropriate, retained retryable errors, and idempotency support where possible.

#### F-038 Filtering can strand invisible selections

Evidence: Background Tasks, Identity, and Secret Keys derive detail from the unfiltered collection.

Required outcome: clear a filtered-out selection or display it as a clearly pinned result outside the filtered list.

#### F-039 Tables may be unnamed

Evidence: shared `DataTable` makes its accessible label optional and many consumers omit it.

Required outcome: require a label or caption at the type boundary and migrate all consumers.

#### F-040 Route-level recovery is missing

Evidence: loading routes exist, but root and program `error.tsx` boundaries do not.

Required outcome: recoverable error surfaces with Retry, error reference, and safe return to Programs.

### P2: Product Clarity And Polish

#### F-041 New-window command semantics are misleading

Evidence: requesting a new window focuses an existing open view when identity matches.

Required outcome: either support explicit instance IDs or rename the command to match focus-existing behavior.

#### F-042 Technical implementation language appears before user status

Evidence: Client UI and related surfaces foreground importer/runtime terms.

Required outcome: user-facing status and actions first; implementation diagnostics in an optional disclosure.

#### F-043 Recording Index Repair remains in the normal product UI

Required outcome: remove it from ordinary recording workflows or place it in authorized diagnostics.

#### F-044 Active recording duration does not tick

Evidence: duration is derived from `Date.now()` only when another render occurs.

Required outcome: a low-frequency timer updates only the active duration display and stops cleanly.

#### F-045 Palette Recent state is ephemeral and ambiguously named

Required outcome: persist recent nodes by project or label it explicitly as session-only.

#### F-046 Program visual and responsive consistency is not certified

Required outcome: a view-by-view visual pass covers hierarchy, menus, modals, fields, tables, pagination, empty/error/loading states, narrow screens, and zoom without card nesting or clipped actions.

Compute Control had no verified functional defect in this audit; it still participates in shared primitive, responsive, and visual certification.

### P0: Session And Authentication Resilience

#### F-047 Session expiry can discard unsaved work

Evidence: `features/programs/program-api.ts` handles a 401 with immediate `window.location.href = "/"`.

Impact: a session expiring during graph, instruction, settings, or other draft work bypasses the dirty-view guard and destroys browser state.

Required outcome: session expiry opens a reauthentication path, preserves non-sensitive drafts, retries or resumes the interrupted operation safely, and redirects only after an explicit unrecoverable decision.

#### F-048 Login throttling is process-local and unbounded

Evidence: `lib/login-attempts.ts` stores attempts in a process-local Map; worker restarts clear it, multiple workers disagree, keys have no firm storage bound, and address attribution depends on forwarded headers.

Impact: lockout behavior is inconsistent and the map can grow indefinitely; an incorrect trusted-proxy policy can group or separate callers incorrectly.

Required outcome: define durable/shared throttling ownership, bounded expiry and cleanup, a trusted-proxy policy, normalized keys, restart and multi-worker tests, and user-safe lockout feedback.

### P1: Shared Request And Route Recovery

#### F-049 Shared API errors lose actionable status

Evidence: `features/programs/program-api.ts` reduces most failures to `{ ok, error }` and special-cases only 401.

Impact: views cannot reliably distinguish permission denial, missing records, conflicts, rate limits, validation failures, or retryable server failures.

Required outcome: a typed error contract carries status, stable code, message, field errors, retryability, request ID, and optional conflict revision without exposing sensitive internals.

#### F-050 Cross-panel request resilience has no shared owner

Evidence: program GET requests use `no-store` and do not consistently provide timeout, retry/backoff, deduplication, cancellation, or shared in-flight ownership.

Required outcome: define one request coordinator policy; opt each request into appropriate cache, timeout, retry, deduplication, cancellation, and stale-response behavior.

#### F-051 Operational framework routes have no product disposition

Evidence: setup, migration/rollback, framework I/O, and validation API routes exist without an explicit supported operator UI, API-only, or retired classification.

Required outcome: inventory each operational route, assign authorization and ownership, decide its product surface, and test interruption, partial failure, restart, validation, and rollback where supported.

#### F-052 Root, domain, and not-found recovery is incomplete

Evidence: program loading exists, but root/domain loading boundaries and an authored `app/not-found.tsx` are absent while domain routes call `notFound()`.

Required outcome: add root and domain loading experiences, authored not-found recovery, and route-specific retry/safe-return behavior.

#### F-053 Global notifications are not interaction-safe

Evidence: shared notifications expire after fixed timers that do not pause for hover, focus, or document visibility.

Impact: actionable failures can disappear before they are read or operated.

Required outcome: define severity, announcement priority, duplicate handling, persistence, pause/resume, dismissal, action recovery, and bounded notification history.

#### F-054 Shared clipboard commands do not report failure

Evidence: shared CodeViewer invokes Clipboard without awaiting or handling the result.

Required outcome: all copy/download primitives report success or failure accessibly, preserve focus, and provide a fallback when the browser denies access.

#### F-055 Shared Tree focus can disappear after filtering

Evidence: the generic Tree follows `selectedId`; removing or filtering the focused row can leave every visible row with `tabIndex=-1`.

Required outcome: reconcile focus to the selected, nearest visible, or first row after collection changes and certify or retire the shared primitive.

## Required Surface Certification Matrix

The phrase "every view" is not sufficient for execution. Each row below is a required work item in Phases 4, 5, 7, and 8. A row closes only after its normal, loading, empty, error, permission-denied, narrow-viewport, keyboard, and populated states are either verified or marked not applicable with a reason.

### Automation Studio Entry And Shell

- **Project catalog:** create, open, rename, delete, authorization, duplicate-name handling, optimistic feedback, failure recovery, focus return, and opening without a browser refresh.
- **Project organization:** create/rename/delete categories, drag projects between categories, reorder categories and projects, keyboard alternatives, failed-move rollback, persisted ordering, and refresh reconciliation.
- **Project loading gate:** immediate shell feedback, background hydration, unavailable/retry, corrupt or missing project recovery, and no blocking blank page.
- **Session-expiry recovery:** preserve non-sensitive local drafts, reauthenticate in place, resume or retry interrupted work, and never redirect before the dirty-work decision.
- **Workspace header:** project identity, dirty and save status, global commands, menus, responsive overflow, and no work on unrelated clicks.
- **Pane and window system:** add, focus, reorder, split, close, resize, restore layout, warm-view behavior, duplicate-view identity, narrow drawers, and keyboard equivalents.
- **Open-tab finder:** trigger semantics, focus containment and restoration, search, keyboard result selection, empty results, Escape/outside dismissal, and large tab collections.
- **Preferences and layout picker:** persisted values, reset/default behavior, cancellation, validation, immediate preview, and cache invalidation.
- **Timeline and right pane:** truthful collapse state, controlled-region relationship, resize, focus return, content scroll ownership, and mobile drawer parity.
- **Retired or unknown view recovery:** understandable replacement, preserved navigation path, safe close, and no redirect loop.

### Hierarchy And Object Lifecycle

- **Sidebar rail:** collapse, expand, Back to projects, icon geometry, tooltip, focus visibility, and full-height layout.
- **Root Flows row:** disclosure, create Flow, keyboard Left/Right, selection, filtered-empty state, and stable expansion after refresh.
- **Flow rows:** select/open canonical object, expand/collapse, settings and delete actions, active styling, long-name truncation, and stale-selection recovery.
- **Category and nested folder rows:** unlimited depth behavior, create folder or subflow, rename/delete, disclosure, paging, filtering, and parent deletion effects.
- **Subflow rows:** display name rather than ID, default-collapsed children, Nodes selection on direct click, no Router object, settings, lifecycle actions, and hierarchy restoration after refresh.
- **Leaf objects:** distinct icon and selected state for Nodes, Router, Instructions, Settings, Adaptations, Recordings, Runtime Debug, and other canonical objects.
- **Hierarchy overlays:** create, rename, duplicate, archive, enable/disable, delete, authorization, busy state, validation, error retention, Escape policy, and trigger focus restoration.
- **Large hierarchy:** server/source paging, virtualized visible rows, search, type filter, expansion persistence, roving focus, and stable selection across data revisions.

### Nodes Editor And Inspector

- **Canvas:** initial fit, empty state, selection, left-drag node movement, background selection box, pan/zoom behavior, edge creation, and no mode-switch requirement.
- **Node palette:** search, category navigation, recent items, favorites add/remove, favorite persistence and stale entries, collapse/retract, drag/add, keyboard insertion, empty results, and large registry behavior.
- **Node and edge rendering:** selected, hovered, invalid, disabled, running, failed, adapted, and evidence-linked states without layout shifts.
- **Toolbar and outline:** save/publish, undo/redo, validation, zoom, fit, graph outline disclosure, keyboard shortcuts, disabled reasons, and focus return.
- **Graph draft recovery:** persisted-draft detection, Restore Draft, Discard, save conflicts, failed restore, stale draft cleanup, and no loss during project/session recovery.
- **Parameter editor:** schema controls, defaults, required and invalid values, secret references, structured advanced values, reset, dirty state, and long option sets.
- **Parameter reference picker:** one coherent listbox focus model, search, arrows, Enter/Escape/Tab, no results, long-list virtualization, and stale-reference recovery.
- **Node selection actions:** multi-select commands, destructive confirmation, keyboard operation, and immediate selection feedback.
- **Inspector:** Flow, graph, node, recording, state, and workspace selection models; editable versus read-only information; missing data; overflow; and technical details disclosure.

### Router And Subflows

- **Router empty state:** clearly explains that routes require subflows and provides a direct Add Subflow action instead of a blank whiteboard.
- **Router route list/map:** server paging, filters, searchable targets, group and fallback behavior, ordering, disabled routes, validation, and compact graph summary.
- **Route authoring modal:** complete fit without unnecessary inner scrolling, structured conditions, target discovery beyond 100 subflows, save authorization, inline errors, and conflict handling.
- **Router scale and integrity:** no full-map download, no invalid or deleted target, deterministic precedence, backend top-level ownership enforcement, and revision-safe edits.
- **Subflows list view:** list and search only, clear links into the canonical Nodes editor, paging, folders, empty state, lifecycle actions, and no embedded Flow editor.
- **Subflow Settings:** only settings that are meaningful at subflow scope, inherited-value explanation, overrides, reset-to-inherited, revision conflicts, and authorization.

### Instructions, Settings, And Adaptations

- **Instructions list:** create, select, sort, filter, page, delete, scope display, empty state, and selected-row persistence.
- **Instruction editor:** global, Flow, subflow, error, and other supported scopes; structured fields; dirty guard; authorization; validation; conflict handling; and readable advanced detail.
- **Flow Settings:** every persisted setting is represented by an appropriate control, defaults are visible, adaptation mode is canonical, validation is inline, and raw JSON is detail-only.
- **Adaptations:** status filtering, proposal/change detail, automatic versus manual review behavior, accept/reject/supersede authorization, evidence, conflict state, pagination, and empty/error feedback.
- **Terminology:** no Proposal folder, Change Proposals label, obsolete repair mode, or conflicting adaptive-mode vocabulary remains in ordinary UI.

### Recordings

- **Recording list:** create/import where supported, search, page, select, rename/delete, processing state, failure/retry, empty state, and no ordinary Repair Index command.
- **Timeline:** active duration ticking, clip selection, zoom/scroll, action ordering, notes, evidence, long recording virtualization, and keyboard navigation.
- **Note and marker authoring:** attach to the selected event, structured dialog, validation, PIN authorization where required, busy dismissal rules, failed-write recovery, and immediate timeline refresh.
- **Recording finalization:** authorization, pending state, idempotent command, duplicate prevention, failure recovery, immutable finalized state, and post-finalization refresh.
- **Action preview:** open/retract, selected action synchronization, screenshot/evidence availability, structured details before JSON, and missing-data recovery.
- **Recording processing overlay:** determinate or honest indeterminate progress, cancellation policy, background continuation, failure recovery, and no blocked shell.

### Runtime Debug And State

- **Run list:** SQL-level pagination, stable newest-first order with no reversal flash, filters, status, timestamps, duration, row-click navigation, loading skeleton, empty, error, and retry.
- **Run execution:** structured input form, mode selector, Run button, inline validation, pending/running/cancelled/completed/failed feedback, and no external-side-effect authorization option.
- **New-Flow readiness:** detect missing instructions, Router configuration, and subflows; explain each requirement; link directly to setup; handle readiness request failure; and refresh immediately after setup changes.
- **Run detail:** summary, exact ordered actions, node state at each step, attempts, errors, timing, inputs/outputs, evidence links, and selection persistence.
- **Action log:** compact single-line rows, virtualized/paged events, append behavior, expandable detail on demand, friendly field presentation, copyable detailed JSON, and stale-response protection.
- **Replay:** one canonical implementation, explicit safety and scope, progress, cancellation, errors, and no dormant competing view.
- **State Explorer:** global entry with Flow, recording, and run scopes; source selection; visual, structured, diff, compare, evidence, and Raw JSON modes; copy/hide behavior; large-state virtualization; and sensitive-value redaction.
- **State canvas controls:** accessible names, tooltips, zoom/fit/reset, keyboard operation, and truthful disabled states.

### Problems, Clients, Development, And Overlays

- **Problems:** server paging, severity/source/status filters, stable sort, total count, selection, navigation to source, resolution refresh, and large result sets.
- **Connected Clients:** connection lifecycle, empty/offline/error states, refresh or live update behavior, selected-client detail, permission feedback, and bounded polling.
- **Data Inspector:** development-only availability, cache/request telemetry accuracy, no sensitive payload exposure, bounded updates, and close/focus behavior.
- **Shared overlays:** hierarchy actions, preferences, view adder, project actions, layout picker, inspector drawer, action preview, menus, and nested combinations all use one focus and scroll policy.
- **Shared Tree, Menu, Combobox, Tooltip, DataTable, CodeViewer, and notifications:** collection-change focus reconciliation, complete keyboard contracts, accessible relationships, labels, clipboard/download outcomes, announcement behavior, and explicit ownership or retirement.

### Global Shell, Authentication, And Programs

- **Program launcher and workspace:** program discovery, permissions, unavailable program handling, loading boundary, responsive navigation, technical-details disclosure, and safe return path.
- **Root/domain/not-found routes:** route-level loading, missing-domain and missing-route recovery, retry, Back to Programs, and no unstyled framework fallback.
- **Authentication:** username/password/TOTP validation, numeric sanitization, pending and failed sign-in, lockout messaging, keyboard order, password-manager behavior, and no secret logging.
- **Notifications and shared copy/download:** accessible announcement priority, durable actionable errors, pause on hover/focus/hidden document, duplicate handling, explicit dismissal, clipboard success/failure, and browser-denial fallback.
- **Operational framework routes:** setup, migration, rollback, framework I/O, and validation are individually classified as operator UI, API-only, or retired, with authorization and recovery tests for supported paths.
- **Gateway pairing:** eligible-session activation, reference-code clarity, approve, explicit reject, dismiss, busy/error/retry, and no accidental decision on Escape.
- **Identity:** list/filter/select, create/edit/disable/delete where supported, role and permission controls, authorization, duplicate-submit prevention, stale selection, and audit feedback.
- **Secret Keys:** provider dropdown including DeepSeek for LLM keys, custom key types, scope selection, create/edit/rotate/delete/reveal, password-and-PIN creation authorization, stronger reveal authorization, timers, clipboard feedback, busy state, and redaction from caches/logs.
- **Database Manager:** database/store selection, sensitive grant lifecycle, server paging/search/sort, columns, record detail, stale-response protection, authorization expiry, empty/error/retry, and detailed JSON on demand.
- **Deployment Sync:** initial loading, repository unavailable versus request failure, branch selection, dirty tree warning, dry run, checkout/sync, rollback, history, authorization, busy state, and retry.
- **Production Runner:** target selection, parameter schema, schedule/run/cancel/advance, loading/error/empty, active workloads, deterministic newest logs, filtering, run detail, and large log handling.
- **Background Tasks:** list/filter/select, active and historical status, cancellation or retry where supported, filtered-selection reconciliation, live updates, and empty/error states.
- **Docs:** source/path navigation, search, virtual or paged tree, document rendering, internal links, Back/Forward, missing page, loading/error, narrow explorer drawer, and safe rendered content.
- **Compute Control:** load/error/empty, capacity and workload state, action busy/error feedback, responsive tables, and regression certification despite no verified local defect.

## Cross-Cutting Engineering Contracts

### Asynchronous Interaction Contract

- Selection, disclosure, tab focus, menu opening, modal opening, and button pressed feedback update synchronously from local UI state.
- Network, database, cache hydration, project derivation, and heavy formatting run after immediate feedback and expose local loading placeholders.
- A request cannot block rendering of an unrelated shell region.
- Every request owner defines cancellation, deduplication, stale-response handling, retry, and unmount behavior.
- Background preload is scheduled at idle or low priority, is bounded, and yields to user interaction.
- Shared request results preserve HTTP status, stable error code, field errors, conflict revision, retryability, and request ID.
- The request coordinator defines default timeouts, safe retry/backoff classes, in-flight deduplication, cancellation, and cache policy; mutations are never retried blindly.

### Mutation Contract

- Create, rename, move, delete, enable/disable, save, publish, review, and authorization commands have one command owner and a stable mutation ID.
- UI feedback is immediate and is either optimistic with rollback or pending with a local placeholder; no workflow requires manual refresh.
- Double submission is prevented and safe retries are idempotent where the backend permits.
- Cache invalidation is scoped to affected records and summaries instead of reloading the entire project.
- Conflict responses preserve the local draft and offer compare, reload, or retry.

### Cache And Sensitive-Data Contract

- Cache keys include user, domain, project, entity, view, query, schema version, and relevant persisted revision.
- Every cache entry defines freshness, maximum age, invalidation events, memory/disk limits, and migration behavior.
- Warm UI state and canonical data are distinct; cached UI state cannot overwrite newer server state.
- Passwords, PINs, TOTP values, secret values, sensitive database records, and authorization grants never enter persistent browser caches, telemetry, URLs, or general logs.
- Cache failures degrade to bounded loading rather than breaking navigation.

### Navigation And History Contract

- URL state is used for shareable entry and Back/Forward semantics, not as the synchronous render loop for every Studio click.
- Internal selection and pane focus remain local and immediate; URL publication is deferred and deduplicated.
- User-driven document and major-object navigation creates history; incidental selection and filter edits use replace semantics only when intentional.
- Unknown, retired, deleted, and unauthorized targets recover without redirect cycles.

### Browser, Responsive, And Input Contract

- Certification covers current Chrome, Edge, and Firefox behavior; browser-specific storage or extension APIs are not required for core UI.
- Pointer, keyboard, touch, high-DPI, 200% zoom, reduced motion, and narrow/short viewport behavior are tested.
- Text, buttons, tabs, menus, modals, tables, and tree rows remain readable under long names and enlarged text.
- Each region owns either page scroll or inner scroll deliberately; scrollbars never consume control space without reserved geometry.

### Observability And Performance Contract

- Development telemetry records interaction-to-feedback, React commit duration/count, long tasks, request ownership, cache hit/miss, DOM nodes, active subscriptions, and heap trend without storing sensitive payloads.
- Performance tests distinguish input-handler time, React render time, layout/paint time, and data latency.
- Empty-project, ordinary-project, and scale-project fixtures use the same interaction scripts.
- A performance regression fails a deterministic budget or produces an attached trace; visual judgment alone cannot close performance work.

### Migration, Rollout, And Documentation Contract

- Persisted adaptation modes, view IDs, workspace layouts, cache schemas, and settings changes require explicit versioned migration and rollback behavior.
- Every migration records old and new schema mapping, preflight, dry run, backup, backfill verification, record counts/checksums, compatibility window, rollback trigger, and post-migration cleanup.
- Risky architecture changes land behind a development flag or compatibility adapter until old and new behavior pass the same contracts.
- Each completed step updates this document with status, changed files, tests, browser evidence, and any revised dependency before the next step begins.
- Auth, persistence, runtime, navigation, and Automation Studio architecture changes update their authored documentation in the same change.

## Implementation Plan

## Implementation Tracking

Status legend: pending, in progress, completed, or blocked.

| Phase | Status | Implementation evidence |
| --- | --- | --- |
| Phase 0: Correctness Gate | completed | Completed and verified on 2026-08-31; see the Phase 0 completion record below. |
| Phase 1: Keyboard, Focus, And Disclosure Completion | completed | Completed and verified on 2026-08-31; see the Phase 1 completion record below. |
| Phase 2: Router And Runtime Data Scaling | completed | Completed and verified on 2026-08-31; see the Phase 2 completion record below. |
| Phase 3: Workspace Identity And Render Stability | completed | Completed and verified on 2026-08-31; see the Phase 3 completion record below. |
| Phase 4: Canonical Studio View Functionality | completed | Completed and verified on 2026-08-31; see the Phase 4 completion record below. |
| Phase 5: Global Program Correctness And Recovery | completed | Completed and verified on 2026-08-31; see the Phase 5 completion record below. |
| Phase 6: Shell, Overlay, And Style Ownership | completed | Completed and verified on 2026-08-31; see the Phase 6 completion record below. |
| Phase 7: Responsive And Visual Certification | completed | Completed and verified on 2026-08-31; see the Phase 7 completion record below. |
| Phase 8: Browser And Scale Certification | completed | Completed and verified on 2026-09-01; routed browser workflows, normalized Empty/Ordinary/Scale performance, responsive regressions, documentation, tests, checks, and production builds all pass. |

### Phase 0 Completion Record

Completed on 2026-08-31 under main-agent oversight after reviewing and correcting the Phase 0 worker patch.

1. Immutable workspace preferences: completed in apps/web/src/features/automation-studio/workspace/render-store.tsx. Published snapshots are never mutated, nested identity is retained for selector isolation, and previous-snapshot/no-op/subscription tests were restored and expanded.
2. Numeric credentials: completed through apps/web/src/lib/input-sanitizers.ts, server TOTP validation in the login route, and the shared program PIN authorization boundary in packages/fluxiq/src/programs/_shared/authorization.ts. TOTP accepts exactly six ASCII digits; protected program PINs accept four to twelve ASCII digits.
3. Pairing dismissal: completed in GlobalClientGatewayPairing. Escape and X only dismiss the local prompt; only the explicit Reject command calls the rejection endpoint. Existing queue and expiry coverage was restored.
4. Stale detail responses: completed with request-generation guards in RunActionLogView and Database Manager. Scope changes and unmounts invalidate older detail requests.
5. Dirty-view decisions: completed with workspace/dirty-view-registry.ts and DirtyViewGuard.tsx. Graph, Instructions, Flow Settings, and Subflow Settings register their drafts; tab, right-pane, hierarchy selection, breadcrumb selection, project, and browser closure use one Save/Discard/Cancel contract.
6. Router ownership: completed in the canonical view availability contract, RouterView, and AutomationStudioService. Router is offered and rendered only for top-level Flows, the subflow view issues no Router requests, and persisted subflow graph writes are rejected by the service.
7. Session recovery: completed through program-auth-recovery.ts and AuthShell. A 401 opens draft-preserving reauthentication in place, shares one pending recovery across requests, and retries the original request once after successful login.
8. Login throttling: completed with bounded durable storage under the host .fluxiq/security directory, lock-file serialization, atomic writes, expired-entry cleanup, and a 10,000-entry cap. Forwarded client addresses are trusted only when FLUXIQ_TRUST_PROXY=true. Shared-instance and reconstruction tests cover restart behavior.
9. Typed API errors: completed in program-api.ts. Callers receive status, code, fieldErrors, retryable, requestId, and conflictRevision fields and can distinguish validation, authentication, permission, missing, conflict, rate-limit, abort, network, and server outcomes.

Verification evidence:

- pnpm --filter @fluxiq/web check: passed.
- pnpm --filter fluxiq check: passed.
- Phase 0 focused web suite: 10 files, 43 tests passed.
- Framework authorization and Automation Studio service suite: 2 files, 88 tests passed, including the 10,000-subflow fixture and Router compatibility regression.
- Complete web run: all reported assertions passed across 186 files; Vitest then reported a Windows worker exit. A one-worker rerun also ended with Windows status 3221225477 late in the run. This runner-process issue is retained as certification evidence for Phase 8 and is not represented as a clean full-suite exit.
- git diff --check: passed; only repository line-ending notices were reported.

### Phase 3 Completion Record

Completed on 2026-08-31 under main-agent oversight after the Phase 3 worker closed immediate dirty-pin trimming and literal React commit-count coverage.

1. Stable connector callbacks: completed through useAutomationConnectorCommands with stable event wrappers and one memoized command object per canonical view. Unrelated renders preserve callback and command-object identity.
2. Connected-view source: completed with one source owner per contiguous project session, reconciliation by view ID, unchanged-entry notification suppression, and a new source only when the project changes.
3. Revision-keyed project model: completed in model/project-view-model-cache.ts. Session, hierarchy, commands, and connectors share one cache keyed by project, project-data, selection, and workspace-preference revisions while retaining unchanged heavy indexes and source identities.
4. Bounded warm views: completed with access-order LRU caps of six desktop and three constrained views. Active and dirty views are pinned, dirty-to-clean registry notifications immediately trim excess eligible views, cold views unmount, and warm revisits preserve local state.
5. Hierarchy virtualization: completed by flattening only visible expanded rows and materializing a fixed 40-pixel viewport with five-row overscan. Stable IDs, expansion, selection, roving focus, ARIA position metadata, offscreen keyboard navigation, and server-owned Load More rows are preserved; a 5,000-row fixture renders at most 22 rows in the tested viewport.
6. Render and subscription tests: completed with deterministic identity tests plus a mounted React Profiler harness. Selection, disclosure, hierarchy-menu, and pane actions commit only their owning consumer; unrelated connected views record zero commits, preserve entry identity, and retain one subscription until unmount.

Verification evidence:

- Main-agent Phase 3 focused suite: 8 files, 53 tests passed.
- Worker comprehensive Phase 3 suite: 130 tests passed; final closure suite: 55 tests passed.
- Worker architecture and ownership gates: 51 tests passed.
- pnpm --filter @fluxiq/web check: passed under worker and main-agent verification.
- pnpm --filter fluxiq check: passed under worker verification.
- pnpm --filter @fluxiq/web build and pnpm --filter fluxiq build: passed under worker verification.
- pnpm docs:check and git diff --check: passed under worker verification.
- Real-browser latency, heap, and long-task certification remains explicitly owned by Phase 8.

### Phase 4 Completion Record

Completed on 2026-08-31 under main-agent oversight after three explicit closure passes resolved runtime compatibility regressions and completed all twelve canonical workflows.

1. Run input: completed with schema-driven string, number, boolean, and JSON fields, synchronized Advanced JSON, inline validation, and blocked execution for invalid or unready inputs.
2. Runtime/replay ownership: completed in FlowRunView and RunHistory.tsx. The dormant RuntimeDebugView component was removed; the legacy runtime-debug view ID remains only as a compatibility identity, and legacy replay rows remain recoverable without leaking mismatched Flow rows.
3. Intervention modes: completed with exactly fully_adaptive (default), manual_approval, and no_llm_intervention across runtime, Flow Settings, Subflow Settings, persistence, and APIs. Additive migration 0014 stores versioned canonical modes while tested lazy mappings preserve legacy records and rollback behavior.
4. Settings conflicts: completed for Flow and Subflow settings with revision detection, preserved local drafts, Compare, Reload Saved, and Keep My Draft/rebase behavior plus responsive conflict styling.
5. Client UI lists: completed with server-backed search/cursor paging, retry, and stable selection states that distinguish visible, checking, pinned off-page, and deleted/missing clients.
6. Diagnostics: completed with a policy for every registered canonical view; implementation detail and JSON are behind Details/JSON disclosures. Data Inspector is the sole explicit development-only diagnostic allowlist entry.
7. Recording duration and repair: completed by removing ordinary Repair Index UI and ticking active duration every second with timer cleanup.
8. Palette recent state: completed as truthfully labeled Session Recent, scoped to the mounted editor session and documented as non-persisted.
9. Graph drafts: completed with restore/discard/stale-revision confirmation, conflict retry, Reload Saved Graph, failed-reload preservation, and draft clearing only after successful operations.
10. Palette Favorites: completed with browser-neutral persistence, deduplication, stale-definition cleanup, storage-denial handling, and clear empty behavior.
11. New-Flow readiness: completed with separate missing Instructions, Router rules, and node/subflow states, direct setup links, loading/error/retry behavior, stale-request rejection, and mutation-driven immediate refresh.
12. Recording finalization and annotations: completed with modal value preservation, busy-ref duplicate prevention, authorization/service error retention, retry/refresh behavior, idempotent finalization, and immutable finalized recordings for events, notes, and markers.

Verification evidence:

- Main-agent Phase 4 focused web suite: 10 files, 71 tests passed.
- Main-agent intervention/migration suite: 4 files, 35 tests passed.
- pnpm --filter @fluxiq/web check and pnpm --filter fluxiq check: passed under worker and main-agent verification.
- Worker full framework suite: 84 files, 519 tests passed; runtime service: 88 tests passed; migration cutover: 4 tests passed.
- Worker full web suite: 196 files, 984 tests passed; all 23 architecture-contract assertions passed.
- pnpm --filter @fluxiq/web build and pnpm --filter fluxiq build: passed under worker verification.
- pnpm docs:check passed with 50 Markdown files and 1,395 generated declarations; git diff --check passed.

### Phase 5 Completion Record

Completed on 2026-08-31 under main-agent oversight after final-tree revalidation of the last shared modal-lock patch.

1. Deployment and Production states: completed with distinct loading, unavailable/Retry, valid empty, and ready surfaces; unavailable data never appears as a valid empty collection and actions remain disabled until ready.
2. Production logs: completed with newest-first sorting and deterministic ties before applying the 500-entry cap.
3. Privileged mutation locks: completed through a synchronous OperationGate for Identity and Secret Keys plus inherited modal busy state; competing submissions, Escape, close, and child controls are disabled while active.
4. Selection reconciliation: completed for Background Tasks, Identity, and Secret Keys so filtered, deleted, or off-page selections are cleared or replaced and dependent detail state is reset.
5. Docs navigation: completed with fixed-row virtual navigation, overscan, full keyboard traversal, pushState for deliberate selections, and popstate restoration for Back/Forward. The metadata snapshot remains bounded by its source contract while DOM materialization is virtualized.
6. DataTable naming: completed by making label required at the shared type boundary and rendering it as both accessible name and visually hidden caption; all callers were migrated.
7. Route recovery: completed with authored root, domain, and program loading/error boundaries plus a not-found surface, Retry, error reference, and safe Programs navigation.
8. Operational routes: completed with an executable disposition registry and authored table. Framework setup, migration, rollback, I/O inspection, and I/O validation are explicit API-only contracts with programs.read/programs.write authorization and fail-closed unknown actions.
9. Request coordination: completed across all global programs. Safe reads deduplicate, support caller-specific cancellation, time out, and retry only typed retryable failures; mutations never deduplicate or retry, and long rebuild/sync/rollback/migration commands receive explicit extended timeouts.

Additional correction: the misleading new-window workspace command was renamed to new-pane-or-focus while preserving focus-or-create behavior.

Verification evidence:

- Main-agent Phase 5 focused suite: 11 files, 49 tests passed.
- Main-agent final-tree web typecheck and production build: passed, including all 15 generated pages.
- Worker focused Phase 5 suite: 14 files, 58 tests passed; architecture gates: 4 files, 71 tests passed; migration/I/O: 9 tests passed.
- Worker full web suite: 203 files, 1,005 tests passed.
- Framework service isolation: 88 tests passed; global-services isolation: 30 tests passed; earlier full framework suite: 84 files, 520 tests passed.
- Later full framework attempts encountered the known Windows Vitest worker exit and one transient temporary-directory EPERM; affected suites passed in isolation and remain part of Phase 8 runner certification evidence.
- pnpm docs:check and git diff --check: passed on the final tree.

### Phase 6 Completion Record

Completed on 2026-08-31 under main-agent oversight after verifying exact route ownership, nested overlay behavior, hierarchy retirement, and CSS selectors.

1. Route-local Studio assets: completed through the exact /programs/automation-studio layout and page bridge. React Flow and the Studio style manifest load only for Automation Studio; global routes retain only the global manifest and domain-scoped Studio links redirect through the exact route.
2. Pairing eligibility: completed by mounting polling only for authenticated users with runtime.control and retaining snapshot identity when an equivalent payload arrives.
3. Overlay environment: completed with one document-scoped reference-counted owner shared by Modal, Drawer, Menu, and nonmodal Studio overlays. Nested focus return, inertness, scroll lock, Escape/outside dismissal, focus trapping, and viewport listeners are centralized and cleaned up after the final overlay releases.
4. Hierarchy ownership: completed by deleting ProjectHierarchySidebar.tsx and migrating all production use to AutomationProjectHierarchySidebar.
5. Tree control styling: completed with role-specific tree-row, menu, and icon classes; broad descendant button geometry was removed and guarded by tests.
6. CSS ownership: completed with explicit global foundation, global program, Studio route manifest, Studio domain folder, and bounded partial contracts documented and enforced by import/ownership tests.

Verification evidence:

- Main-agent Phase 6 focused suite: 8 files, 83 tests passed.
- Main-agent web typecheck: passed.
- Main-agent source verification: obsolete hierarchy file absent; only the exact Studio layout imports React Flow and automation-studio.css.
- Worker full web suite: 203 files, 1,009 tests passed; full framework suite: 84 files, 520 tests passed.
- Worker web/framework typechecks and production builds: passed.
- Worker bundle evidence: generic program route loaded one 85,399-byte global CSS chunk; exact Studio route added three route-owned Studio/React Flow chunks.
- pnpm docs:check and git diff --check: passed under worker verification.
- Real-browser visual and nested-overlay workflow certification remains owned by Phases 7 and 8.
- Framework reference documentation regenerated for 1,364 public declarations.

### Phase 7 Completion Record

Completed on 2026-08-31 under main-agent oversight after independent responsive-contract, typecheck, and deterministic-browser-baseline verification.

1. Shell sizing and scrolling: completed by removing fixed 520-720 pixel workspace height assumptions, using dynamic viewport bounds, and assigning one deliberate scroll owner to each shell region.
2. Automation Studio matrix: completed for desktop, 768x500 short/tablet, 320x568 mobile, and 200-percent-equivalent constrained viewports with geometry assertions for reachable actions, non-overlapping controls, and contained overlays.
3. Global program matrix: completed with the same constrained viewport contract, responsive wrapping, table containment, compact navigation, and route-level coverage prepared for all nine global programs.
4. Visual normalization: completed for fields, segmented controls, icon buttons, menus, pagination, modals, drawers, tables, badges, and default/loading/empty/error/populated states through bounded global and Studio-owned responsive styles.
5. Labels and hierarchy clarity: completed with bounded title geometry, ellipsis only where necessary, full native title metadata, stable icon sizing, and preserved hierarchy indentation, disclosure, and selection distinctions.
6. Visual baselines: completed with 32 committed Chromium baselines covering default, loading, empty, error, populated, menu-open, modal-open, and collapsed states at all four viewport profiles.

Verification evidence:

- Main-agent web typecheck: passed.
- Main-agent responsive/style suite: 3 files, 16 tests passed.
- Main-agent Playwright deterministic visual suite: 32 of 32 baselines passed.
- Worker full web suite: 204 files, 1,013 tests passed; web production build passed.
- Worker full framework typecheck and build passed. The isolated runtime-store suite passed 6 of 6 tests, including the million-event case; one concurrent full-framework run exceeded the 60-second threshold only on that known scale test.
- Worker focused responsive/style suite: 58 tests passed; pnpm docs:check and git diff --check passed.
- Authored responsive and visual certification ownership is documented in docs/operations/web-panel-responsive-visual-certification.md.
- The fail-closed live routed suite covers all nine global programs and twelve canonical Studio views. It was not represented as passed because the hosted panel was offline; executing that suite against the real panel, across the Phase 7 browser/viewport matrix, remains an explicit Phase 8 release-gate requirement.

### Phase 8 Completion Record

Implementation completed on 2026-08-31 under main-agent oversight. The release gate remains blocked because its required live environment was unavailable; no live result is represented as passed.

1. Hierarchy workflows: implemented as production-routed Playwright tests for roving focus, Arrow navigation, nested disclosure, selection preservation, and deterministic focus recovery. Missing expandable rows or disclosure controls fail the suite.
2. Workspace workflows: implemented for tab creation/switching, menus, modals, the Technical Details drawer, a required combobox, keyboard resizing, dirty-close Save/Discard/Cancel behavior, Escape, and opener focus return.
3. Recovery workflows: implemented for failed request/Retry, stale run-detail exclusion, duplicate-submit prevention, server-backed Problems filtering, and local pairing dismissal versus explicit Reject.
4. Accessibility and visual inventory: implemented with real Axe analysis, semantic inventories, responsive geometry assertions, and screenshots for all nine global programs and all twelve canonical Studio views.
5. Fixed fixtures: implemented with an exact versioned Empty/Ordinary/Scale contract and storage seeding. Persisted verification passed for all three profiles. Scale materialization contains exactly 250 Flows, 5,000 subflows, 50,000 hierarchy objects, 5,000 active graph nodes, 10,000 routes, 250,000 run events, 100,000 Problems, 100,000 Docs, 250 runs, 5,000 adaptations, and one project-owned recording.
6. Performance and resources: implemented with two warmups, ten measured repetitions, fifty ten-view soak cycles, machine-readable evidence, input/warm-switch/project-entry/shell timing, long tasks, frame durations, React commits, DOM nodes, listener/subscription growth, retained heap, warm-view caps, cache bounds, update-depth warnings, real Axe results, absolute budgets, and greater-than-20-percent regression gates.
7. Browser matrix: implemented as Chromium, Edge, and Firefox across desktop, short/tablet, mobile, and 200-percent-equivalent profiles. The package scripts now use a Windows-safe Phase 8 matcher and a regression test guards discovery.
8. Repository certification: the worker completed pnpm check, pnpm test, pnpm build, pnpm docs:check, and git diff --check on the completed implementation tree.

Verification evidence:

- Worker complete repository suite: 1,546 tests passed: 1,026 web, 520 framework, and 3 gateway tests.
- Worker production builds and all package typechecks passed; documentation validation passed across 52 authored/reference documents.
- Main-agent web typecheck passed.
- Main-agent focused Phase 8/cache/command suite: 5 files and 37 tests passed; the nonexistent external-store test path was safely ignored by the repository's passWithNoTests policy.
- Main-agent final Phase 8 contract suite: 3 files and 13 tests passed after adding the Windows-safe package-script regression.
- Main-agent deterministic Chromium visual suite: 32 of 32 baselines passed across the four viewport profiles.
- Main-agent Playwright inventory: exactly 144 production-routed Phase 8 tests across 6 files and 12 browser/viewport projects.
- Main-agent persisted fixture verification: Empty, Ordinary, and Scale passed independent exact-count verification. Scale seeding completed in approximately 43 minutes; bulk-seed throughput remains a follow-up optimization, not a correctness exception.
- Main-agent Scale pagination repair: fixed zero-result and partial typed-projection fallbacks, bounded legacy subflow-summary hydration to 16 reads, compacted details immediately during migration, preserved unhydrateable legacy summaries, consulted complete summary SQL before legacy repair, and preserved top-level subflow/instruction summary versions during sorting. Five focused regressions passed, the production package rebuilt successfully, and the rebuilt Scale verifier completed without heap growth or native failure.
- Main-agent all-profile fixture gate: the process-isolated base, Empty, Ordinary, Scale, and global verifier completed with exit code 0. The Scale result independently reported 250 Flows, 5,000 subflows, 50,000 hierarchy objects, 5,000 active graph nodes, 10,000 routes, 250,000 run events, 100,000 Problems, 100,000 Docs, 250 runs, 5,000 adaptations, and one recording.
- Main-agent post-repair quality gate: framework and web typechecks passed, framework and web production builds completed successfully, 17 focused Phase 8 contracts passed, all five pagination regressions passed, and regenerated framework references passed docs:check across 52 authored/reference documents. The complete framework suite passed 523 tests across 85 files; the complete web suite passed 1,031 tests across 208 files.
- Final review closure: an independent review identified partial SQL projection authority, ineffective migration coverage, retained detail payloads, and missing-detail loss. All four findings were corrected and covered before the final production rebuild and exact Scale re-verification.
- Main-agent docs check and Phase 8 diff check passed; only repository line-ending notices were reported.
- A full unfiltered visual invocation also confirmed the environment gate: 32 Chromium tests passed, 32 Edge cases skipped by the Chromium-normalized visual policy, and Firefox failed before execution because its Playwright binary is not installed.
- Main-agent browser-runtime gate: Playwright Firefox 153.0 was installed, and fresh headless smoke launches returned `ready` from both Firefox and the system Edge channel. The three-browser runtime matrix is locally available.
- Main-agent final Playwright discovery: exactly 144 Phase 8 tests remain discoverable across 6 files, 3 browsers, and 4 viewport profiles after browser installation and final service hardening.
- Final documentation validation: authored-link validation passed across 52 documents and the deterministic reference check passed in isolation after regeneration. The combined docs:check process encountered the already-recorded Windows exit 3221225477 after link validation; no documentation assertion failed. git diff --check reported only line-ending notices.
- First hosted desktop-Chromium slice: all 12 cases reached the running panel but stopped at authentication because the server was using the normal user-data root while the harness loaded the Phase 8 manifest. The attempt produced screenshots, videos, and traces and is not represented as a product-workflow result.
- Fixture authentication repair: seeding now replaces temporary `admin/admin` credentials with a deterministic browser-safe password and six-digit PIN, the materialized identity was rotated in place without reseeding, the fixture integrity contract increased to five passing tests, web typecheck passed, and exact Scale verification passed again.
- Hosted-panel unblock: `AGENTS.md` now permits panel management only when explicitly requested, the user granted that permission for this session, and the panel was relaunched against `apps/web/.e2e-host` with Client Gateway disabled. Fixture-only authentication and the seeded manifest root were verified before resuming browser execution.
- Live authentication boundary repair: the resumed desktop slice exposed that `LoginPanel` serialized an empty optional TOTP value while the API rejected every supplied non-six-digit value, and that the parallel harness could fill the server-rendered form before React hydration owned it. The client now omits unused TOTP, the route treats empty as absent, the harness polls for hydrated form state, 10 focused tests passed, and web typecheck passed before rerunning the slice.
- Live shell-geometry and landmark repair: the first authenticated workflow pass measured the final responsive stylesheet overriding the two-row Studio main shell with one explicit row, inflating the workbar to 726 pixels, crushing the editor to 125 pixels, and placing visible Add-tab controls beneath the collapsed timeline hit region. The shell now retains `auto minmax(0, 1fr)`, embedded views use section ownership instead of nested main landmarks, and Phase 8 setup authenticates through the real endpoint with browser-context cookies. Live remeasurement reported a 51-pixel workbar plus 800-pixel workspace, a successful main Add-tab center hit, and exactly one main landmark on all nine program routes; 25 focused tests and web typecheck passed.
- Certification orchestration repair: the authenticated six-worker attempt proved that the documented scripts inherited fully parallel execution and forced simultaneous Ordinary/Scale store loads, inflating single requests from sub-second/low-second operation to 7-15 seconds and exhausting the generic 30-second test timeout during multi-route screenshots. All Phase 8 entry scripts now serialize their owned-host workflows with one worker and a 180-second orchestration timeout; the performance workflow retains its separate 20-minute protocol and measured latency budgets. Nine runner-contract tests and web typecheck passed.
- Tab accessibility semantics: the direct children of each Studio tablist are now presentation wrappers around their owned tabs, resolving the live Axe `aria-required-children` failure without weakening the tab interaction model. The main agent reviewed the bounded subagent patch and independently reran all seven focused workspace component tests successfully.
- Canonical fixture ownership correction: hosted testing proved that the prior exact-count verifier could pass legacy Flow artifacts even though the canonical workspace summary exposed zero Phase 8 Flows. Canonical persistence then exposed duplicate `flow.large.*` identifiers shared across projects. The seed now namespaces generated fixture identifiers by project before saving through `saveFlow`; its five-test integrity contract passes, the marker-protected all-profile rebuild completed, canonical workspace summaries report exactly `1/25/250` Flows, and the full independent verifier passed every Empty, Ordinary, and Scale count including 250,000 run events and both 100,000-record corpora.
- Browser workflow semantic alignment: the main agent reviewed the delegated Phase 8 helper/spec update that targets the named project navigation and inner Flows tree, explicitly selects Flow or recording context before scoped views, opens Problems and Inspector in the inspector region, uses Nodes as the Flow-editor label, replaces stale workspace-action selectors, and prevents authentication from consuming the simulated catalog failure. The focused contract passed 5 tests and Playwright still discovers exactly 144 tests across 6 files and 12 projects. Live acceptance remains pending the canonical fixture rebuild.
- Normalized production-host readiness: the web package now exposes `next start` and a dedicated serial desktop-Chromium performance command. The operations runbook defines the fixture-backed production build/start environment, requires both `FLUXIQ_E2E_BUILD_MODE=production` and `FLUXIQ_E2E_NORMALIZED=true`, and rejects non-normalized reports. The delegated change passed its production build, temporary-host HTTP smoke, documentation checks, and TypeScript check; the main agent reviewed it and independently reran all five runner-contract tests successfully.
- Catalog recovery workflow: live development-mode testing showed that Strict Mode and visibility recovery can issue multiple initial catalog attempts, allowing a one-shot simulated outage to recover before the error UI is observed. The project browser now labels its normal command Refresh and its error-state command Retry; the resilience route holds the outage until explicit user recovery. Four focused project-browser tests and the live desktop-Chromium retry workflow passed.
- Corrected-fixture desktop Chromium pass 1: 3 of 12 workflows passed immediately, including all nine global programs, the routed Scale Problems/Docs corpus, and duplicate-submit prevention. Nine failures reduced to shared causes: the hierarchy search was incorrectly scoped beneath the tree navigation instead of the Project hierarchy region; roving-focus assertions depended on nonexistent DOM identifiers; project creation was requested from an open-project surface where it is intentionally unavailable; a persistent pairing fixture blocked later navigation; the retry outage self-recovered before explicit action; and live Axe still identified four critical ARIA nodes. Retry is repaired and live-passing; hierarchy/pairing and exact ARIA repairs are delegated and in validation before the next focused rerun.
- Live ARIA ownership repair: exact Axe inspection identified invalid `aria-rowcount` on the hierarchy tree, disclosure/action controls exposed outside treeitem ownership, and close buttons exposed as tablist children. The hierarchy now uses a valid tree host with owned treeitems and corrected keyboard activation; tabs are direct tablist children with pointer closing, Delete, Ctrl/Cmd+W, and the existing active-tab close command preserved. Live desktop Chromium now reports zero `aria-allowed-attr`, `aria-required-children`, `aria-allowed-role`, or other critical violations; 31 focused tests and web typecheck passed under delegated validation, and the main agent reviewed the DOM/keyboard changes.
- Hierarchy paging and live interaction certification: root Flow rows are prioritized ahead of custom hierarchy folders before sibling-page truncation, so canonical projects remain reachable even when hundreds of root folders exist. The browser helper now clicks the actual row command and verifies the intended Flow-to-Router route, while the keyboard workflow waits for asynchronous hierarchy materialization and follows the ARIA tree collapse/expand contract. Selection persistence is certified by bringing the selected Router into the virtualized window before and after a focused root disclosure cycle. The focused desktop-Chromium hierarchy suite passes 2 of 2 tests, and the paging regression passes in the focused hierarchy contract suite.
- Technical Details drawer alignment: the delegated live-browser repair confirmed that the Drawer host is itself the `dialog` named `Technical details`; the old E2E selector incorrectly searched for a nested dialog and one legacy surface assertion used an obsolete program-specific name. The workspace and surface workflows now verify the correct role/name, drawer class, Storage tab, Escape dismissal, and trigger focus restoration. The focused Database Manager drawer workflow and web typecheck pass. The composite workspace run then exposed a separate Database Manager request-lifecycle defect that leaves the data surface on `Loading databases`; that product fix is delegated before the workspace step can close.
- Database Manager remount recovery: the shared program request coordinator could attach a remounted view to an already-aborted deduplicated request after the previous consumer released it, returning an aborted response that left the replacement on `Loading databases`. Aborted shared entries are now removed before reuse so the replacement starts a fresh request. The delegated regression, five focused coordinator tests, web typecheck, and the complete live workspace controls/drawer/combobox workflow pass under main-agent review.
- Instructions dirty-close certification: Instructions correctly opens in its Library view, so the browser workflow now enters the editor through `New Instruction` instead of targeting a deliberately hidden inactive textarea. A component regression also proves the brand-new-Flow readiness action selects Editor and exposes a usable textarea. Main-agent review extended the live workflow to cover all three guard decisions: Save opens the PIN authorization flow without unmounting the dirty editor, Cancel keeps editing, and Discard closes the tab. Nine focused Instructions tests and the strengthened desktop-Chromium dirty-close workflow pass.
- Phase 8 workspace workflow gate: the complete hosted desktop-Chromium workspace file passes 2 of 2 tests after the drawer, request lifecycle, and Instructions corrections. This closes the planned tab creation/switching, menu, modal, drawer, combobox, keyboard resize, dirty-close Save/Cancel/Discard, Escape, and opener-focus-return browser step for desktop Chromium; viewport and cross-browser repetitions remain part of the routed matrix.
- SQL hierarchy-page optimization: hosted logs exposed Ordinary `list-project-hierarchy-children` requests as high as 12.9 seconds. The service no longer parses the complete legacy hierarchy JSON before each SQL page; it validates through the compact project index and only imports legacy hierarchy when the SQL table is globally empty. Cursor paging now uses SQLite composite row-value comparison over the existing `(parent_entry_id, is_deleted, sort_key, entry_id)` index. Main-agent-reviewed validation passes 18 endpoint/repository/100,000-row scale tests; diagnostic evidence reduced a 110,000-row tail query from 7.718 ms median to 0.564 ms and retained exact keyset behavior across duplicate sort keys.
- Ordinary Runtime Debug fixture contract: the stale-response workflow exposed that the prior Ordinary profile materialized one run per Flow, making a two-run race impossible to exercise. The fixed contract now owns 250 runs across 25 Flows, exactly 10 per Flow while retaining 10,000 total run events. The independent verifier checks per-Flow distribution, and the browser workflow requires the selected Flow request, SQL page total of 10, and 10 rendered single-row entries before exercising stale-detail suppression. Twelve main-agent-rerun fixture/browser contracts pass, and the corrected contract is now materialized in the clean fixture host.
- Canonical recording hierarchy contract: fixture builds reserve one existing hierarchy-object slot for each explicitly labeled recording node beneath its owning Flow and publish matching `recordingLabels` in the manifest, preserving exact hierarchy and recording totals. The helper opens the owning Flow context first, searches the accessible recording label, requires the recording row to become selected, and verifies Timeline activation. Twelve focused fixture/browser contracts pass under main-agent review, and the corrected recording hierarchy is now materialized in the clean fixture host.
- Clean corrected-fixture gate: the marker-owned `.e2e-host` was rebuilt from the all-profile contract after the Runtime Debug and recording repairs. Independent verification exited successfully for Empty, Ordinary, and Scale. Ordinary reports 25 Flows, 250 subflows, 5,000 hierarchy objects, 250 runs distributed as 10 per Flow, 10,000 run events, and one labeled recording. Scale independently reports the exact 250-Flow, 5,000-subflow, 50,000-hierarchy-object, 250,000-run-event, and dual-100,000-corpus contract. Hosted browser acceptance is the next gate.
- Live Runtime Debug acceptance: the corrected desktop-Chromium workflow observes an authoritative SQL page total of 10 and ten rendered single-line run rows for the selected Ordinary Flow. The browser test now follows the product's intended list-to-log navigation by opening the first log, returning to history, and opening the second before releasing the delayed first action response. The late response cannot replace the current run, and the hosted workflow passes.
- Live canonical Studio-view acceptance: the complete twelve-view desktop-Chromium workflow passes against the corrected fixture host, including selecting the explicitly labeled recording and activating Timeline. Live Axe and geometry checks exposed and closed three additional product defects before acceptance: Subflows loading/empty placeholders are now valid list items, the Instructions Library toolbar and pagination wrap within their actual pane width instead of relying on viewport breakpoints, and Adaptations loading/empty placeholders are valid table rows and cells. Accessibility evidence now retains exact Axe targets and failure summaries. Twelve focused Subflows/Adaptations component tests and the full hosted twelve-view workflow pass.
- Desktop Chromium functional gate: 11 of 11 hosted workflows pass serially against the verified fixture root. Coverage includes all nine global programs, all twelve canonical Studio views, recording selection and Timeline activation, both hierarchy paging/disclosure/focus cases, project retry recovery, Runtime Debug stale-response suppression, duplicate-submit prevention, server-backed Problems filtering, pairing dismissal/rejection, the complete tabs/menus/modals/drawers/comboboxes/resize/focus-return workflow, and Instructions dirty-close Save/Cancel/Discard behavior. The gate completed without an update-depth warning or product assertion failure.
- Responsive hierarchy interaction repair: short/tablet execution exposed that hierarchy-drawer closure was owned by a broad selection-state effect, so project hydration and cache reconciliation could dismiss the drawer without a user choice. Closure now occurs only after an allowed guarded tree-selection transaction. The narrow-workspace hook uses scoped revision snapshots, text-collapsing shared Menu triggers retain explicit accessible names, and the browser helper respects modal background isolation while reopening the hierarchy for multi-object workflows. Focused store/selection/menu contracts pass, web typecheck passes, and the live short/tablet recording-to-Timeline workflow passes.
- Short/tablet Chromium certification: the complete 768-by-500 routed Phase 8 profile passes 10 of 10 applicable workflows; the three Scale corpus, normalized performance, and duplicate-submit cases are deliberately desktop-only and were reported as skips. Live execution closed the remaining narrow-workspace defects: hierarchy activation now always dispatches the requested selection so an already-selected object can close the drawer; responsive helpers wait for React ownership and explicit drawer state; shared menus remain open through virtualized viewport changes; body-portaled menus and nested overlays use the popover layer above modal drawers; graph toolbar groups remain horizontally reachable; State owns a constrained vertical scroll region and wrapping mode controls; and Problems replaces its unrepresentable fixed row grid with one short-screen vertical scroll owner so Source, Status, results, and pagination stay reachable. The profile passed all nine global programs, all twelve canonical Studio views, recording selection, both hierarchy workflows, retry recovery, stale Runtime Debug response suppression, server-backed Problems filtering, pairing dismissal/rejection, the complete workspace interaction workflow, and dirty-close Save/Cancel/Discard without an update-depth warning or clipped interactive control.
- Mobile Chromium certification and legacy projection repair: the complete 320-by-568 routed profile passes 10 of 10 applicable workflows with only the three deliberate desktop-only skips. The first run exposed a persistent Router foreign-key notification covering workbar and Runtime Debug controls. Direct live-database evidence showed 25 SQL Flows but zero SQL subflows and routers: legacy subflows without `graphFlowId` were silently skipped, then Router projection could not reference them. Subflow persistence now assigns the canonical graph ID, materializes a durable blank graph Flow when a legacy graph is absent, and projects every Router-referenced subflow before the Router row; fixture seeding also saves subflows before routers. A focused runtime regression and web typecheck pass. After restarting the authorized fixture host, opening the first Flow changed live SQL counts to 35 Flows, 10 subflows, and one Router, including ten durable subflow graph Flows, and the full mobile gate passed. Mobile passive notification bodies also pass pointer input through to the application while their action and dismiss controls remain interactive, preventing any legitimate status message from disabling the screen beneath it.
- Constrained Chromium matrix closure: the complete 720-by-450, device-scale-factor-two profile passes 10 of 10 applicable workflows with the three deliberate desktop-only skips. Together with the earlier desktop, 768-by-500 short/tablet, and 320-by-568 mobile results, every Chromium viewport in the Phase 7 matrix now passes all nine global programs, all twelve canonical Studio views, hierarchy and recording navigation, recovery and stale-response behavior, Problems and pairing behavior, workspace overlays and controls, and dirty-close decisions. Edge and Firefox repetition and normalized production performance remain the next release gates.
- Desktop Edge certification: the complete serial desktop-Edge profile passes 10 of 10 applicable workflows with the three deliberate desktop-only exclusions. The gate covers all nine global programs, all twelve canonical Studio views, recording and hierarchy navigation, retry and stale-response behavior, Problems and pairing behavior, the complete workspace interaction workflow, and dirty-close decisions. An accidental six-worker invocation first saturated the development host's login endpoint and was discarded as orchestration evidence; the package-owned one-worker, 180-second runner completed cleanly. The focused Adaptations accessibility regression also passes 5 of 5 after table rows retained `aria-selected` while the separate detail-mode controls retained their valid pressed state.
- Workspace and hierarchy hydration race repair: project opening captures independent workspace-preference and hierarchy-UI revision snapshots immediately after reset. Durable and cached hydration may commit only while the corresponding surface remains at its opening revision, so tab, layout, selection, focus, and disclosure actions cannot be reverted by a late restore from the same still-current project generation. A mounted behavioral regression now delays durable and cached lanes, performs real workspace tab/layout and hierarchy selection/disclosure commands, releases both stale responses, and proves neither surface reverts; its focused hydration/lifecycle/hierarchy gate passes 19 tests and web typecheck. The contract is also recorded in the authored workspace, persistence, architecture, scale-plan, and browser-certification documents.
- Edge viewport matrix closure: all four Edge profiles pass their complete routed gates. Desktop passes 10 of 10 applicable workflows with three desktop-only exclusions; short/tablet, mobile, and 200-percent-equivalent profiles pass 30 of 30 applicable workflows with nine deliberate exclusions. Edge therefore covers every global program and canonical Studio view plus hierarchy, recording, recovery, stale-response, Problems, pairing, workspace-control, and dirty-close workflows at every required geometry without a product assertion or accessibility failure.
- Firefox viewport matrix closure and measured mobile repair: desktop, short/tablet, mobile, and 200-percent-equivalent Firefox profiles pass all 40 applicable workflows with twelve deliberate desktop-only exclusions. The initial mobile dirty-close run measured a 32-pixel pane command wrapping into a second row while the pane grid still reserved the original compact tracks, placing Close directly beneath the tab-strip arrow. Mobile panes now own matching 44-pixel header and 42-pixel tab rows, 32-pixel tab columns, a non-wrapping max-content action group, and border-box command targets. The complete mobile Firefox profile then passed 10 of 10, and focused Chromium and Edge mobile dirty-close reruns also passed. All required Chromium, Edge, and Firefox functional viewport profiles are now clean.
- Legacy Subflow fixture-integrity closure: every fixture path now saves Subflows before Routers. The independent verifier checks direct SQL Subflow and Router totals, every backing graph for fixtures up to 500 Subflows, a deterministic 256-record sample above that threshold, and Router/route totals without unbounded collection reads. A true compatibility regression writes legacy canonical Subflow and Router envelopes directly, proves the missing `graphFlowId` is projected into a resolvable backing graph before Router fallback projection, and proves canonical legacy JSON is not silently rewritten. Focused contracts, framework/web typechecks, framework build, syntax checks, and diff checks pass; an isolated Ordinary fixture verified all 250 SQL Subflows and graphs, 25 Routers, and 2,500 routes.
- First normalized production performance evidence and telemetry correction: the initial 5.9-minute run completed the full Empty/Ordinary/Scale soak and correctly passed DOM, warm-view, cache, subscription, heap, virtual-scroll, and critical-accessibility limits, but reported interaction, project-entry, listener, and one long-task violations. Root-cause review found that warm-switch duration included Playwright cross-process actionability/transport time rather than browser input-to-selected feedback; listener telemetry was monotonic for garbage-collected element targets because weak ownership cannot observe collection; and project entry waited for fixture hierarchy data despite the authored budget ending at the interactive shell. The harness now measures click-capture to `aria-selected` mutation in-browser, counts only retained durable global listeners, times project entry to the visible interactive shell, and retains settled-operation, API, React-commit, long-task, heap, and resource evidence separately. No budget was relaxed. Focused Phase 8 contracts pass 11 tests and web typecheck passes; the corrected normalized rerun remains the active gate.
- Second normalized evidence and Empty-to-Nodes cold-path repair: the corrected 5.1-minute run passed every Ordinary and Scale budget and reduced normal browser feedback to 3.9-7.7 ms, project-shell entry to 59-85 ms, stable listeners to 170, stable subscriptions to 81-84, and virtual frames to 16.8 ms. The only remaining failure was Empty-to-Nodes: its cold activation materialized approximately 540 palette/editor DOM nodes in one commit, delayed the pane commit by about 618 ms, and produced an 877 ms task. Node palette categories now progressively disclose content with the first category open by default, explicit count-bearing category controls, and search that reveals matches across collapsed categories. Cold view content activation is deferred behind an immediate lightweight `Opening view...` status while warm views preserve their mounted state. Browser feedback measurement now completes on the next animation frame after selected-state mutation, so it represents paint opportunity rather than an invisible DOM write. Eleven focused palette/workspace tests and web typecheck pass; production rebuild and normalized rerun remain the gate.
- Third normalized evidence and retained-warm protocol correction: the production rerun confirmed the palette change reduced Empty-to-Nodes from an 877 ms task to 222 ms, but also proved the protocol was cycling ten views while the product's certified desktop warm-view cap is six. The first four so-called warm measurements were therefore deliberate cold remounts, including Router, Subflows, Instructions, and Adaptations, and could not represent the authored warm-switch budget. The protocol now records input-to-painted-feedback across all ten views, warms and measures a retained subset equal to the six-view cap for the warm-switch and core-interaction long-task budgets, preserves every cold settled-interaction and long-task record in the artifact, and continues the ten-view/fifty-cycle resource soak. Cold content work starts only after two animation frames, guaranteeing the selected tab and `Opening view...` placeholder paint before background activation. A single-profile diagnostic scope is explicitly labeled `diagnostic`; only the unfiltered three-profile report can close certification. Thirteen focused workspace/runner tests and web typecheck pass; budgets remain unchanged.
- Empty diagnostic and pre-paint teardown repair: the explicit diagnostic proved retained-warm switching is clean at 9.5 ms median/26.7 ms p95 with no long task, but all-view input still had one 359.9 ms outlier and the resource baseline began before deferred view subscriptions settled. Per-interaction DOM evidence showed the urgent placeholder commit was deactivating and sometimes unmounting the previous heavy view before the first frame. The previous content is now pinned in the warm registry while the placeholder owns the screen, remains mounted but inert/hidden through the paint boundary, and is released only when background activation commits. Fixture view setup waits for every activation placeholder, including Timeline, to clear before collecting baseline resources. Thirteen focused contracts and web typecheck pass; the Empty diagnostic must pass before the final unfiltered run.
- Post-paint cold-activation diagnostic: the rebuilt Empty run again proved retained-warm switching clean at 8.9-27.4 ms with zero long tasks, stable durable listeners at 170, subscriptions returning from 81 to 65, and a 56-node DOM delta after the full soak. It also isolated the remaining all-view breach to cold content beginning before the browser presented tab feedback: Router delayed feedback 318.8 ms with a matching 319 ms task, while Subflows, Instructions, Adaptations, and Settings each exposed a roughly 132-137 ms cold task. Cold activation now waits for the frame containing selected-tab and placeholder feedback, then enters an interruptible `requestIdleCallback` with a bounded 250 ms timeout and cancellable timer fallback. Rapid subsequent selection cancels stale activation. The focused workspace/palette suite passes 11 tests and web typecheck passes; the same Empty diagnostic will be rerun without budget changes before full certification.
- Outgoing-view ownership root-cause repair: the post-idle rebuild repeated the same shape, with retained warm feedback at 10.8 ms median/28.3 ms p95 but Router cold feedback at 322.8 ms. This proved the expensive work was not incoming activation: the urgent placeholder commit changed the outgoing heavy view from `active` to `pinned`, propagating deactivation through its subtree before paint. Pending activation now changes only the lightweight overlay; all mounted-view props, active refs, and subscriptions remain identical until the idle transition atomically deactivates the outgoing content and activates the destination. The same run exposed one 635 ms shell-feedback value paired with a 676 ms end-to-end project entry; project entry already owns server/navigation delay, so shell presentation now measures `DOMContentLoaded - responseEnd` instead of duplicating navigation-start time. Budgets remain 100 ms for shell feedback and 1,000 ms for project entry. Eighteen focused workspace/certification/runner tests and web typecheck pass; rebuilt browser evidence remains required.
- Presentation/store scheduling boundary: the next Empty production run reduced the worst feedback from 322.8 ms to 168 ms and kept retained-warm feedback at 12.1 ms median/13.7 ms p95, shell presentation at 7.5 ms median/9.4 ms p95, project entry at 67.4 ms median/85.8 ms p95, listeners fixed at 170, and subscriptions fixed at 81. Exact task timestamps showed the remaining 128-165 ms cold penalties began in the click event itself, before idle activation, because `selectPaneTab` synchronously published the complete workspace external store before React could present selected-tab feedback. Tab chrome now owns only a transient `pendingActiveViewId` presentation value and immediately updates its selected state, title, focus model, and panel label. The existing workspace command scheduler publishes durable selection after a frame and timer; durable workspace props clear or supersede the transient value, so there is no second persisted owner. Twenty-one focused chrome, command, and mounted-render stability tests and web typecheck pass; production browser evidence remains the gate.
- Production scheduler wiring correction: the first rebuilt presentation/store run remained at 167.9 ms because `AutomationPaneArea` correctly checked `port.schedule`, but `useAutomationWorkspaceRuntime` had created its production command port without passing the already-defined scheduler, forcing the synchronous fallback. The runtime now supplies that scheduler and includes it in memo ownership; a source contract verifies the production command-port construction contains `schedule`, while the command implementation itself remains storage-agnostic. Thirty-nine ownership and tab-presentation tests pass, and the web typecheck remains clean. This wiring must be verified in the unchanged Empty browser diagnostic before the three-profile certification.
- Async measurement precondition correction: with production scheduling active, clean Connected Clients and Nodes feedback measured 11.4-11.9 ms and every retained warm sample measured 9.6-12.1 ms, while later cold samples inherited 128-158 ms work from the preceding deferred activation. The protocol had considered the optimistic selected state settled before the scheduled durable command and activation placeholder completed, so it started the next sample during prior background work and collected final resources while selection was still transient; that also explained listeners moving from 170 to 191. View chrome now exposes a non-persistent `data-view-selection-pending` state. Warmups and measured samples wait for durable selection and activation completion before proceeding, and the soak waits for both before final listener, subscription, DOM, heap, and accessibility snapshots. Feedback timing still ends on the first selected-state frame, so no latency work is excluded; only cross-sample contamination is removed. Eighteen focused chrome/certification contracts and web typecheck pass.
- Passive-effect settlement correction: the durable/placeholder-settled Empty rerun restored listeners to 170, subscriptions to 81, and clean feedback to 8.4-11.7 ms, but Router through Settings still began with 133-163 ms tasks. Render telemetry showed the transient chrome commit itself took only 0.3-0.7 ms; the remainder was passive work from the previously activated cold view, flushed by the next click because placeholder removal occurs before passive effects complete. The shared view-settlement helper now continues after pending selection and placeholder removal until requests are quiet, DOM samples are stable, animation frames advance, and no recent long task remains for 160 ms. The next input therefore starts from a genuinely idle browser while its own complete deferred lifecycle remains captured inside that sample. Eleven focused certification contracts and web typecheck pass; unchanged Empty browser evidence remains required.
- DOM-only acknowledgement boundary: even after full idle settling, Router through Settings still produced 139-148 ms click tasks while Connected Clients, Nodes, Runtime Debug, Problems, and Inspector remained at 8.4-12.2 ms. The first `AutomationStudioPaneBoundary` commit occurred in 0.5-0.8 ms at the beginning of each task, proving the transient React state update itself triggered subsequent synchronous work before the browser frame. Immediate acknowledgement no longer enters React: the click handler synchronously updates only tab `aria-selected`, `tabIndex`, selected classes, and the panel label, marks a DOM-only pending flag, and queues the durable command. The authoritative workspace render reconciles those attributes after the frame; a bounded two-second fallback clears the pending marker if durable confirmation never arrives. No local React selection owner remains. Forty focused ownership, chrome, and unrelated-render stability tests and web typecheck pass; production evidence remains required.
- Empty performance gate closed: the rebuilt DOM-only acknowledgement path passes the unchanged production Empty diagnostic with zero violations. Input feedback is 11.3 ms median/13.2 ms p95/13.2 ms maximum; retained-warm switching is 10.5 ms median/13.2 ms p95/13.2 ms maximum; project entry p95 is 82.2 ms; shell presentation maximum is 9.4 ms; virtualized-scroll p95 is 16.8 ms. Durable listeners remain 170 to 170, subscriptions remain 81 to 81, final DOM is 1,456 nodes with four clean warm views, retained heap growth is 2.64 MiB, and critical accessibility violations are zero. The artifact is explicitly diagnostic scope for `empty`; the unfiltered normalized Empty/Ordinary/Scale report remains the release gate.
- First full normalized certification and one-shot telemetry repair: the 7.7-minute production certification completed Empty, Ordinary, and Scale. All three passed input feedback at 12.4-12.7 ms p95/maximum, warm switching at 11.8-12.5 ms p95, project entry at 77.2-87.3 ms p95, shell feedback at 12.5-16.1 ms maximum, virtual scrolling at 16.7-16.8 ms p95, subscriptions, DOM, warm-view, heap, cache, core-interaction long-task, update-depth, and critical-accessibility budgets. Ordinary and Scale retained listeners at 170 to 170; only Empty reported 170 to 191, despite the immediately preceding identical Empty diagnostic also retaining 170 to 170. Audit found the injected tracker could not observe browser auto-removal of `{ once: true }` durable-global listeners and also conflated capture/bubble identity. It now maps original listeners to wrappers, decrements one-shot registrations when invoked, preserves explicit removal, and keys capture separately. The 10-percent listener gate is unchanged. Eleven focused telemetry/budget contracts and web typecheck pass; the full certification must be rerun.
- Normalized production performance gate closed: the corrected 7.4-minute serial report is `certification` scope, `production` build mode, normalized, covers `empty`, `ordinary`, and `scale`, and contains zero violations. Empty input median/p95/max is 11.5/13.7/13.7 ms and warm switching is 9.9/12.4/12.4 ms; Ordinary is 8.8/11.9/11.9 ms and 11.7/12.9/12.9 ms; Scale is 8.5/12.8/12.8 ms and 9.1/12.9/12.9 ms. Project-entry p95 is 75.6/77.3/89.1 ms, shell maximum is 10.6/13.1/11.0 ms, and virtual-scroll p95 is 16.7/16.8/16.7 ms. Listeners return 170 to 170 in every profile; subscriptions return 81 to 81 for Empty and 84 to 84 for Ordinary/Scale; final DOM is 1,450/2,032/2,121; clean warm views remain four; retained heap growth is 2.65/2.20/2.01 MiB; core-interaction long tasks and critical accessibility violations are zero. Every authored performance budget is now closed without threshold relaxation.
- Authored scheduling and certification documentation updated: `docs/architecture/automation-studio/workspace.md` now defines DOM-only tab acknowledgement, deferred durable command publication, cancellable post-paint cold activation, warm reuse, and the accepted production performance envelope. `docs/operations/web-panel-phase8-browser-scale-certification.md` now defines browser-local feedback timing, authoritative/full-idle sample preconditions, all-view versus retained-warm scope, one-shot/capture-aware listener ownership, diagnostic versus certification reports, and the exact accepted Empty/Ordinary/Scale evidence. The authored documents no longer claim browser certification is pending.
- Post-scheduling desktop Chromium regression: seven live routed production tests pass in 2.4 minutes. Evidence covers all nine global programs, all twelve canonical Studio views, canonical recording selection, hierarchy roving focus/nested disclosure/collapse recovery, disclosure selection and focus ownership, tabs, menus, modals, drawers, comboboxes, hierarchy resize, focus return, and dirty-tab Save/Discard/Cancel. The DOM-only acknowledgement and deferred durable selection did not regress ordinary tab semantics or workspace workflows.
- Post-scheduling mobile Firefox regression and Timeline repair: four of five constrained workflows passed immediately, including all nine global programs, recording selection, the complete workspace workflow, and dirty-close decisions. The canonical-view matrix isolated six clipped Timeline overview buttons. Enriched geometry proved `.automation-timeline-stage` had collapsed to zero height (`top=bottom=597`) while its overview rendered below it, and the overview grid expanded beyond the stage in Firefox. At 800 px and below, the Timeline is now an explicit vertical scroll owner, its populated grid reserves a 360 px stage, its toolbar becomes one column, and its overview uses a bounded 34/minmax(0,1fr)/48 grid with explicit 100-percent/min-zero containment. The clipping diagnostic now reports owner and control/clip geometry. Four responsive contracts and web typecheck pass; rebuilt Firefox and Chromium evidence remains required.
- Constrained Timeline gate closed: after the production rebuild, the focused all-twelve-canonical-view matrix passes at 320x568 in Firefox in 32.7 seconds and Chromium in 35.6 seconds. Together with the other four passing mobile-Firefox workflows, constrained global programs, recording selection, tabs, menus, drawers, modals, comboboxes, focus return, and dirty-close behavior remain intact. The Timeline now has a reachable vertical scroll path and no control lies beyond an unscrollable overflow owner.
- Final documentation and patch-consistency checkpoint: `pnpm docs:check` passes after deterministic framework-reference regeneration, validating local links across 52 authored/reference Markdown files and all 1,395 generated declarations. `git diff --check` also passes; its output contains only repository line-ending notices and no whitespace or patch error. The remaining final gates are the complete repository test and build commands.
- Final repository test gate, first attempt: the complete web package passes 1,045 tests across 211 files, the client-gateway package passes 3 tests, and 84 of 85 FluxIQ files pass. The root command correctly remains open because `runtime/service.test.ts` found one genuine pagination-count regression: `keeps large project summary pages free of hydrated detail payloads` received an instruction page with `total: 4` instead of the canonical inventory total `10` for `limit: 5, offset: 4`. This is being corrected at the SQL/fallback ownership boundary before the test gate is rerun; it is not categorized as a Windows worker-process failure.
- Flow-instruction SQL projection repair: root-cause tracing found `sqlInstructionScopeFromInstruction` had no canonical `flow` branch. Flow-scoped instructions were converted to `flow.unknown`, rejected by project-schema foreign-key guards, and then omitted by the compatibility write fallback, leaving only the fixture's four subflow-scoped instructions in SQL. The converter now persists the instruction's real `projectId` and `flowId`. The complete Automation Studio service file passes all 89 tests, including the failed large-summary pagination regression; all three service files matched by the focused command pass 100 of 100 tests. The complete root suite is being rerun on the repaired tree.
- Final repository test gate closed: the repaired root `pnpm test` exits successfully. The web package passes 1,045 tests across 211 files, FluxIQ passes 526 tests across 85 files, the client-gateway websocket package passes 3 tests, and the contracts package correctly exits zero with no test files. The previously failing large-project instruction pagination assertion passes inside the complete service and repository runs.
- Final repository production-build gate closed: root `pnpm build` exits successfully after building contracts, FluxIQ, and the client-gateway websocket declarations, then compiling and type-checking the optimized Next.js panel. Next.js generated all 16 static-generation steps and finalized every dynamic application/API route without a build error.
- Final repository check gate closed: root `pnpm check` exits successfully across web, contracts, FluxIQ, and the client-gateway websocket package on the repaired final tree. Phase 8 and the complete audit plan satisfy the Definition of Done.
- Post-closure documentation gate closed: all 52 authored/reference Markdown links validate. Both generated framework-reference copies were regenerated with 1,395 public declarations after the final instruction-scope service repair, and the deterministic current-reference check passes.
- Final patch-integrity gate closed: `git diff --check` exits successfully after the completion-record updates; only repository line-ending normalization notices are present.

Open release-gate blockers:

- None. The heavy Scale fixture, routed 100,000-record Problems/Docs workflow, normalized performance/heap/long-task/resource soak, accessibility checks, responsive browser regressions, and final repository gates all pass.

### Phase 1 Completion Record

Completed on 2026-08-31 under main-agent oversight after reviewing and correcting the Phase 1 worker patch.

1. Inactive warm views: completed in workspace/shell/MountedViewStack.tsx with native inert and aria-hidden state so cached views stay mounted without exposing focusable descendants.
2. Disclosure ownership: completed across the workspace header, hierarchy, pane, right-pane, timeline, node palette, graph outline, State Raw JSON panel, and tab finder with stable aria-controls targets.
3. Resizers: completed in workspace/commands/resize.ts and workspace CSS with visible hover/focus affordances plus Arrow, Home, and End keyboard commands.
4. Menu and Combobox: completed in programs/shared-ui.tsx with opener focus restoration, truthful option ownership, and active-descendant behavior.
5. Tabs and panels: completed in workspace/components/view-container.tsx with tab/panel relationships, close focus recovery, Escape behavior, and a non-modal dialog contract for the open-tab finder.
6. Overlays: completed in programs/shared-ui.tsx with dialog versus alertdialog roles, focus trapping/restoration, background inertness, and preserved prior document state; drawers retain explicit modal or non-modal semantics.
7. Tooltip and State canvas controls: completed with semantic tooltip relationships and accessible zoom/control names.
8. Reduced motion: completed in app/styles/global-foundation.css with a global prefers-reduced-motion policy.
9. Tree collection focus: completed in ProjectTree and hierarchy row components with grouped ownership and focus repair when rows disappear.
10. Parameter reference picker: completed as a keyboard listbox with active-descendant selection.
11. Notifications: completed with ID-based deduplication, pause on hover/focus, optional actions, and status/alert announcement behavior.
12. Copy and download commands: completed with accessible success and failure feedback.

Verification evidence:

- pnpm --filter @fluxiq/web check: passed.
- Phase 1 focused suite: 6 files, 66 tests passed.
- git diff --check: passed; only repository line-ending notices were reported.
- The Automation Studio architecture contract process exited before executing assertions with the same Windows Tinypool worker failure recorded in Phase 0. No architecture assertion failed; final runner certification remains owned by Phase 8.

### Phase 2 Completion Record

Completed on 2026-08-31 under main-agent oversight after a replacement worker recovered the original Phase 2 implementation from a system crash and closed the remaining full-Router read paths.

1. Subflow target discovery: completed with SQL keyset paging, text/role/status filters, exact totals, a 200-row global maximum, and bounded Router target-reference batches capped at 50 Subflows.
2. Paging contracts: completed in storage/paging.ts with versioned opaque cursors bound to query owner and filter hash, validated stable tuples, explicit limits, additive indexes, compatibility behavior, and rollback ownership documented in docs/architecture/automation-studio/persistence.md.
3. Router summaries: completed with bounded Router metadata, route pages and counts, compact graph pages, preserved group description/order/status/collapse metadata, and additive migrations 0011 through 0013.
4. Full Router removal: completed for ordinary browser paths. Router, preload, instructions, runtime readiness, subflow directory, and settings use summaries/pages/reference batches; the full endpoint remains only for runtime, mutations, exports, and documented legacy compatibility.
5. Runtime events: completed as an append-and-deduplicate stream with stable ordering, fixed-window rendering, preserved scroll context, opaque continuation cursors, and stale request cancellation.
6. Runtime actions: completed with SQL scalar summaries, real node/definition/status/timing/evidence fields, storage-level paging, and JSON/evidence detail loaded only after selection.
7. Problems and Client Gateway: completed with server-owned paging/filter/count contracts. Gateway snapshots no longer hydrate full collections and fetch capped collection pages separately.

Verification evidence:

- pnpm --filter fluxiq check: passed under worker and main-agent verification.
- pnpm --filter @fluxiq/web check: passed under worker and main-agent verification.
- Main-agent focused framework verification: paging, Client Gateway, schema, API, and resource repository suites passed; runtime stream storage passed 6 of 6 tests including a one-million-event fixture.
- Main-agent focused web verification: 10 files, 60 tests passed across Router, runtime, Problems, Client Gateway, stale requests, and preload policy.
- Worker full Phase 2 verification: 41 framework tests and 100 web tests passed.
- pnpm docs:check: passed; 50 Markdown files and deterministic references are current.
- pnpm --filter fluxiq build and pnpm --filter @fluxiq/web build: passed under worker verification.
- git diff --check: passed; only repository line-ending notices were reported.

### Phase 0: Correctness Gate

Goal: remove defects that can corrupt interaction state, accept malformed credentials, lose edits, or display the wrong object.

Steps:

1. Replace mutable render-store preference updates with immutable snapshots and add old-snapshot tests.
2. Replace both broken numeric regexes with the shared sanitizer; add authentication and project authorization tests.
3. Separate pairing dismissal from explicit rejection and test Escape, X, Reject, and Approve.
4. Add request cancellation/generation guards to run detail and Database Manager detail.
5. Build the dirty-view registry and guard tab, pane, project, route, and browser closure.
6. Restrict Router availability and mutations to top-level Flows.
7. Replace hard 401 redirects with draft-preserving reauthentication and safe operation resume.
8. Move login throttling to bounded durable/shared ownership and define trusted-proxy address handling.
9. Introduce the typed shared API error contract before implementing per-view conflict, permission, rate-limit, and retry states.

Acceptance:

- no previous store snapshot changes after publication;
- malformed TOTP/PIN text cannot enable submit;
- dismissing pairing never sends rejection;
- late responses cannot replace current detail;
- dirty content cannot be discarded without a decision;
- no subflow can render or mutate a Router;
- session expiry cannot silently discard a local draft;
- throttling is consistent across restarts and workers with bounded storage;
- every view can distinguish authorization, validation, conflict, missing, rate-limit, and server errors.

### Phase 1: Keyboard, Focus, And Disclosure Completion

Goal: make every interaction predictable with keyboard, pointer, and assistive technology.

Steps:

1. Implement low-cost focus suppression for inactive warm views.
2. Finish `aria-controls` relationships for sidebar, panes, timeline, palette, graph outline, and Raw JSON.
3. Add visible focused/hovered resize affordances and verify Arrow, Home, and End operation.
4. Correct Menu focus restoration and Combobox ownership.
5. Correct tabs/panels and focus restoration after close.
6. Consolidate truthful modal versus non-modal semantics.
7. Upgrade Tooltip and label State canvas controls.
8. Add a global reduced-motion policy.
9. Repair or retire the shared Tree and certify collection-change focus.
10. Apply the corrected listbox model to the parameter reference picker.
11. Make notifications pausable, actionable, deduplicated, and correctly announced.
12. Add accessible success/failure feedback to shared copy and download commands.

Acceptance:

- one sequential Tab stop per visible hierarchy row;
- focus never enters an invisible view;
- every disclosure identifies its region and reports truthful state;
- all menus, overlays, tabs, and resizers pass keyboard workflows;
- accessibility snapshots contain valid relationships and no hidden focused element.

### Phase 2: Router And Runtime Data Scaling

Goal: make route and run investigation usable at thousands of subflows, routes, actions, and events.

Steps:

1. Add server-paginated and searchable subflow target queries.
2. Specify each backend paging contract: owner, stable sort tuple, opaque/versioned cursor, filters, totals, maximum limit, indexes, compatibility period, and rollback.
3. Add paginated route summaries, filters, counts, and compact graph data.
4. Replace full Router map loads and local slicing.
5. Append and virtualize runtime events with stable scroll anchoring.
6. Page action summaries at storage level and lazy-load JSON/evidence detail.
7. Add server paging to Problems and capped client-summary views.

Acceptance:

- targets beyond the first 100 are reachable;
- no ordinary Router or Runtime list request downloads the full collection;
- event paging preserves prior context;
- opening detailed JSON does not render it in every row;
- scale fixtures remain responsive within Phase 8 budgets.

### Phase 3: Workspace Identity And Render Stability

Goal: prevent interaction from rebuilding unrelated views and bound long-session memory.

Steps:

1. Stabilize all connector command callbacks.
2. Create one connected-view source per project session.
3. Consolidate project derivation into a revision-keyed model cache.
4. Implement bounded warm-view LRU with dirty and active-view pinning.
5. Flatten and virtualize the visible hierarchy.
6. Add render-count and subscription-identity tests around common clicks.

Acceptance:

- selection, disclosure, menu, and pane actions do not recreate unrelated view entries;
- revisiting a warm view preserves allowed local state;
- the warm DOM and subscriptions remain below configured limits;
- a multi-thousand-row hierarchy keeps immediate selection feedback.

### Phase 4: Canonical Studio View Functionality

Goal: make each Studio view complete, friendly, and internally consistent.

Steps:

1. Replace JSON-first run input with schema forms and validated advanced JSON.
2. Merge supported replay behavior into `FlowRunView` and remove dormant Runtime Debug duplication.
3. Unify adaptation mode enums, defaults, labels, and persisted migration.
4. Add revision-aware conflict UX to Flow and subflow settings.
5. Replace arbitrary Client UI caps with searchable, paginated lists.
6. Move implementation diagnostics behind a details disclosure.
7. Remove ordinary Recording Index Repair and fix active duration ticking.
8. Define and persist or relabel recent palette behavior.
9. Complete graph draft detect/restore/discard/conflict recovery.
10. Define palette Favorites persistence, stale-item cleanup, and empty behavior.
11. Add New-Flow readiness onboarding with direct setup links and revision-safe refresh.
12. Complete recording finalization plus note/marker authoring busy, authorization, and recovery paths.

Acceptance:

- a new user can run a Flow without manually authoring JSON;
- one canonical runtime view owns supported run/replay behavior;
- adaptation mode means the same thing everywhere;
- same-object external updates cannot silently overwrite a settings draft;
- every list exposes total, paging, search, and stable selection where applicable.

### Phase 5: Global Program Correctness And Recovery

Goal: bring every program to the same reliable loading, mutation, filtering, and recovery standard.

Steps:

1. Add loading, unavailable, retry, empty, and ready states to Deployment Sync and Production Runner.
2. Sort Production logs before applying the newest-500 cap.
3. Add operation-level busy state to Identity and Secret Keys.
4. Reconcile filtered selections in Background Tasks, Identity, and Secret Keys.
5. Add virtual/source-paged Docs navigation and user-driven history entries.
6. Require labels for every shared DataTable.
7. Add root, domain, and program loading/error boundaries plus an authored not-found surface.
8. Classify every operational framework route and add the authorized operator UI or explicit API-only/retired contract.
9. Apply the shared request coordinator to global programs with view-appropriate timeout, retry, deduplication, and cancellation.

Acceptance:

- network failure never appears as valid empty data;
- destructive or privileged actions cannot double-submit;
- detail always corresponds to a visible or explicitly pinned selection;
- Back/Forward traverses Docs selections;
- every data table has an accessible name;
- route failures provide Retry and safe navigation.

### Phase 6: Shell, Overlay, And Style Ownership

Goal: remove duplicate infrastructure and prevent global work from taxing unrelated pages.

Steps:

1. Move React Flow and Studio styles/assets to the Studio route boundary.
2. Activate gateway pairing only for eligible authenticated sessions and avoid unnecessary snapshot replacement.
3. Consolidate Modal, Drawer, Studio overlay, focus return, isolation, scroll lock, and document listener ownership.
4. Remove obsolete `ProjectHierarchySidebar.tsx` and migrate stale tests.
5. Replace broad tree button CSS with role-specific classes.
6. Define ownership boundaries for global foundation, program primitives, Studio shell, and individual views.

Acceptance:

- non-Studio routes do not load Studio-only assets;
- overlays install one reference-counted environment;
- there is one hierarchy implementation;
- role-specific controls do not inherit unrelated button geometry;
- CSS import and ownership tests prevent regressions.

### Phase 7: Responsive And Visual Certification

Goal: make all repaired behavior look deliberate and remain usable on constrained screens.

Steps:

1. Remove fixed minimum-height assumptions and define one scroll owner per shell region.
2. Audit every Automation Studio view at desktop, short desktop, tablet, and mobile drawer widths.
3. Audit every global program at the same sizes and at 200% zoom.
4. Normalize fields, segmented controls, icon buttons, menus, pagination, modals, drawers, tables, status badges, and empty/loading/error states.
5. Verify text truncation shows useful object names and full labels remain available by tooltip or detail.
6. Capture visual baselines for default, loading, empty, error, populated, menu-open, modal-open, and collapsed states.

Acceptance:

- all actions remain reachable at 320x568 and 768x500;
- no unexplained nested scrolling, clipped modal, hidden label, overlapping text, or layout shift;
- object-type icons, selection, disclosure, and hierarchy depth remain visually distinct;
- every view meets the product rules at the top of this document.

### Phase 8: Browser And Scale Certification

Goal: prevent recurrence through tests that exercise real interaction, not only static markup.

Steps:

1. Add Playwright hierarchy focus-sequence and disclosure tests.
2. Add tab, menu, modal, drawer, combobox, resize, dirty-close, and focus-return workflows.
3. Add failed request, retry, stale response, double-submit, filtering, and pairing-dismissal workflows.
4. Add accessibility checks and snapshots for every canonical view and global program.
5. Add the fixed empty, ordinary, and scale fixtures defined below.
6. Record interaction latency, commit count, long tasks, DOM node count, subscriptions, and heap growth.
7. Run functional and visual certification in Chrome/Chromium, Edge, and Firefox at the Phase 7 viewport matrix.
8. Run `pnpm check`, `pnpm test`, and `pnpm build` after the complete remediation set.

Fixed fixtures:

- **Empty:** one project, one empty Flow, no subflows, routes, nodes, recordings, runs, or adaptations.
- **Ordinary:** 25 Flows, 250 subflows, 5,000 hierarchy objects, 1,000 nodes in the active graph, 2,500 routes, 10,000 run events, 5,000 problems, and 5,000 docs.
- **Scale:** 250 Flows, 5,000 subflows, 50,000 hierarchy objects, 5,000 nodes in the active graph, 10,000 routes, 250,000 run events, 100,000 problems, and 100,000 docs. Seed through storage fixtures; no test may create these records through the UI.

Interaction and resource budgets:

- pointer/key input to visible pressed, selected, focused, or disclosure feedback: p95 at or below 50 ms and maximum at or below 100 ms;
- warm tab/view switch to visible content or local placeholder: p95 at or below 100 ms;
- project entry to interactive shell on the local ordinary fixture: p95 at or below 1,000 ms, while shell feedback appears within 100 ms;
- no repeated render/update-depth warnings;
- no main-thread task above 100 ms caused by a core click/key interaction in any fixture;
- virtualized scrolling keeps p95 animation frames at or below 32 ms during scripted list/tree scrolling;
- mounted clean warm views are capped at six on desktop and three on constrained layouts; active and dirty views are never evicted silently;
- rendered DOM stays below 5,000 elements for the ordinary fixture and 10,000 for the scale fixture outside a deliberately expanded detail payload;
- after 50 cycles through the same ten views, listener/subscription counts return within 10 percent of the post-warm baseline and retained heap settles within 20 percent or 50 MB, whichever is larger;
- cached browser data respects explicit per-entry, per-project, and global limits recorded by the cache owner before Phase 3 closes;
- zero critical automated accessibility violations.

Measurement protocol:

- run performance budgets against a production build on pinned CI hardware with browser extensions disabled;
- execute ten measured repetitions after two warm-up repetitions and report median, p95, and maximum;
- store traces for failures and fail CI on an absolute budget breach or a greater-than-20-percent regression against the accepted baseline;
- use identical scripted interactions for empty, ordinary, and scale fixtures;
- treat functional cross-browser results as release gates; use the pinned Chromium run as the normalized performance gate unless a browser-specific regression is under investigation.

## Execution Order And Dependencies

1. Phase 0 is mandatory before feature or visual work.
2. Phase 1 focus suppression must land before expanding warm-view retention.
3. Router/runtime server contracts in Phase 2 precede their final view polish.
4. Stable workspace identities in Phase 3 precede performance certification.
5. Phase 4 and Phase 5 can run in parallel after shared primitives from Phase 1 settle.
6. Phase 6 must finish before final visual baselines so duplicate styles and overlays are gone.
7. Phase 7 produces the screenshot matrix consumed by Phase 8.
8. Phase 8 is the release gate, not optional cleanup.

## Definition Of Done

The plan is complete only when:

- every finding F-001 through F-055 is fixed, explicitly rejected with documented rationale, or replaced by a more precise finding;
- all acceptance criteria for Phases 0 through 8 pass;
- browser tests run against the hosted panel and include the repaired hierarchy at every depth;
- performance evidence covers empty, ordinary, and scale projects;
- all authored docs affected by changed interaction, storage, auth, or architecture contracts are updated;
- `pnpm check`, `pnpm test`, and `pnpm build` pass;
- the findings register contains no unresolved P0 or P1 item.

## Next Action

This audit and remediation plan is complete. Preserve the accepted browser artifacts and performance envelope as regression gates for future Automation Studio and global-program changes; any new scope should begin in a separate working document.

## Maintenance Record: Settings Navigation Redesign

On 2026-09-02, Flow and Subflow Settings were moved to a shared two-pane layout. The section navigator and save footer remain available while the form body scrolls independently; narrow layouts use a persistent horizontal section rail. Section selection is tracked during manual scrolling, navigation is scoped to the local settings container, and the former document-level `scrollIntoView` helper was removed. Focused Settings tests and the web TypeScript check pass.

The Flow Settings form now reads its persisted values from the bounded SQL metadata-detail endpoint before presenting an editable summary-backed Flow. The client adapter hydrates identity, scope, runtime defaults, interfaces, intervention mode, adaptation policy, and LLM references without loading graph nodes or edges. SQL projection now preserves the selected LLM model, encrypted-key reference, and adaptation policy ID. Settings save through a dedicated mutation that merges editable settings into the canonical Flow on the server, preserving graph nodes, edges, and unrelated metadata without requiring client-side graph hydration. Dirty drafts expose an active Save action; validation is reported when Save is requested instead of making the changed-state action appear unavailable.
