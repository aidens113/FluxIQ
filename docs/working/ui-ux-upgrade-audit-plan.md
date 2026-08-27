# FluxIQ UI/UX Upgrade Audit And Working Plan

Status: audited in depth; exhaustive implementation plan ready

Owner: FluxIQ Web and Automation Studio

Last updated: 2026-08-26

## Purpose

This document is the product-wide working plan for making FluxIQ easier to understand, faster to operate, visually consistent, accessible, and dependable across desktop and constrained viewports. It covers the global workspace, Automation Studio, authentication, privileged actions, secret management, identity, database tooling, documentation, runtime control, and every shared UI primitive used by those programs.

This is not a cosmetic reskin. The current interface has local improvements, but its interaction model, responsive behavior, component ownership, accessibility, and loading behavior are inconsistent. The upgrade must improve both appearance and task completion.

## Audit Method

The audit reviewed:

- every route and user-facing TSX file under `apps/web/src`;
- the complete `apps/web/src/app/globals.css` stylesheet;
- Automation Studio view routing, project hierarchy, pane/window controls, graph editors, Router, subflows, instructions, settings, run history, action logs, state, recordings, adaptations, and client gateway views;
- every global program live view, including identity, secrets, database, deployment, production runner, background tasks, compute, and docs;
- shared tables, fields, panels, segmented controls, alerts, and modals;
- API summary/detail and pagination boundaries that affect perceived UI speed;
- existing UI tests and the absence of browser-level accessibility and visual regression coverage;
- related working documents, especially the strict workspace layout and load performance plans.

The audit is source-based. Before implementation, Phase 0 must add repeatable browser screenshots, interaction recordings, and performance measurements so visual findings can be compared against a fixed baseline.

## Current-State Evidence

The following are verified structural facts, not subjective impressions:

- `globals.css` is 10,294 lines with roughly 1,768 class-selector declarations, 2,222 fixed pixel values, 354 literal hex colors, 228 overflow declarations, 33 z-index declarations, and only 10 scattered responsive media blocks.
- The stylesheet contains chronological override sections. Related styles for the same surface are separated by thousands of lines, making regressions and stale rules difficult to detect.
- `AutomationStudioLive.tsx` is 4,311 lines and owns dozens of unrelated state values, data-loading paths, navigation rules, modal states, project actions, pane geometry, and command handling.
- `WorkspaceViews.tsx` is 2,154 lines and combines unrelated runtime, Router, instruction, settings, adaptation, subflow, and run-log experiences.
- `GraphEditorViews.tsx` is 1,464 lines and combines multiple graph modes and interaction systems.
- Native browser `prompt`, `confirm`, and `alert` calls remain throughout Flow save/publish, recording, state repair, instruction, settings, adaptation, proposal, and timeline workflows.
- The shared Modal does not implement focus trapping, initial-focus policy, Escape dismissal, labelled-dialog wiring, background inertness, or focus restoration.
- Across TSX files, tab semantics are almost absent: there is one `role="tab"`, two `role="tablist"` instances, and one `aria-selected` occurrence.
- Tree containers do not expose `aria-expanded`, relationships do not expose `aria-controls`, form errors do not use `aria-invalid`/`aria-describedby`, and loading regions do not use `aria-busy`.
- Several resizers are pointer-only, visually hidden until hover, and explicitly remove their focus outline. Window tabs use a clickable `span` for close.
- Project/category rearrangement and window/tab movement rely heavily on drag interactions without equivalent keyboard commands.
- Automation Studio uses fixed full-viewport geometry and nested `overflow: hidden` containers. Some ordinary Studio layouts still specify a 720px minimum height, which cannot fit on many laptop, tablet, or zoomed viewports.
- Run-history listing is SQL-level paginated and details are lazy-loaded, but action-log paging currently slices a fully loaded run detail in the browser. Very large individual runs can therefore still create download, parse, and render pressure.
- The project-open path has summary/detail safeguards, but large views still receive broad `any`-typed data bags and can rerender from a very large parent component.
- Tests are primarily Vitest logic and server-rendered markup checks. The web package has no Playwright browser suite, visual snapshots, automated axe checks, or tested keyboard navigation workflows.

## Product UX Principles

1. **Task first.** Each view must lead with the user's primary task, not statistics, internal IDs, framework terminology, or raw data.
2. **One clear location.** An object has one canonical place in navigation and one predictable editor. Related data can link to it without creating a duplicate authoring surface.
3. **Progressive disclosure.** Common fields and actions remain visible. Expert controls, source data, and JSON appear only when requested.
4. **Visible system state.** Loading, saving, running, dirty, queued, blocked, failed, and completed states must be unmistakable and local to the affected surface.
5. **Safe actions without ceremony.** Ordinary edits should be quick. Sensitive and destructive actions should use consistent in-product authorization and confirmation dialogs proportional to actual risk.
6. **Keyboard and pointer parity.** Any action available by drag, double-click, hover, or pointer resize needs a discoverable keyboard alternative.
7. **Responsive by reflow.** Small screens should change the composition, not simply hide columns or force the desktop UI into nested scrollbars.
8. **Details on demand.** Lists use summaries and server pagination. Heavy detail, evidence, JSON, screenshots, traces, and graphs load only when opened.
9. **Consistent language.** Use Flow, Router, Subflow, Nodes, Instruction, Adaptation, Recording, Run, and State consistently. Do not expose obsolete proposal/config/task/routine terms in normal workflows.
10. **Measured quality.** A view is not complete until responsive screenshots, keyboard checks, accessibility checks, and performance budgets pass.

## Severity Model

- **P0 Blocker:** prevents task completion, traps content, loses work, freezes the browser, or makes a critical workflow inaccessible.
- **P1 Major:** causes frequent confusion, inconsistent navigation, excessive authorization, weak feedback, inaccessible interaction, or severe visual degradation.
- **P2 Important:** slows repeated work, weakens scanning, creates avoidable cognitive load, or produces inconsistent polish.
- **P3 Refinement:** visual and interaction details that improve confidence once the core workflow is stable.

## Findings Register

### P0: Responsive And Scroll Ownership

**Observed**

- The full-screen Studio shell combines viewport-height calculations, fixed topbar offsets, minimum heights, and many nested hidden-overflow containers.
- Content areas, panes, views, lists, and modals can each become scroll owners.
- Some mobile rules cap inner views to `70vh`, creating a second scroll area inside an already constrained pane.
- Dense Router and data-table layouts preserve large minimum widths on small screens and depend on horizontal scrolling.
- Documentation and other global tools specify large minimum dimensions that cannot fit common small viewports.

**Required upgrade**

- Define one vertical scroll owner per page mode and one per intentionally scrollable pane.
- Replace `100vh` assumptions with dynamic viewport units and safe-area-aware sizing where supported.
- Remove ordinary-workspace minimum heights that exceed the available viewport.
- Add compact desktop, tablet, and narrow modes. Narrow mode must switch the hierarchy and inspector to drawers/sheets and make the active editor the main page.
- Tables must choose among responsive columns, row-detail disclosure, or a deliberate horizontal data grid. Do not accidentally mix all three.
- Add viewport tests at 1440x900, 1280x720, 1024x768, 768x1024, 390x844, and 320x568, plus 200% browser zoom.

**Done when**

- Every primary workflow remains reachable without clipped controls.
- No page produces competing page-and-pane vertical scrollbars.
- Opening a modal never makes its footer unreachable.
- The smallest supported viewport can navigate, edit, save, run, inspect, and return without switching to desktop dimensions.

### P0: Dialogs, Authorization, And Destructive Actions

**Observed**

- Browser prompts interrupt context and cannot provide validation, explanation, password-manager behavior, or consistent styling.
- Shared and client-pairing dialogs are separate implementations.
- Dialogs lack complete keyboard and focus management.
- Some actions ask for PIN through a prompt after the user has already completed a form; cancellation discards momentum and errors are detached from fields.
- Destructive actions are represented inconsistently by primary, danger-primary, danger-action, and ordinary buttons.

**Required upgrade**

- Replace every `window.prompt`, `window.confirm`, and `window.alert` with shared dialog flows.
- Build `Dialog`, `AlertDialog`, and `AuthorizationDialog` primitives with labelled title/description, Escape policy, focus trap, initial focus, return focus, inert background, scroll lock, busy state, field errors, and a stable footer.
- Authorization should appear only after the user initiates a protected action. Reuse a short-lived authorization grant where policy permits.
- Define action-risk tiers: ordinary save, privileged mutation, destructive mutation, and sensitive reveal. Match required credentials to the tier.
- Destructive confirmation must name the object and consequence; irreversible bulk deletion may require typed confirmation.

**Done when**

- The repository has no native browser dialogs in user workflows.
- Every dialog is keyboard-complete and covered by browser tests.
- No ordinary form exposes authorization fields before the action requires them.

### P0: Browser Performance And Heavy Views

**Observed**

- The parent Studio component holds broad project, runtime, graph, state, recording, and layout state in one React tree.
- Large run details are client-paged after full detail hydration.
- The hierarchy recursively filters full node arrays for every rendered node.
- Global client pairing polls every second even when no pairing UI is visible.
- Some global program tables map complete unpaged collections.
- Raw JSON is stringified synchronously when expanded and audit export is prepared on the main thread.

**Required upgrade**

- Complete the existing load-performance plan and make its budgets mandatory for UI phases.
- Add server-level cursor or offset pagination for run attempts, effects, interventions, recoveries, audit events, database records, production logs, and any unbounded global-program list.
- Split run overview from paged action detail. Fetch JSON payloads only when the user opens a specific detail drawer.
- Index hierarchy children and selection ownership once with memoized maps.
- Split Studio data domains into scoped hooks/stores so unrelated updates do not rerender the graph editor and every open pane.
- Use list virtualization only for genuinely large, fixed-row collections after server pagination is in place.
- Pause polling when the document is hidden and use backoff or event-driven updates where possible.
- Measure input latency, long tasks, request count, payload size, and render count for project open, Flow switch, run-list open, run-detail open, and graph editing.

**Initial budgets**

- Project hierarchy first useful render: <= 1 second on the standard fixture.
- Flow switch interaction response: <= 100ms before loading feedback appears.
- Run list response: <= 500ms locally for a 10,000-run project.
- Run detail overview payload: <= 250KB before optional JSON/evidence detail.
- No task longer than 50ms during ordinary tree selection or pane switching.
- No default list renders more than 100 interactive rows without pagination or virtualization.

### P1: Design System And CSS Ownership

**Observed**

- The global stylesheet is acting as tokens, reset, component library, feature styling, responsive layer, and chronological patch log at once.
- Literal colors and fixed dimensions outnumber semantic tokens.
- Similar panels, headers, empty states, tabs, buttons, forms, and badges are restyled independently.
- Some old dark Router styles coexist with newer light Router styles.
- Focus styles are sparse and inconsistent.

**Required upgrade**

- Create a small internal design-system layer owned under `apps/web/src/ui/`.
- Split CSS into tokens, base, primitives, shell, and feature modules. Feature selectors must live beside the owning feature.
- Establish semantic tokens for surfaces, text, border, focus, selection, success, warning, danger, info, code, overlays, spacing, control height, typography, radius, elevation, and z-index layers.
- Add density modes only where needed: comfortable forms and compact operational tables/tree rows. Do not globally shrink all controls.
- Define primitives: Button, IconButton, Field, TextInput, Textarea, Select, Checkbox, Switch, SegmentedControl, Tabs, Toolbar, DataTable, Pagination, Status, EmptyState, Skeleton, InlineNotice, Toast, Dialog, Drawer, SplitPane, Tree, DetailList, JSONViewer, and CodeViewer.
- Remove selectors only after usage inventory and screenshot comparison.

**Done when**

- New feature styling does not go into `globals.css`.
- Shared controls have one visual and behavioral implementation.
- All interactive controls have visible focus, hover, active, selected, disabled, busy, and error states.
- Literal product colors are exceptional and documented.

### P1: Global Shell And Program Directory

**Observed**

- The home directory presents domains and programs as repeated cards with long descriptions, which is slow to scan as the catalog grows.
- The program shell exposes Main/API/Storage/Runtime tabs based on framework capability inventory rather than the user's most common task.
- Automation commands and status compete with global navigation in the topbar.
- Unsaved-work navigation relies on browser confirmation.

**Target experience**

- Use a compact program launcher with search, recent programs, domain grouping, keyboard navigation, and stable icon/category treatment.
- Keep framework capability inventories in an explicit technical details area, not as equal-weight primary tabs for ordinary users.
- Give each program a consistent breadcrumb, title, contextual actions, user menu, and local navigation region.
- Keep the Automation Studio command bar contextual: Save, Run, Stop, Undo, Redo, and status should reflect the active editable Flow only.
- Preserve deep links and restore the selected object/view on reload.

### P1: Project Browser And Left Hierarchy

**Observed**

- Project/category movement is drag-centric.
- The hierarchy visually resembles a tree but lacks tree semantics, expanded state, arrow-key navigation, and managed focus.
- Single-click navigation is delayed 220ms to distinguish double-click opening, making every normal selection feel less immediate.
- Hover-revealed settings/delete controls can crowd narrow titles.
- Search and type filtering can reveal ancestors without explaining why they remain visible.

**Target experience**

- Project browser: searchable rows or compact tiles, recent project affordance, clear create action, context menu for rename/move/delete, and keyboard move alternatives.
- Hierarchy: real tree/treeitem semantics, roving tabindex, Up/Down/Left/Right, Home/End, Enter, Space, context menu, and explicit `aria-expanded`.
- Remove the delayed single-click. Use single click to open/select; use an explicit open-in-new-pane command in context menus or modifier-click.
- Keep one selected object, a distinct keyboard focus indicator, and optional correlated/context styling that cannot be mistaken for selection.
- Preserve full usable title width. Row actions should use a trailing action menu when space is constrained.
- Keep the agreed structure: top-level Flow click selects Router; subflow click expands and selects Nodes; Router exists only on top-level Flows.

### P1: Workspace, Inner Views, Tabs, And Panes

**Observed**

- The implementation still contains window geometry, z-index, drag, snap, resize-edge, layout-picker, and pane behavior alongside the strict layout model.
- Tabs are ordinary buttons without complete tab semantics; close is a clickable span; overflow depends on a visible horizontal scrollbar.
- Resize handles are invisible and pointer-driven.
- View headers consume vertical space and can duplicate titles already shown in the view.

**Target experience**

- Finish the strict workspace model documented in `automation-studio-strict-workspace-layout-plan.md`: left hierarchy, main editor panes, optional right inspector, and bottom timeline.
- Remove remaining freeform window positioning, z-index, snap, and hidden resize behavior after migration.
- Use accessible tabs with roving focus, Arrow navigation, Home/End, Ctrl/Cmd+W close, middle-click close, and an actual IconButton close target.
- Provide overflow chevrons and a searchable open-tabs menu; do not rely on the scrollbar as the primary navigation mechanism.
- Split handles need a visible affordance, keyboard increments, reset command, and announced value.
- On narrow screens, show one main view at a time with hierarchy/inspector as drawers and timeline as a bottom sheet.

### P1: Flow Nodes Whiteboard

**Observed**

- The graph supports rich pointer editing, drag selection, ports, and multiple modes, but much of its functionality is discoverable only by interaction.
- Context menu suppression and pointer capture can block familiar browser or assistive behavior.
- Node parameter editing uses structured controls, but validation, dirty state, save failures, and schema errors are not consistently attached to nodes and fields.
- Complex graph, inspector, palette, and selected-node state are owned by large components.

**Target experience**

- Add an always-available compact toolbar: select, pan, fit, zoom, undo, redo, validate, and add node.
- Add keyboard node creation/search, multi-select, move, connect, duplicate, delete, and focus navigation.
- Use a searchable categorized node palette with favorites/recent nodes and compatibility hints.
- Show inline graph validation and a Problems list that focuses the affected node/edge.
- Make save state explicit: Saved, Unsaved, Saving, Failed. Preserve drafts on recoverable navigation and offer restore after reload.
- Parameter fields use schema-driven labels, help, examples, constraints, references, and inline errors. Do not display a fake "picker" label beside a plain text input when no picker exists.
- Add minimap/overview only if it remains useful with large graphs and does not obscure the canvas.

### P1: Router

**Observed**

- Router has recently moved to an ordered route workbench, but stale CSS for older multi-panel and decorative map concepts remains.
- Dense route rows require horizontal space; group and fallback editing are separate modal flows.
- Conditions are summarized into strings that may hide nested logic.

**Target experience**

- Keep a single ordered route list as the canonical editor.
- Use drag handles plus Move Up/Down keyboard/menu actions for priority.
- Show route name, readable condition, target subflow, group, status, and validation in one scan.
- Open a focused route editor with a visual condition builder. Nested AND/OR conditions need indentation and summaries, never raw JSON.
- Provide target search for large subflow sets, duplicate route, enable/disable, and test route actions.
- Keep the fallback row pinned and understandable.
- Empty state should explain the dependency and offer Create Subflow.
- Delete stale Router CSS and add populated/empty/narrow screenshots.

### P1: Subflows And Their Scoped Objects

**Observed**

- Subflows now have a sound hierarchy model, but users must understand the distinction among the Subflows directory, subflow container, Nodes, nested Subflows, and Settings.
- Subflow settings expose mapping rows and instruction IDs, but some relationships are still entered as free text.

**Target experience**

- Keep the Subflows object as a paginated directory and creation entry point.
- Each subflow container shows Nodes, nested Subflows, Instructions, Recordings, Adaptations, Runs, Runtime Debug, and Settings.
- Clicking a directory row or container name opens Nodes consistently.
- Settings use searchable object pickers for instruction bindings and typed mapping controls for Flow inputs/outputs.
- Show route usage, status, role, parent, and validation without exposing graph Flow IDs as primary labels.
- Add breadcrumbs in scoped views so the user always sees `Flow / Subflow / Object`.

### P1: Instructions

**Observed**

- The current library/editor split is a useful base, but save authorization uses a browser prompt.
- Scope, priority, requirement, and status are technical controls with limited explanation of effective precedence.
- Diagnostics only detect a narrow "always"/"never" text conflict.
- Empty state does not guide a new Flow toward minimum runnable instructions.

**Target experience**

- Use a searchable instruction list with scope/status filters and clear selected state.
- Editor uses a calm form hierarchy: title, instruction body, scope, when it applies, importance, and status.
- Replace priority-only mental arithmetic with named levels backed by numeric ordering; advanced users may inspect the exact value.
- Show an Effective Instructions preview in resolved order, inheritance source, shadowing, conflicts, and token-size warnings.
- Provide templates for Flow goal, safety constraint, on-error behavior, Router guidance, subflow rule, and node-specific guidance.
- New Flow readiness links directly to Create Instruction with scope prefilled.
- Autosave drafts locally; protected persistence uses the shared authorization dialog.

### P1: Flow And Subflow Settings

**Observed**

- Settings have structured controls but combine identity, execution, training, adaptations, provider, budgets, safety, source mode, and dependency concerns in long surfaces.
- Some values are editable as IDs or comma/newline-separated strings.
- Save authorization uses browser prompts in multiple settings/config paths.
- Defaults, inheritance, validation, and impact are not consistently visible.

**Target experience**

- Organize settings with an in-page section navigator: General, Runtime, LLM and Adaptation, Limits, Safety, Inputs/Outputs, Dependencies, and Advanced.
- Subflow settings use General, Interface Mappings, Instructions, Approval Override, and Lifecycle.
- Show effective value, source (default/inherited/overridden), and Reset to inherited for every inheritable setting.
- Use provider/model/key pickers backed by available secrets; never ask users to type internal IDs when a known object exists.
- Validate budgets and incompatible combinations inline before save.
- Keep sticky Save/Discard controls with dirty-state summary.
- Remove statistics-style headers from settings.

### P1: Runtime Debug And Run Detail

**Observed**

- Previous runs are now clickable single-line rows with SQL-level list pagination, which is the correct base.
- Runtime and Runs views duplicate run history and summary treatments.
- Run detail presents a "Run Story," metrics, actions, recovery, interventions, adaptations, effects, final values, and JSON, but the hierarchy is long and every section is stacked.
- Action paging is local to an already hydrated detail object.
- Action rows present many fields at once without a column header, and JSON opens inline, expanding row height and destabilizing scanning.

**Target experience**

- Define one Run History component shared by Runtime Debug and Runs; each host may add context but not fork behavior.
- Keep pagination at the bottom with page size, result range, first/previous/next/last, disabled and loading states, and URL-restorable page/filter state.
- Add status, date, duration, mode, subflow, and text filters backed by SQL.
- Run detail gets inner views: Overview, Actions, Adaptation, State/Effects, and Audit. Opening a run defaults to Overview, not all sections at once.
- Actions use a virtualizable/server-paged table or timeline with explicit columns, sequence, node label, result, duration, route, and recovery marker.
- Selecting an action opens a detail drawer with Inputs, Outputs, State Before, State After, Diff, Logs, Effects, Recovery, and Raw JSON tabs.
- JSON never expands the row. JSON viewer supports tree folding, search, copy path/value, wrap toggle, and download.
- Overview tells the user what happened in plain language, then shows route, terminal reason, duration, counts, LLM usage, cost, and created adaptations.
- Live runs stream incremental status without resorting or flashing the list.
- Preserve row order consistently on first render and refresh.

### P1: Run Controls

**Observed**

- Mode selection and Run button are now understandable, and declared inputs are form fields.
- Internal run input state remains serialized JSON, which complicates typed values and schema validation.
- Step limit is always visible as an advanced numeric field.
- Warnings appear as generic messages.

**Target experience**

- Generate typed input controls from the Flow input schema, including booleans, numbers, enums, objects, optional fields, defaults, and validation.
- Keep Fully Adaptive as default, Manual Approval as explicit, and No LLM Intervention as deterministic mode.
- Put step limit and diagnostic overrides under Advanced.
- Run readiness blocks execution with linked fixes for missing instructions, invalid Router targets, missing secrets, invalid mappings, or graph errors.
- While running, show progress, current subflow/node, elapsed time, Stop, and Open Live Log. Disable duplicate submission.

### P1: State View

**Observed**

- State supports visual, structured, comparison, diff, evidence, and raw detail, but the large implementation carries many overlay and sizing edge cases.
- Visual overlays depend on coordinate conversion and dense absolute-positioned labels.
- Raw JSON is appropriately opt-in.

**Target experience**

- Make source and phase selection persistent and obvious.
- Separate Visual, Structured, Diff, Evidence, and Raw into accessible tabs.
- Visual canvas provides fit, zoom, pan, layer visibility, selected-element breadcrumb, and a synchronized detail inspector.
- Prevent overlay text collisions; show labels in the inspector when the canvas cannot fit them safely.
- Structured state needs searchable paths, type/value columns, expand/collapse, copy path/value, and changed-only filtering.
- State loading identifies the source being fetched and preserves prior content until replacement is ready.

### P1: Recordings, Timeline, Clients, And Evidence

**Observed**

- Recording actions still rely on prompts for names, notes, markers, PIN, and state-index repair.
- Timeline interaction is pointer-heavy.
- Connected-client pairing has its own modal implementation and one-second polling.
- Legacy proposal-generation language remains in some recording views despite recordings no longer directly generating adaptations in the target model.

**Target experience**

- Recording list supports status, source, duration, created date, search, and server pagination.
- Rename, note, marker, finalize, delete, and repair use focused dialogs or inline forms with contextual feedback.
- Timeline supports keyboard selection, zoom, scroll-to-current, event filters, and synchronized state preview.
- Pairing uses the shared secure dialog and event-driven/backoff refresh.
- Recording UI positions recordings as optional evidence/demonstration aids, not the primary Flow-generation path.
- Evidence links are consistent from recording, action, state, and adaptation views.

### P1: Adaptations And Legacy Proposal Surfaces

**Observed**

- Adaptations and older proposal/change-proposal components coexist in code and view routing.
- Review actions ask for PIN and reason through browser prompts.
- Review information mixes status, patch detail, evidence, policy gates, and raw data in dense views.

**Target experience**

- Adaptations are the only normal user-facing change-review concept.
- Remove Change Proposals from navigation, window adders, titles, and ordinary workflows; retain compatibility rendering only when old persisted data is opened.
- Adaptation list filters by status, risk, Flow/subflow, source run, and date.
- Detail has Summary, Changes, Evidence, Validation, and Audit inner views.
- Show before/after changes in domain-aware structured diffs, with affected Nodes/Subflows linked to their editors.
- Approve/apply/reject/supersede use a shared review dialog, clear consequence, optional/required reason policy, and visible post-action state.

### P1: Authentication, Identity, Secrets, And Sensitive Data

**Observed**

- Login has reasonable staged TOTP behavior but exposes default setup credentials in ordinary feedback and lacks password visibility and Caps Lock feedback.
- Identity and database authorization forms may require password, PIN, and TOTP together depending on action.
- Secret management is more structured, but Add Key is a full panel rather than a focused creation flow and sensitive reveal behavior is not time-bound in UI.
- Scope references and custom providers may require internal free-text IDs.

**Target experience**

- Login: clear product identity, staged TOTP, show/hide password, Caps Lock warning, rate-limit countdown, accessible errors, and forced first-login credential setup instead of persistent default-credential copy.
- User management separates creation, access status, role, credentials, and 2FA into focused workflows.
- Secret list is the main page. Add Key opens a modal or dedicated flow only after user intent.
- Secret form uses type-aware provider, model, scope, and scope-object pickers. Include OpenAI, Anthropic, Google, DeepSeek, and Custom where supported by the runtime, without presenting unsupported providers as usable.
- Creation authorization should require the minimum policy credential. Reveal, rotate, and delete may use stronger verification.
- Revealed values auto-hide, clear from state, display a countdown, and warn before leaving them visible.
- Database sensitive-store authorization uses the same authorization primitive and visible grant lifetime.

### P2: Global Operational Programs

**Background Tasks**

- Replace full-table summaries with a task list/detail workflow.
- Distinguish scheduler state from individual task state.
- Add next-run timeline, run detail, retry/cancel where supported, filters, and pagination.

**Compute Control**

- Provide node health, capability filters, last heartbeat, and a compact detail drawer rather than summary-only presentation.

**Database Manager**

- Use a proper resizable explorer/data grid/record inspector layout.
- Add server sorting/filtering/pagination, column types, copy, null treatment, sticky headers, row selection, and explicit sensitive lock state.
- Replace "DB" and "T" text blocks with consistent icons.

**Deployment Sync**

- Clarify branch checkout, sync, dry run, rollback, dirty-state impact, and confirmation risk.
- Use accessible tabs and show command progress/log detail.

**Documentation**

- Add tree semantics, document search, heading outline, URL/deep-link sync, find-in-page, copy-link, and responsive drawer navigation.
- Preserve sandboxing for rendered HTML and visibly distinguish generated from authored docs where useful.

**Production Runner**

- Replace Parameters JSON with schema-generated controls and an advanced JSON fallback only for unknown schemas.
- Add paginated logs, live state, run detail, cancel confirmation, and compact workload rows that remain usable beyond a handful of runs.

### P2: Tables, Lists, Pagination, And Empty States

**Required shared behavior**

- Tables have captions or accessible names, stable row keys, sortable headers, loading skeletons, error states, empty states, and deliberate responsive rules.
- Row actions collapse into an action menu when more than two secondary actions exist.
- Pagination provides total, visible range, page size, first/previous/next/last, and preserves filters.
- Lists distinguish no data, no matching filter, not loaded, unauthorized, and failed to load.
- Empty states contain one primary next action when the user can resolve them.
- IDs are secondary metadata with copy affordances; names are primary labels.

### P2: Forms And Validation

**Required shared behavior**

- Every field has a stable label and ID, optional/required status, help text only when useful, and inline validation.
- Errors are announced and linked with `aria-describedby`; invalid fields expose `aria-invalid`.
- Save remains disabled only when the reason is visible. Otherwise, allow submit and focus the first invalid field.
- Forms preserve entered values after server errors.
- Select known objects through searchable pickers instead of comma-separated, newline-separated, or opaque ID fields.
- Numeric fields show units, valid ranges, and sensible steppers.
- Toggle switches are reserved for immediate binary settings; checkboxes are used for selection/acknowledgment; segmented controls are used for short modes.
- Dirty forms offer Save/Discard and protect navigation consistently.

### P2: Feedback, Loading, Errors, And Status

**Observed**

- `StatusText` infers toast severity by matching words in arbitrary messages.
- Loading is represented by a mixture of text, blank panels, spinners, and retained stale content.
- Errors are frequently generic paragraphs without retry or field ownership.

**Required upgrade**

- API actions return explicit typed feedback tone/code instead of message-text classification.
- Use local inline feedback for form and panel actions; use toasts for completed background actions; use banners for page-level blockers.
- Loading skeletons preserve layout. Avoid clearing useful prior data during a refresh.
- All failed reads include Retry and retain navigation context.
- Long operations show progress or named stages and support cancellation where the backend supports it.

### P2: Content Design

- Replace framework-centric labels with user task language while retaining exact IDs and contracts in detail views.
- Use sentence case for labels and actions.
- Buttons use verbs: Create Flow, Save instruction, Run Flow, Delete key.
- Empty-state copy explains what is missing and the next action without feature marketing.
- Tooltips name icon-only controls; persistent visible copy should not explain obvious interface mechanics.
- Standardize status vocabulary across runtime and review surfaces.
- Audit obsolete references to Tasks, Routines, Config, Change Proposals, and direct recording-generated proposals.

### P1: Accessibility Baseline

FluxIQ must target WCAG 2.2 AA for ordinary web content and use the ARIA Authoring Practices for composite widgets.

Required baseline:

- full keyboard operation with visible focus;
- skip link and logical landmark structure;
- one clear page heading and ordered section headings;
- 4.5:1 normal-text contrast and 3:1 large-text/non-text contrast;
- 24x24 CSS-pixel minimum pointer targets, with 32-40px preferred for primary operational controls;
- reduced-motion support;
- 200% zoom and text-spacing resilience;
- dialogs, tabs, trees, menus, comboboxes, grids, and splitters implement their expected semantics and keyboard model;
- status changes are announced without excessive live-region noise;
- graphs provide a keyboard-readable node/edge outline alternative;
- visual state is never conveyed by color alone;
- destructive and security actions are understandable to screen-reader users.

## Target Information Architecture

### Global Level

- Program launcher
- Domains
- User/account menu
- Global programs: Automation Studio, Identity and Access, Secret Keys, Database, Compute, Deployment, Documentation, Background Tasks, Production Runs

### Automation Studio Level

- Project browser
- Active project workspace
- Left hierarchy containing only Flows and their owned objects
- Main view/panes
- Optional inspector
- Optional timeline bottom region
- Preferences and layout commands

### Flow Level

- Router
- Subflows
- Instructions
- Recordings
- Adaptations
- Runs
- Runtime Debug
- Settings

### Subflow Level

- Nodes
- Subflows
- Instructions
- Recordings
- Adaptations
- Runs
- Runtime Debug
- Settings

Router remains top-level only. State remains a global reusable view. Adaptations remain the sole normal review concept.

## Implementation Architecture

### Proposed UI Folders

```text
apps/web/src/ui/
  tokens/
  primitives/
  patterns/
  hooks/
  accessibility/

apps/web/src/features/automation-studio/
  shell/
  projects/
  hierarchy/
  workspace/
  graph/
  router/
  subflows/
  instructions/
  settings/
  runtime/
  state/
  recordings/
  adaptations/
```

Feature folders own their components, state hooks, styles, tests, and view-models. `AutomationStudioLive` should compose feature controllers rather than implement every workflow directly. `WorkspaceViews` should be retired as components move to owning folders.

### State And Data Rules

- Server data is scoped by project, Flow, view, query, page, and selected detail.
- Summary objects never silently masquerade as full detail.
- Request state is explicit: idle, loading, refreshing, success, empty, error.
- Abort stale requests when project, Flow, selection, or page changes.
- Cache summary pages and selected detail with bounded lifetime.
- Mutations update or invalidate only affected caches.
- UI preferences are versioned and normalized separately from domain data.
- URL state owns stable navigation concepts: project, Flow/subflow, object/view, selected run/adaptation, filters, and page where appropriate.

## Exhaustive Surface Coverage Contract

This section is the required second-pass inventory. A UI phase is incomplete
if it improves only the default screenshot while ignoring any listed state,
entry point, inner view, responsive composition, or failure path.

### Per-Surface Specification Template

Every surface below must receive a written implementation specification with:

1. user and job-to-be-done;
2. canonical navigation entry and deep-link format;
3. primary and secondary actions;
4. information hierarchy and content priority;
5. empty, loading, refreshing, success, partial, stale, error, unauthorized,
   offline, busy, and disabled states where applicable;
6. dirty-state, save, discard, conflict, retry, and recovery behavior;
7. keyboard model, focus order, screen-reader name, and announcements;
8. desktop, compact desktop, tablet, narrow, zoomed, and long-content layouts;
9. summary/detail data contract, pagination, cancellation, and cache policy;
10. performance budget and stress fixture;
11. analytics or diagnostic events needed to detect failure;
12. unit, component, browser, accessibility, and screenshot coverage;
13. migration behavior for persisted links, preferences, and legacy records;
14. definition of done with before/after evidence.

### Surface Disposition Vocabulary

- **Keep:** remains a canonical visible product surface.
- **Consolidate:** remains, but shares one implementation with overlapping views.
- **Relocate:** remains, but belongs in a different fixed region or navigation level.
- **Compatibility only:** opens old data but is absent from normal creation/navigation.
- **Retire:** remove after migration because it duplicates or contradicts the product model.
- **Decision required:** no implementation begins until product ownership is explicit.

## Automation Studio Shell Inventory

### AS-SHELL-01: Project Gate And Project Browser

**Disposition:** Keep and rebuild.

Cover loading the project index, no projects, no search results, categorized and
uncategorized projects, recent projects, create, rename, move, delete, category
create/rename/move/delete, authorization, drag alternatives, stale project
records, failed project open, and return from an active project.

Required details:

- project name is primary; ID and storage location are secondary;
- create project is always discoverable;
- category rearrangement has menu and keyboard alternatives;
- destructive actions state whether child Flows and workspace preferences go;
- opening a project produces immediate progress and never renders stale content
  from the previously open project;
- the project URL and most recent valid project can be restored safely.

### AS-SHELL-02: Global Studio Topbar And Command Bar

**Disposition:** Keep, simplify, and make contextual.

Cover Back, product identity, active project/Flow breadcrumb, Save, Run, Stop,
Undo, Redo, command status, dirty state, layout/preferences access, account
access, constrained-width overflow, permission-disabled commands, save failure,
run readiness failure, and a command targeting a noneditable view.

Required details:

- commands operate only on the active editable object;
- icon controls have tooltips and keyboard shortcuts;
- status communicates Saved, Unsaved, Saving, Running, Failed, and Offline;
- low-frequency commands move into a labelled menu;
- narrow layouts never hide Save, Run/Stop, current context, or navigation.

### AS-SHELL-03: Left Sidebar Frame

**Disposition:** Keep as primary discovery.

Cover sidebar resize/collapse, search, object-type filter, project return,
hierarchy loading, hierarchy error/retry, no Flows, no filter matches, deep
nesting, long names, action overflow, narrow-screen drawer, and persisted width.

Required details:

- width allocation favors object names over icons/actions;
- collapse never destroys selection or scroll position;
- reopening scrolls the selected object into view;
- search highlights matches and explains ancestor-only context rows;
- filters do not create impossible hidden selection states.

### AS-SHELL-04: Flow/Subflow Hierarchy Tree

**Disposition:** Keep and make semantically complete.

Cover root Flows, Flow container, Router, Subflows folder, nested categories,
subflow containers, Nodes, Instructions, Recordings, Adaptations, Runs,
Runtime Debug, Settings, nested subflows, selected/correlated/focused states,
create folder/subflow, delete object, Settings shortcut, and loading repair.

Required details:

- real tree/treeitem/group semantics and roving focus;
- Left/Right collapse and expand; Up/Down/Home/End navigation;
- Enter opens; context menu or modifier command opens in another pane;
- no delayed 220ms single click;
- one visual selection only;
- Flow name opens Router;
- subflow name expands and opens Nodes;
- Router appears only under a top-level Flow;
- generated structure cannot be accidentally deleted;
- all deletable user objects expose consistent confirmation and authorization.

### AS-SHELL-05: Workspace Region Layout

**Disposition:** Keep strict regions; retire freeform behavior.

Cover one/two/three main panes, right inspector expanded/collapsed, timeline
expanded/collapsed, maximized main view, page fullscreen, saved layouts,
preference migration, unavailable saved view, resize, reset, and narrow mode.

Required details:

- reconcile implementation with the strict workspace layout plan;
- remove freeform window coordinates, snap previews, z-index ordering, invisible
  window edges, and floating-window persistence;
- splitters are visible, keyboard-adjustable, and expose current values;
- one scroll owner exists inside each region;
- narrow mode uses one active view plus drawers/sheets.

### AS-SHELL-06: Inner Window Header And Tabs

**Disposition:** Keep tabs; replace interaction implementation.

Cover active/inactive tabs, unsaved tab, loading tab, failed tab, long label,
many tabs, close one, close others, reopen, reorder, move to pane, overflow,
keyboard navigation, and tab restored after refresh.

Required details:

- tablist/tab/tabpanel semantics with roving tabindex;
- Arrow keys, Home/End, Enter/Space, and Ctrl/Cmd+W;
- close uses a button, not a clickable span;
- overflow chevrons and searchable tab menu;
- scrollbar never consumes the usable tab height;
- moving/reordering has menu and keyboard alternatives;
- closing dirty content invokes the shared unsaved-changes dialog.

### AS-SHELL-07: View Adder And Layout Picker

**Disposition:** Consolidate into workspace commands.

Cover Add Tab, Add Pane, view search, categorized views, unavailable/contextless
views, duplicate-instance policy, layout presets, current-layout indication,
small viewport, outside click, Escape, and focus return.

Required details:

- these are accessible popovers/menus, not unlabelled floating sections;
- only views valid for current context are enabled;
- obsolete Proposal, Config, and duplicate Dock entries are removed;
- every option explains placement and current object scope concisely.

### AS-SHELL-08: Preferences

**Disposition:** Keep and rebuild as a real settings dialog.

Cover layout defaults, sidebar width, inspector/timeline defaults, reduced
motion, density where supported, reset to defaults, preference migration,
invalid persisted values, save failure, and restore.

Required details:

- settings are grouped and previewed;
- Reset names what will change;
- preferences never contain domain data;
- keyboard and narrow-screen behavior matches shared Dialog standards.

## Registered Automation Studio View Inventory

The source currently registers 18 view instances. Every instance below requires
an explicit disposition and a separate acceptance checklist.

### AS-VIEW-01: Connected Clients (`client-gateway`)

**Disposition:** Relocate as a project-level utility; keep Flow context optional.

Cover gateway unavailable, listening, no clients, pairing pending, approved,
rejected, expired, connected, disconnected, multiple clients, active recording,
client capabilities, audit history, action capture form, and errors.

Upgrade requirements:

- shared pairing/authorization dialog;
- event-driven updates or visibility-aware backoff;
- searchable client list and selected-client detail;
- clear trust, capability, last-seen, and recording state;
- Start/Stop recording are contextual and cannot double-submit;
- audit rows are paged and details load on selection;
- client names are primary and session IDs are copyable secondary data.

### AS-VIEW-02: Recording Timeline (`timeline-recording`)

**Disposition:** Keep as the canonical recording detail.

Cover no selection, summary-only selection, loading full recording, active
recording, finalized recording, failed/incomplete recording, event filters,
zoom, pan, current event, note, marker, rename, finalize, delete, state preview,
evidence links, and very long timelines.

Upgrade requirements:

- recording header, timeline controls, event track, event detail, and state
  preview have stable regions;
- all prompt actions become inline forms/dialogs;
- keyboard event traversal and selection;
- server-paged or windowed event loading for long recordings;
- recording language presents optional evidence, not direct adaptation creation;
- retain selection and zoom when opening State and returning.

### AS-VIEW-03: Proposal Generator (`proposal-generator`)

**Disposition:** Compatibility only, then retire from ordinary navigation.

Required work:

- verify whether any current non-recording adaptation workflow still depends on it;
- prevent recordings from directly generating new proposals in normal UI;
- preserve read-only access for legacy artifacts where required;
- migrate useful goal/constraint fields to explicit adaptation or Flow creation;
- remove from View Adder and normal recording actions;
- document and test legacy deep-link behavior before removal.

### AS-VIEW-04: Proposal Workbench (`proposal-workbench`)

**Disposition:** Compatibility only; consolidate durable review into Adaptations.

Required work:

- identify policy and recording proposal record variants;
- map legacy status, graph, evidence, review, and approval into a compatibility view;
- prevent creation of new normal-user proposal records;
- route current change review to Adaptations;
- remove native alerts/prompts;
- show a compatibility banner and migration target without exposing dead actions.

### AS-VIEW-05: Nodes Whiteboard (`policy-primary`)

**Disposition:** Keep as the canonical subflow graph editor.

Cover blank graph, starter graph, loading definitions, read-only graph, editable
graph, invalid graph, dirty graph, saving, save failed, draft restore, node
selected, multi-select, edge selected, palette, inspector, search, zoom, fit,
undo/redo, connect, delete, duplicate, copy/paste, large graph, and missing node
definition.

Upgrade requirements:

- stable canvas toolbar and command shortcuts;
- searchable categorized node palette with recent/favorites;
- explicit select and pan modes;
- keyboard-readable graph outline and keyboard editing;
- inline node/edge validation linked to Problems;
- selected node inspector uses schema controls and field-level errors;
- draft recovery is visible and testable;
- no graph-wide rerender from unrelated runtime/sidebar updates;
- stress budgets for node count, edge count, selection, drag, and save.

### AS-VIEW-06: Router (`flow-router`)

**Disposition:** Keep as top-level Flow orchestration.

Cover zero subflows, one subflow/direct route, many subflows, no routes, grouped
routes, ungrouped routes, disabled route, invalid target, fallback, nested
condition, create/edit/duplicate/delete/reorder/test route, group management,
authorization, load/save error, and narrow layout.

Upgrade requirements:

- one ordered list, no duplicate decorative map;
- visual nested condition builder;
- searchable subflow target picker;
- pinned fallback and route validation;
- Move Up/Down plus drag;
- test panel shows matched route and why others did not match;
- SQL/search strategy for very large target/route collections;
- remove stale Router CSS and old canvas assumptions.

### AS-VIEW-07: Subflows Directory (`flow-subflows`)

**Disposition:** Keep as directory and creation entry.

Cover no subflows, paged subflows, search/filter, disabled/archived subflow,
nested category, selected subflow, create folder/subflow, duplicate, rename,
archive/delete, route usage, load error, and refresh.

Upgrade requirements:

- rows open Nodes;
- names/roles/status are primary, graph IDs secondary;
- pagination and filters are URL-restorable;
- route references and readiness are summary data;
- no embedded graph editor;
- creation modal handles folder versus subflow clearly;
- creation updates hierarchy and Router targets without flicker.

### AS-VIEW-08: Instructions (`flow-instructions`)

**Disposition:** Keep and deepen.

Cover no instructions, inherited-only, paged list, search/filter, selected,
new draft, dirty draft, save/auth, save failure, disabled/archived, required,
conflicting, oversized, shadowed, on-error, Router, subflow, node, and global
scope resolution.

Upgrade requirements:

- Library, Editor, and Effective Preview inner views;
- named importance levels plus advanced numeric priority;
- scope builder using object pickers;
- inheritance and precedence visualization;
- conflict, shadow, duplicate, missing-required, and token-budget diagnostics;
- templates and Flow-readiness entry points;
- local draft preservation and shared authorization.

### AS-VIEW-09: Adaptations (`adaptations`)

**Disposition:** Keep as the only normal change-review surface.

Cover no adaptations, proposed, validating, validated, approval required,
auto-approved, applied, rejected, superseded, failed, low/high/destructive risk,
Flow/subflow/node scope, source run, evidence, patch test, conflict, and audit.

Upgrade requirements:

- paged/filterable list and selected detail;
- Summary, Changes, Evidence, Validation, and Audit inner views;
- structured before/after changes;
- links to affected objects and source run/action;
- clear automatic versus manual approval state;
- shared review/authorization dialogs;
- live status updates without list reordering surprise;
- legacy proposal compatibility is linked, not duplicated.

### AS-VIEW-10: Settings (`flow-settings`)

**Disposition:** Keep with Flow and subflow variants.

Cover default values, inherited values, overrides, invalid combinations, dirty,
saving, save failed, reset field, reset section, provider/key unavailable,
training mode, approval mode, budgets, safety, interface, dependencies, source
authority, publication state, and subflow mapping/lifecycle.

Flow inner sections:

1. General identity and description;
2. Runtime defaults and concurrency/timeouts;
3. LLM provider, model, secret, and intervention behavior;
4. Adaptation/approval behavior;
5. token, cost, intervention, retry, and training limits;
6. safety and effect policy;
7. Flow inputs, outputs, defaults, and validation;
8. publication, dependencies, and version compatibility;
9. advanced source/diagnostic settings.

Subflow inner sections:

1. General name, role, status, and tags;
2. typed input mappings;
3. typed output mappings;
4. local instruction bindings;
5. approval override and inherited value;
6. route references and lifecycle;
7. immutable internal graph identity in technical detail.

Required details:

- in-page section navigation;
- effective value and source on every inherited setting;
- object/model/secret pickers instead of internal ID text fields;
- sticky Save/Discard with a change summary;
- inline validation and linked readiness blockers;
- no statistics header and no ordinary raw JSON editor.

### AS-VIEW-11: State View (`state-explorer`)

**Disposition:** Keep as a globally reusable detail view.

Cover no source, loading source, unavailable source, input/output phase, observed
and expected state, screenshot surface, document surface, structured-only state,
selected fact, selected evidence, compare, diff, failed image, huge document,
many overlays, raw data, and state-index repair.

Required inner views:

1. Visual;
2. Structured;
3. Diff;
4. Compare;
5. Evidence;
6. Raw.

Required details:

- source and phase selectors remain visible;
- visual canvas has fit/zoom/pan/layer controls;
- selected element synchronizes with a detail inspector;
- overlay labels never collide or obscure source content;
- structured tree supports search, changed-only, expand/collapse, and copy;
- repair uses a proper dialog and preserves context;
- raw JSON is detail-only and loaded/rendered on demand.

### AS-VIEW-12: Runs (`runs-history`)

**Disposition:** Retired from normal navigation in Phase 1.1; persisted references redirect to Runtime Debug.

Cover paged runtime runs, replay runs, mixed status, filters, sorting, selected
run, replay detail, empty state, loading, error, refresh, and live updates.

Required details:

- one shared Run History implementation;
- decide whether Runs is the canonical history while Runtime Debug opens the
  same component with run controls, or merge both into one view;
- replay history must not be bolted below runtime history as a second full table;
- use inner Runtime Runs and Replays views if both remain;
- SQL filters, page size, stable ordering, and URL restoration;
- row selection opens canonical run detail.

### AS-VIEW-13: Signals Relationship Web (`signals-web`)

**Disposition:** Decision required; keep only with a clear user job.

Cover no domains, no signals, domain filter, selected signal, relationships,
high-degree graph, stale registry, load error, and links to consuming objects.

Decision questions:

- Is this a debugging utility, authoring picker, or architecture explorer?
- Does it belong globally, per project, or per Flow?
- Is a graph materially better than searchable lists and dependency detail?

If kept:

- provide search, domain/type filters, list/graph modes, legend, keyboard outline,
  selected detail, and links to Router/Node/Instruction consumers;
- lazy-load relationships and cap graph rendering;
- remove warning-state styling when the view is healthy.

### AS-VIEW-14: Runtime Debug (`runtime-debug`)

**Disposition:** Keep; consolidate list/detail infrastructure with Runs.

Cover no Flow, not ready, run inputs, three adaptation modes, advanced controls,
running, stop, run failed, last-run summary, paged history, filters, live update,
selected run, and every run-detail inner view.

Run detail inner views:

1. Overview;
2. Actions;
3. Recovery and Routing;
4. LLM and Adaptation;
5. State and Effects;
6. Audit.

Action detail inner views:

1. Summary and timing;
2. Inputs;
3. Outputs;
4. State Before;
5. State After;
6. Diff;
7. Logs;
8. Effects;
9. Recovery;
10. Raw JSON.

Required details:

- run history remains single-line, stable, clickable rows;
- list pagination is at the bottom and SQL-backed;
- filters and order do not flash/reverse after initial render;
- run overview loads separately from paged action detail;
- selecting an action opens a drawer/panel and never expands the list row;
- action/effect/recovery/intervention payloads load on demand;
- live runs append/update without replacing the whole list;
- 10,000-action stress run remains responsive;
- audit export is server-streamed or worker-prepared when large.

### AS-VIEW-15: Problems (`problems-view`)

**Disposition:** Keep as a shared validation utility; relocate by context.

Cover no problems, errors, warnings, info, grouped source, stale problem,
selected problem, filtered severity, many problems, and resolved-on-refresh.

Required details:

- group by Flow/subflow/object and severity;
- clicking focuses the exact view/node/field/route;
- filter by current object versus whole project;
- distinguish blocking readiness errors from recommendations;
- stable problem codes and deduplication;
- do not hide critical errors only inside the Workspace Dock.

### AS-VIEW-16: AI Assistant (`ai-assistant`)

**Disposition:** Decision required; rebuild or remove until functional.

The current local text/proposal placeholder is not a credible assistant.

If kept, define:

- supported jobs: explain selection, diagnose run, draft instruction, suggest
  Router condition, explain state diff, or prepare an adaptation;
- exact context visible to the user before sending;
- provider/model/key readiness and cost indication;
- streamed response, cancellation, retry, citations to FluxIQ objects/evidence;
- structured proposed actions with preview and approval;
- conversation persistence/retention and sensitive-data policy;
- empty, unavailable, rate-limited, provider error, and malformed-output states;
- no hidden mutation from chat text.

If these cannot be implemented, remove the view from the adder until they can.

### AS-VIEW-17: Global Inspector (`global-inspector`)

**Disposition:** Keep in the fixed right region.

Cover no selection, Flow, subflow, node, edge, route, instruction, recording,
timeline event, state fact, run, action, adaptation, signal, and legacy object.

Required details:

- context-specific sections and actions;
- editable fields only when the inspector is the canonical owner;
- otherwise use read-only summary with Open Detail;
- selected-object breadcrumb and ID copy;
- loading/detail hydration without clearing prior valid context;
- pinned width, narrow drawer, keyboard focus return;
- never duplicate a full Settings or Adaptation editor.

### AS-VIEW-18: Workspace Dock (`workspace-dock`)

**Disposition:** Retire or sharply reduce; currently duplicates views.

Current tabs duplicate Assistant, Problems, and State.

Required decision:

- Problems remains a dedicated utility view and optional compact count;
- State remains a dedicated reusable view;
- Assistant remains only if rebuilt;
- bottom fixed region remains Timeline where recording context requires it.

Do not retain a generic Dock solely to host duplicate mini-versions. If a compact
utility tray remains, define one unique job, fixed contents, and narrow behavior.

## Automation Studio Embedded And Supporting Surfaces

### AS-INNER-01: Node Palette

Cover categories, search, no matches, favorites, recent nodes, disabled/
incompatible nodes, drag add, keyboard add, descriptions, ports, and large
registries. Node definitions load once and palette filtering stays instant.

### AS-INNER-02: Node/Edge Rendering

Cover selected, focused, invalid, disabled, running, succeeded, failed, adapted,
breakpoint, missing definition, many ports, long labels, and collapsed detail.
Status must use icon/text as well as color.

### AS-INNER-03: Parameter Editor

Cover string, long text, boolean, number, enum, reference, path, field, typed
value, object, nested object, array, required, invalid, default, inherited,
secret reference, and unknown schema.

Real pickers must replace text fields labelled as pickers. Object/array controls
must preserve value types and avoid accidental coercion.

### AS-INNER-04: Inspector Sections

Cover collapsed/expanded sections, editable/read-only rows, provenance, evidence,
copy, navigation, long values, missing values, and validation.

### AS-INNER-05: Timeline Bottom Region

Cover no recording context, selected recording, active recording, collapsed,
resized, event selected, preview selected, and narrow bottom sheet. It must not
duplicate the full Timeline editor.

### AS-INNER-06: Run Control Panel

Cover readiness, schema inputs, defaults, invalid input, adaptive/manual/
deterministic selection, advanced step limit, running progress, stop, failure,
retry, and Open Live Log. Internal JSON serialization must not leak into UI.

### AS-INNER-07: JSON And Code Viewers

Cover loading, invalid/unserializable value, huge value, search, fold, copy path,
copy value, wrap, line numbers, download, sensitive-value masking, and worker-
based formatting for large payloads.

### AS-INNER-08: Status, Toast, Banner, And Progress

Cover field error, form error, panel read failure, destructive warning, offline,
background success, long-running progress, cancellation, and retry. Remove
message-text tone inference and use typed status codes.

### AS-MODAL-01: Project And Category Actions

Create, rename, move, delete, category actions, authorization, validation,
conflict, busy, and failure all use shared dialog behavior.

### AS-MODAL-02: Hierarchy Creation And Deletion

Cover Flow, category/folder, subflow, nested category, instruction where allowed,
type selection, details, preset, parent, validation, authorization, success, and
error. Never create an ambiguous object from a generic form.

### AS-MODAL-03: Route And Group Editing

Cover common fields, advanced condition fields, target picker, test, dirty close,
save/auth, delete, and narrow sizing with a fixed reachable footer.

### AS-MODAL-04: Recording Actions

Cover rename, note, marker, finalize, delete, repair, start, and stop with risk-
appropriate authorization and preserved timeline context.

### AS-MODAL-05: Flow Lifecycle

Cover save, publish, version/changelog, deprecate/reason, discard, run saved
version, permission grant, and conflict resolution.

### AS-MODAL-06: Adaptation Review

Cover approve, apply, reject, supersede, reason policy, destructive risk,
validation failure, stale version, and completed action.

### AS-MODAL-07: Authorization

One shared implementation covers password, PIN, TOTP, risk tier, grant duration,
errors, rate limits, cancellation, and return focus. The calling workflow owns
the action description and consequence.

## Global Application Surface Inventory

### GLOBAL-01: Login And First Setup

Cover first setup, normal password login, staged TOTP, invalid username/password,
invalid TOTP, attempts remaining, rate limit countdown, disabled user, expired
session, server unavailable, Caps Lock, show password, password manager, and
forced replacement of default credentials.

### GLOBAL-02: Program Launcher

Cover domains, global programs, no domains, many programs, search, recent,
favorites if adopted, keyboard navigation, program unavailable, permissions,
loading, and account menu. Replace repeated descriptive cards with a scalable
launcher/list composition.

### GLOBAL-03: Domain Directory And Domain Program Routing

Cover domain identity, domain programs, back navigation, missing domain,
unavailable program, permissions, and deep links. Domain and global shells must
share navigation and responsive behavior.

### GLOBAL-04: Program Workspace Shell

Cover title, breadcrumb, local navigation, contextual actions, Main, technical
API/Storage/Runtime details, busy/status state, narrow navigation, and errors.
Capability inventories must be secondary technical details, not equal-weight
default tabs.

### GLOBAL-05: Global Client Pairing Overlay

Consolidate with shared Dialog and Connected Clients. Cover pending, multiple
requests, reference match, approve, reject, expiration, request failure, and
focus/return behavior.

## Global Program View Inventory

### PROGRAM-01: Identity And Access

Cover authentication summary, user list, search/filter, user detail, create user,
enable/disable, role edit, password change, PIN change, 2FA setup/disable,
QR/manual secret, role list, authorization, self-edit, last-admin protection,
errors, and audit context.

Split into Users, Roles, and Authentication Policy inner views. Row actions use
menus, credentials use focused dialogs, and security consequences are explicit.

### PROGRAM-02: Secret Keys

Cover no keys, list/search/filter, selected key, add, edit metadata, rotate,
reveal, copy, auto-hide, delete, LLM/custom type, known/custom provider, model,
global/domain/Flow/custom scope, scope object picker, auth tiers, missing runtime
support, load error, and stale reveal.

The page is list-first. Add Key begins after intent. Reveal state clears on close,
timeout, navigation, and failed reauthorization.

### PROGRAM-03: Database Manager

Cover database tree, stores, sensitive locked store, authorization grant and
expiry, no rows, paged rows, search, column filter, sort, selected row, record
detail, null/binary/JSON/long values, wide schemas, load error, refresh, and
narrow layout.

Use explorer, data grid, and detail inspector regions. All growable queries use
server pagination/filter/sort. Sensitive values never leak into summary caches.

### PROGRAM-04: Documentation

Cover snapshot loading, source list, file tree, folder expansion, search, active
document, Markdown, generated HTML, broken link, missing page, heading outline,
deep link, rebuild, rebuild progress/error, warnings, huge docs trees, narrow
drawer, and keyboard tree navigation.

### PROGRAM-05: Background Tasks

Cover scheduler running/paused, no tasks, task enabled/disabled, next run,
manual task, due task, selected task, run now, run history, failed run, result
detail, retry/cancel where supported, filters, paging, and live countdown.

### PROGRAM-06: Compute Control

Cover no nodes, connected/degraded/offline nodes, capabilities, domains, last
heartbeat, selected detail, search/filter, refresh, stale node, and errors.
Summary-only UI is insufficient; health and capability detail need clear owners.

### PROGRAM-07: Deployment Sync

Cover repository unavailable, clean/dirty tree, branches, current branch,
remotes, versions, dry run, checkout/sync, rollback, progress, logs, failure,
selected result, confirmation, and permissions. Use accessible inner tabs.

### PROGRAM-08: Production Runner

Cover target type, target selection, schema parameters, loops, delays, launch,
queued/running/paused/succeeded/failed/cancelled runs, progress, advance, cancel,
workload grouping, live logs, filters, paging, selected run, and error.

JSON parameters are advanced fallback only. Large run collections cannot render
all workload chips in a single board.

### PROGRAM-09: Runtime/Compute Technical Capability Panels

Audit API, Storage, and Runtime inventory panels for every program. Decide which
are developer diagnostics and relocate them under Technical Details. Add copy,
search, empty/error states, and clear permission boundaries if retained.

## Shared Primitive And Pattern Inventory

Each primitive requires visual states, keyboard behavior, ARIA contract,
responsive behavior, tests, and a migration list.

1. Button: primary, secondary, quiet, danger, icon-only, busy, disabled.
2. Link and link-button: navigation versus command semantics.
3. Field: label, required/optional, help, error, warning, success, disabled.
4. Text input, password, number, textarea, select, checkbox, switch, radio.
5. Combobox/object picker: search, async results, no results, create option.
6. Segmented control: short single-selection modes and keyboard arrows.
7. Tabs: overflow, closeable tabs, dirty tabs, disabled tabs.
8. Menu/context menu: nested items, destructive items, shortcuts.
9. Tooltip: delay, keyboard focus, touch alternative, no critical hidden content.
10. Dialog, AlertDialog, AuthorizationDialog, Drawer, Popover.
11. Toast, inline notice, banner, progress, skeleton, spinner.
12. Status badge: normalized vocabulary, icon/text, unknown status.
13. Empty state: no data, no match, unauthorized, setup required, failed read.
14. Data table/grid: accessible name, sort, select, resize, paging, responsive.
15. List row: selected, focused, unread/update, actions, loading.
16. Pagination: total, range, size, first/previous/next/last, URL state.
17. Tree: roving focus, expanded state, actions, virtualized large trees.
18. Splitter: visible handle, keyboard increments, min/max/reset.
19. Toolbar/command bar: groups, overflow, shortcuts, contextual availability.
20. Breadcrumb: scope, overflow, object navigation, copy ID in detail.
21. Detail list/key-value: long values, copy, missing values, responsive.
22. JSON viewer and code viewer: on-demand formatting and large-value safety.
23. Search/filter bar: debouncing, clear, active filter chips, result count.
24. Form footer: dirty summary, Save, Discard, busy, server conflict.
25. File/graph/timeline canvas controls: zoom, fit, pan, reset, keyboard model.

## Cross-Cutting State Matrix

Every data-backed surface must implement these distinctly:

- **Idle:** no request should run yet because context is absent.
- **Initial loading:** skeleton preserves the target composition.
- **Refreshing:** prior valid data remains visible with local progress.
- **Success:** current data and update timestamp where freshness matters.
- **Empty:** valid request returned no data and offers the correct next action.
- **No match:** data exists but search/filter returned none.
- **Partial:** summaries are visible while selected detail still loads.
- **Stale:** cached data is visible while revalidation failed or is pending.
- **Error:** message, stable code, retry, and retained context.
- **Unauthorized:** required permission and recovery path are explicit.
- **Offline/unavailable:** distinguishes network/runtime/provider failure.
- **Busy mutation:** originating action is disabled and progress is local.
- **Mutation failed:** entered values remain and field/server errors are shown.
- **Conflict:** remote change versus local draft can be reviewed and resolved.
- **Cancelled:** user cancellation is not reported as failure.
- **Deleted elsewhere:** close invalid detail and return to a valid parent.
- **Legacy:** compatibility content is labelled and cannot invoke dead workflows.

## Revised Granular Execution Plan

This 20-phase map supersedes the earlier coarse phase grouping. Existing
requirements remain binding; this map makes ownership and order explicit.

### Granular Phase 0: Browser Baseline And Fixtures

0.1 [Completed 2026-08-26] Add the Playwright browser-test harness and viewport projects.
0.2 [Completed 2026-08-26] Capture every surface in default, empty, loading, error, and narrow states.
0.3 [Completed 2026-08-26] Add stress fixtures for hierarchy, graph, run, timeline, database, and docs.
0.4 [Completed 2026-08-26] Record task timings, payloads, long tasks, and render counts.
0.5 [Implemented 2026-08-26; execution pending] Run baseline axe, keyboard, zoom, and reduced-motion audits.
0.6 [Completed 2026-08-26; screenshot artifacts pending manual run] Attach defect IDs and screenshots to this document's ledger.

### Granular Phase 1: Information Architecture Decisions

1.1 [Completed 2026-08-26] Confirm canonical Runs versus Runtime Debug relationship.
1.2 [Completed 2026-08-26] Confirm Proposal Generator and Proposal Workbench compatibility retirement.
1.3 [Completed 2026-08-26] Confirm Workspace Dock retirement/reduction.
1.4 [Completed 2026-08-26] Define AI Assistant jobs or remove it until functional.
1.5 [Completed 2026-08-26] Define Signals Relationship Web ownership and job.
1.6 [Completed 2026-08-26] Move technical capability tabs out of primary program navigation.
1.7 [Completed 2026-08-26] Lock canonical deep-link schema for project/Flow/subflow/view/detail.

### Granular Phase 2: Tokens, Typography, And Visual Language

2.1 [Completed 2026-08-26] Semantic color and contrast tokens.
2.2 [Completed 2026-08-26] Type scale and dense operational text rules.
2.3 [Completed 2026-08-26] Spacing, control height, radius, border, elevation, and focus tokens.
2.4 [Completed 2026-08-26] Status vocabulary and icon/color mapping.
2.5 [Completed 2026-08-26] Light surface hierarchy for shell, pane, tool, selected, and code content.
2.6 [Completed 2026-08-26] Motion/reduced-motion and z-index layer contracts.

### Granular Phase 3: Core Interactive Primitives

3.1 [Completed 2026-08-26] Buttons and links.
3.2 [Completed 2026-08-26] Form fields and validation.
3.3 [Completed 2026-08-26] Menus, tooltips, comboboxes, and segmented controls.
3.4 [Completed 2026-08-26] Tabs and overflow.
3.5 [Completed 2026-08-26] Dialogs, authorization, drawers, and popovers.
3.6 [Completed 2026-08-26] Notices, toast, loading, and progress.
3.7 [Completed 2026-08-26] Tables, lists, pagination, and trees.
3.8 [Completed 2026-08-26] Splitters, toolbars, breadcrumb, JSON/code viewer.

### Granular Phase 4: Global Shell And Authentication

4.1 [Completed 2026-08-26] Login and first-setup workflow.
4.2 [Completed 2026-08-26] Program launcher and domain directory.
4.3 [Completed 2026-08-26] Global topbar, account menu, and breadcrumbs.
4.4 [Completed 2026-08-26] Program workspace shell and Technical Details.
4.5 [Completed 2026-08-26] Global pairing dialog.
4.6 [Completed 2026-08-26] Responsive page/drawer composition.

### Granular Phase 5: Studio Data And Controller Boundaries

5.1 Split project, hierarchy, Flow, recording, runtime, state, and layout hooks.
5.2 Add explicit request-state types and abort stale requests.
5.3 Add summary/detail cache ownership and mutation invalidation.
5.4 Remove broad `any` view prop bags incrementally.
5.5 Add render/request instrumentation and budgets.

### Granular Phase 6: Project Browser And Hierarchy

6.1 Project/category browser.
6.2 Project action dialogs and authorization.
6.3 Sidebar frame, search, filters, width/collapse.
6.4 Semantic Flow/subflow tree and keyboard model.
6.5 Row actions/context menus and full title width.
6.6 Flow->Router, Subflow->Nodes, refresh, and deep-link restoration.
6.7 Large-tree indexing, pagination where needed, and performance tests.

### Granular Phase 7: Strict Workspace And View Management

7.1 Remove freeform windows and geometry.
7.2 Main panes, inspector region, and timeline region.
7.3 Semantic tabs, close/reorder/move, and overflow.
7.4 Keyboard splitters and layout reset.
7.5 View Adder and valid-context filtering.
7.6 Preferences and migration.
7.7 Narrow single-view plus drawer/sheet mode.

### Granular Phase 8: Nodes Whiteboard

8.1 Graph controller/view split.
8.2 Canvas toolbar and keyboard graph outline.
8.3 Node palette.
8.4 Node, edge, port, selection, connect, and drag behavior.
8.5 Parameter editor and real reference pickers.
8.6 Validation/Problems integration.
8.7 Draft recovery and save/conflict state.
8.8 Large graph performance and screenshots.

### Granular Phase 9: Router

9.1 Empty state and first subflow path.
9.2 Ordered route list and responsive rows.
9.3 Groups and fallback.
9.4 Visual condition builder.
9.5 Searchable target picker.
9.6 Reorder/duplicate/enable/delete actions.
9.7 Route test and explanation.
9.8 Loading, save, authorization, errors, and stale CSS removal.

### Granular Phase 10: Subflows

10.1 Directory list, SQL pagination, filters, and URL state.
10.2 Folder/subflow creation modal.
10.3 Rename, duplicate, lifecycle, and delete.
10.4 Route references and readiness summary.
10.5 Container/Nodes navigation and breadcrumbs.
10.6 Nested subflow scoped objects and refresh hydration.
10.7 Subflow scale/performance tests.

### Granular Phase 11: Instructions

11.1 Library list, search, filters, and pagination.
11.2 Editor hierarchy and draft preservation.
11.3 Scope/object picker.
11.4 Importance, requirement, status, and templates.
11.5 Effective precedence and inheritance preview.
11.6 conflict/shadow/token diagnostics.
11.7 readiness links, save, and authorization.

### Granular Phase 12: Flow And Subflow Settings

12.1 Section navigation and sticky form footer.
12.2 General and runtime.
12.3 LLM provider/model/secret.
12.4 Adaptation/approval and training.
12.5 Limits, safety, inputs/outputs, and dependencies.
12.6 Effective/default/inherited/override behavior.
12.7 Subflow mappings, instructions, approval, and lifecycle.
12.8 Validation, save/conflict, and settings deep links.

### Granular Phase 13: Runtime Controls And Run History

13.1 Typed schema inputs and readiness.
13.2 Adaptive/manual/deterministic mode control.
13.3 progress, Stop, retry, and Live Log.
13.4 Shared Run History.
13.5 SQL filters, sort, page size, and stable ordering.
13.6 Runtime Runs versus Replays composition.
13.7 Live updates without flicker or reorder surprise.

### Granular Phase 14: Run Detail And Action Debugging

14.1 Overview.
14.2 Server-paged Actions.
14.3 Action detail drawer and inner views.
14.4 Recovery and Routing.
14.5 LLM and Adaptation.
14.6 State and Effects.
14.7 Audit and large export.
14.8 10,000-action stress validation.

### Granular Phase 15: State And Evidence

15.1 Source/phase controls and data loading.
15.2 Visual canvas and collision-safe overlays.
15.3 Structured state.
15.4 Diff and Compare.
15.5 Evidence and cross-links.
15.6 Raw detail and state repair.
15.7 huge-state and failed-asset tests.

### Granular Phase 16: Recordings And Clients

16.1 Recording list/detail states and pagination.
16.2 Timeline controls and keyboard operation.
16.3 Notes, markers, rename, finalize, repair, and delete dialogs.
16.4 Bottom timeline synchronization.
16.5 Connected Clients and pairing.
16.6 recording-as-evidence language and legacy path cleanup.
16.7 Long timeline and event-stream performance.

### Granular Phase 17: Adaptations And Compatibility Retirement

17.1 Adaptation list and filters. **Complete.**
17.2 Summary/Changes/Evidence/Validation/Audit. **Complete.**
17.3 Structured diffs and object links. **Complete.**
17.4 Review authorization and lifecycle. **Complete.**
17.5 Legacy Proposal Generator compatibility. **Complete.**
17.6 Legacy Proposal Workbench compatibility. **Complete.**
17.7 remove normal Change Proposal navigation and creation. **Complete.**

### Granular Phase 18: Utility Views

18.1 Problems. **Complete.**
18.2 Global Inspector. **Complete.**
18.3 Signals decision and implementation/removal. **Complete.**
18.4 AI Assistant decision and implementation/removal. **Complete.**
18.5 Workspace Dock retirement/reduction. **Complete.**
18.6 verify utility placement and narrow behavior. **Complete.**

### Granular Phase 19: Global Operational Programs And Final Gate

19.1 Identity and Access. **Complete.**
19.2 Secret Keys. **Complete.**
19.3 Database Manager. **Complete.**
19.4 Documentation. **Complete.**
19.5 Background Tasks. **Complete.**
19.6 Compute Control. **Complete.**
19.7 Deployment Sync. **Complete.**
19.8 Production Runner. **Complete.**
19.9 automated accessibility, keyboard, visual, zoom, and performance gates. **Complete.**
19.10 dead CSS/component removal and authored documentation update. **Complete.**

## Exhaustive Completion Rule

The upgrade is not complete merely because every registered view renders.

Completion requires:

- every surface above has an explicit final disposition;
- every kept surface passes its full state matrix;
- every canonical workflow works with keyboard and pointer;
- every target viewport and 200% zoom remains usable;
- no normal workflow requires raw JSON or an opaque internal ID;
- no native browser dialog remains;
- no growable list relies on loading/rendering the complete collection;
- no large detail loads all child events by default;
- no obsolete Proposal, Config, freeform window, or duplicate Dock UI remains in
  normal navigation;
- all P0/P1 findings are closed with browser evidence;
- this document's ledger references tests, screenshots, measurements, and docs
  after every step.

## Detailed Delivery Plan

Every numbered step below requires updating this document immediately after the step with status, files changed, findings discovered, screenshots, measurements, tests, and remaining work.

### Phase 0: Baseline And Research Harness

1. Add a browser test harness using Playwright.
2. Build deterministic fixtures for empty, small, medium, and stress projects.
3. Capture baseline screenshots at all target viewports and zoom levels.
4. Record task timings for create Flow, create subflow, add instruction, edit settings, edit graph, run Flow, inspect run, review adaptation, add/reveal key, and query database.
5. Capture request counts, payload sizes, React render counts, and long tasks.
6. Run axe and a manual keyboard/screen-reader smoke pass.
7. Create a verified defect inventory linked to screenshots and routes.

**Exit criteria:** repeatable baseline artifacts exist and CI can run the smoke journeys without production data.

### Phase 1: Tokens And Primitive Components

1. Define semantic color, typography, spacing, sizing, focus, elevation, motion, and z-index tokens.
2. Add base Button/IconButton, form controls, Status, InlineNotice, EmptyState, Skeleton, and Spinner.
3. Add accessible Dialog/AlertDialog/AuthorizationDialog and Drawer.
4. Add Tabs, Menu, Tooltip, Combobox, Pagination, DataTable, Tree, Splitter, and JSONViewer patterns.
5. Add a primitive fixture route or test gallery without turning it into a production navigation item.
6. Add component-level browser accessibility and responsive tests.

**Exit criteria:** primitives cover all states and can replace existing shared UI without one-off styling.

### Phase 2: CSS Decomposition And Shell

1. Split reset/tokens/primitives from `globals.css`.
2. Move global program, auth, and Studio feature styles to owned modules.
3. Inventory and remove dead/legacy Router, proposal, freeform-window, and config styles only after screenshot parity.
4. Rebuild the global topbar, breadcrumbs, account menu, and program launcher.
5. Define page, compact desktop, tablet, and narrow shell modes.
6. Establish one scroll owner per page/pane and dynamic viewport sizing.

**Exit criteria:** shell routes pass all viewport/zoom tests with no clipping or unexpected nested scroll.

### Phase 3: Dialog And Form Migration

1. Replace project/category prompts and authorization.
2. Replace Flow save/publish/deprecate/run confirmations.
3. Replace recording, note, marker, rename, delete, and state-repair prompts.
4. Replace instruction, settings, adaptation, and proposal prompts.
5. Migrate identity, secrets, database, deployment, and production confirmations.
6. Add shared dirty-form navigation protection and field validation.
7. Remove all remaining native dialog calls.

**Exit criteria:** dialog accessibility tests pass and no user action uses a native prompt/confirm/alert.

### Phase 4: Project Browser And Hierarchy

1. Rebuild project browsing, search, recent items, create, and context actions.
2. Add keyboard alternatives for project/category moving.
3. Implement semantic Tree behavior and roving focus.
4. Remove delayed single-click/double-click dependency.
5. Add action menus and preserve usable title width.
6. Verify Flow->Router and Subflow->Nodes navigation and refresh restoration.
7. Add large hierarchy performance tests.

**Exit criteria:** hierarchy is complete by mouse and keyboard, one object is visibly selected, and a 1,000-node fixture stays within the interaction budget.

### Phase 5: Strict Workspace And Tabs

1. Reconcile current code with the strict workspace layout plan.
2. Remove freeform window geometry, snap, and z-index pathways.
3. Implement accessible main panes, optional inspector, and bottom timeline.
4. Replace current tabs with semantic tabs and overflow controls.
5. Add keyboard splitters and reset/layout commands.
6. Implement narrow-screen single-view/drawer behavior.
7. Migrate and version existing workspace preferences.

**Exit criteria:** no content depends on hidden drag/resize affordances and every open view is reachable at every target viewport.

### Phase 6: Nodes Whiteboard

1. Separate graph state/controller from rendering.
2. Rebuild the canvas toolbar and node palette.
3. Add keyboard graph outline and editing commands.
4. Upgrade selection, ports, edges, multi-select, and validation feedback.
5. Upgrade parameter inspector controls and inline errors.
6. Implement reliable draft recovery and save status.
7. Stress test large graphs and eliminate avoidable rerenders.

**Exit criteria:** core graph editing is understandable, keyboard-operable, and responsive on the stress fixture.

### Phase 7: Flow Authoring Views

1. Finalize Router list, visual condition builder, fallback, testing, and scale.
2. Upgrade Subflows directory and scoped breadcrumbs.
3. Rebuild Instructions library/editor/effective-preview workflow.
4. Rebuild Flow Settings and Subflow Settings section navigation, inheritance, pickers, validation, and sticky save controls.
5. Add Flow readiness with linked fixes.
6. Remove obsolete Config and Change Proposal normal UI remnants.

**Exit criteria:** a new user can create a runnable Flow with instructions, Router, subflow Nodes, settings, and validation without entering JSON or IDs.

### Phase 8: Runtime, Runs, And Debugging

1. Consolidate shared Run History.
2. Add SQL filters, sorting, page-size control, and restorable pagination.
3. Split run detail into Overview, Actions, Adaptation, State/Effects, and Audit.
4. Add server-paged action/effect/intervention/recovery endpoints.
5. Add action detail drawer and structured JSON viewer.
6. Add live-run stable updates, progress, Stop, and Open Live Log.
7. Generate typed Flow input controls and readiness blockers.
8. Add stress-run browser performance tests.

**Exit criteria:** opening a 10,000-action run does not freeze the browser and no default detail path downloads or renders all actions.

### Phase 9: State, Recordings, And Adaptations

1. Rebuild State inner tabs and synchronized visual/structured inspector.
2. Add state search, changed-only filtering, copy, and collision-safe overlays.
3. Rebuild Recording list/detail/timeline controls and dialogs.
4. Align recording language with optional-evidence product direction.
5. Consolidate Adaptations and remove normal Change Proposal workflows.
6. Add structured change diff, evidence, validation, and review authorization.

**Exit criteria:** evidence can be traced from run/action to state/recording and adaptation without losing navigation context.

### Phase 10: Identity, Secrets, Database, And Global Programs

1. Upgrade login and first-run credential setup.
2. Rebuild user/role/credential/2FA workflows.
3. Rebuild Secret Keys list-first creation/reveal/rotate/delete flows.
4. Upgrade Database Manager explorer, grid, sensitive grants, and pagination.
5. Upgrade Documentation navigation/search/deep links.
6. Upgrade Background Tasks, Compute, Deployment, and Production Runner.
7. Replace production parameter JSON with schema forms.

**Exit criteria:** every global program uses the shared system and passes the same responsive/accessibility/loading standards as Automation Studio.

### Phase 11: Accessibility, Performance, And Polish Gate

1. Run automated axe checks on every route and major view state.
2. Complete keyboard-only journeys for all critical workflows.
3. Test screen-reader labels/status on dialogs, tree, tabs, graph outline, tables, run detail, and sensitive actions.
4. Test color contrast, reduced motion, 200% zoom, text spacing, and forced colors.
5. Enforce request/payload/render/long-task budgets in stress fixtures.
6. Run visual regression across all viewports.
7. Remove dead CSS/components and update authored architecture docs.

**Exit criteria:** no P0/P1 audit finding remains open and quality gates run in CI.

## Cross-Phase Test Matrix

Each major surface needs:

- unit tests for view-model and state transitions;
- component tests for empty/loading/error/success/busy/disabled states;
- browser interaction tests for mouse and keyboard;
- accessibility assertions;
- responsive screenshots;
- deep-link/refresh restoration tests;
- failure and retry tests;
- large-data performance tests where collections can grow;
- authorization and destructive-action tests where applicable.

Critical end-to-end journeys:

1. Login, open Studio, create project, and create Flow.
2. Add instruction, create subflow, edit Nodes, configure Router, and save.
3. Configure provider/key/settings, verify readiness, and run Flow.
4. Open previous run, inspect ordered actions and state, export audit.
5. Review/apply or reject an adaptation.
6. Record optional evidence, inspect timeline/state, and return to Flow.
7. Add, reveal, rotate, and delete a secret with correct risk-tier auth.
8. Browse a sensitive database store with an expiring authorization grant.
9. Complete all above at 1280x720 and navigate representative tasks at 390x844.

## Rollout Rules

- Do not restyle every view at once behind a single untestable branch.
- Migrate one shared primitive or complete workflow at a time.
- Keep compatibility adapters at data boundaries, not duplicate visible UIs.
- Feature flags are acceptable for shell/workspace migrations but must have a removal date and persisted-preference migration.
- Every completed step updates this document before the next step begins.
- Each phase records before/after screenshots and performance numbers.
- Do not declare a phase complete from static markup tests alone.

## Dependencies And Related Documents

- `docs/working/automation-studio-strict-workspace-layout-plan.md`: authoritative direction for fixed workspace regions and removal of freeform windows.
- `docs/working/automation-studio-load-performance-plan.md`: authoritative summary/detail, SQL pagination, lazy loading, and performance work.
- `docs/working/flow-initialization-router-ui-plan.md`: Flow, Router, subflow, instruction, settings, and hierarchy product contracts.
- `docs/working/llm-assisted-deterministic-automation-expansion-plan.md`: runtime, instruction scope, adaptation, and approval behavior.
- `docs/architecture/automation-studio/workspace.md`: authored stable workspace contract that must be updated as phases land.

Where older implementation notes conflict with this audit, preserve the current product decisions: Flow click targets Router, subflow click targets Nodes, Router is top-level only, Adaptations replace Proposals in normal UI, State is a global reusable view, and recordings are optional evidence.

## Audit Completion Checklist

- [x] Inventory routes, views, shared components, and stylesheet.
- [x] Audit Automation Studio information architecture and primary workflows.
- [x] Audit global programs and privileged workflows.
- [x] Audit responsive sizing and scroll ownership from source.
- [x] Audit keyboard and ARIA implementation from source.
- [x] Audit loading boundaries and growable collections from source.
- [x] Audit test strategy and browser-test gaps.
- [x] Define severity-ranked findings and target behavior.
- [x] Define phased implementation and acceptance criteria.
- [ ] Capture browser baseline screenshots and measured task/performance data.
- [x] Begin Phase 0 implementation ledger.

## Implementation Ledger

### 2026-08-26 - Granular Phase 0.1: Playwright Browser Harness

**Status:** Completed.

**Plan reference:** Granular Phase 0, step 0.1. This establishes the browser-level verification layer required by every later UI phase.

**Files changed:**

- `apps/web/playwright.config.ts`
- `apps/web/e2e/smoke.spec.ts`
- `apps/web/package.json`
- `pnpm-lock.yaml`
- `.gitignore`
- this working document

**Behavior delivered:**

- Added an externally targeted Playwright harness using `FLUXIQ_E2E_BASE_URL`, defaulting to `http://127.0.0.1:3000`.
- Added stable desktop (`1440x900`), compact (`1280x720`), and mobile (`390x844`) Chromium projects.
- Added failure-only screenshots, retained failure traces/video, CI retries, and HTML/list reporting.
- Added an entry-shell smoke test that verifies successful navigation, rendered body content, and absence of page-level horizontal overflow.
- Added `test:e2e`, `test:e2e:headed`, and `test:e2e:report` package commands.
- Ignored generated Playwright reports and test results.

**Validation:**

- `pnpm --filter @fluxiq/web exec playwright --version` passed with Playwright `1.62.1`.
- `pnpm --filter @fluxiq/web test:e2e -- --list` passed and discovered three viewport tests.
- `pnpm --filter @fluxiq/web check` passed.
- The browser smoke test was intentionally not executed because repository instructions prohibit launching the web panel for the user. It runs against a panel the developer starts manually with `pnpm --filter @fluxiq/web dev`.

**Evidence and remaining work:**

- Harness and viewport discovery are verified.
- Screenshots, accessibility output, and measured runtime data begin in steps 0.3 through 0.5 after deterministic fixtures are available.
- Next plan step: Granular Phase 0, step 0.2, deterministic seeded UI fixtures.

### 2026-08-26 - Granular Phase 0.2: Surface-State Capture Matrix

**Status:** Completed.

**Plan reference:** Granular Phase 0, step 0.2. This step defines reproducible default, empty, loading, error, and narrow capture paths before visual implementation begins.

**Files changed:**

- `apps/web/e2e/support/seed-fixtures.mjs`
- `apps/web/e2e/support/app-fixture.ts`
- `apps/web/e2e/baseline.spec.ts`
- `apps/web/e2e/surface-matrix.spec.ts`
- `apps/web/e2e/README.md`
- `apps/web/package.json`
- `.gitignore`
- this working document

**Behavior delivered:**

- Added a guarded fixture host reset that refuses to delete any directory without the FluxIQ E2E ownership marker.
- Initialized the real FluxIQ v2 storage layout and seeded data through `AutomationStudioService`, rather than mocking browser responses for normal states.
- Added empty, representative, and scale projects plus a machine-readable fixture manifest with generated project IDs.
- Representative data includes 2 flows, 8 subflows, 12 instructions, 36 runs, and 16 adaptations.
- Baseline scale data includes 6 flows, 48 subflows, 60 instructions, 144 runs, and 60 adaptations.
- Added authenticated browser helpers and capture cases for login, launcher, project browser, browser loading/error, empty project, and representative project.
- Added default captures for all nine global programs and all eighteen currently exposed Automation Studio inner views.
- Every capture runs at desktop, compact, and mobile viewport widths; Playwright currently discovers 54 browser tests.
- Added manual fixture, server, capture, and report instructions.

**Validation and evidence:**

- `pnpm --filter @fluxiq/web fixture:e2e` passed and persisted the expected manifest counts.
- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter @fluxiq/web test:e2e -- --list` passed with 54 tests in 3 files.
- A first 1,280-run stress seed was stopped after exceeding 150 seconds because per-run index persistence amplified setup time. Baseline scale was right-sized above current pagination thresholds; the extreme fixture moves to step 0.3.
- Screenshot execution remains pending until a developer manually starts the web panel, as required by repository instructions. Missing view-specific loading or error presentations encountered during execution are defects to catalog in step 0.6, not reasons to invent fake production states.

**Next plan step:** Granular Phase 0, step 0.3, dedicated stress fixtures for hierarchy, graph, run, timeline, database, and documentation surfaces.

### 2026-08-26 - Granular Phase 0.3: Dedicated Stress Fixtures

**Status:** Completed.

**Plan reference:** Granular Phase 0, step 0.3. Stress data is isolated in the scale project and global program stores so ordinary baseline tests remain representative.

**Files changed:**

- `apps/web/e2e/support/seed-fixtures.mjs`
- `apps/web/e2e/support/verify-fixtures.mjs`
- `apps/web/e2e/README.md`
- `apps/web/package.json`
- this working document

**Behavior delivered:**

- Hierarchy fixture: 180 nested custom folders across 15 branches and 12 levels.
- Graph fixture: 180 positioned nodes and 179 connecting edges on the first scale Flow.
- Run fixture: 144 persisted run details across six Flows, with 24 summaries on each Flow for SQL-level pagination checks.
- Timeline fixture: one finalized 600-action recording with deterministic successes and failures.
- Database fixture: 600 persisted SQLite records across `compute.nodes`, `deployment.targets`, and `production.targets`.
- Documentation fixture: 240 authored Markdown pages across 12 sections; rebuilding also indexes ten generated framework pages for 250 total.
- Added `fixture:e2e:verify`, which creates a fresh FluxIQ runtime and verifies every persisted dataset through public service reads.
- Kept destructive fixture reset guarded by the ownership marker and confined to the configured fixture root.

**Validation and measurements:**

- `pnpm --filter @fluxiq/web fixture:e2e` passed; the full real-storage seed completed in about 70 seconds.
- `pnpm --filter @fluxiq/web fixture:e2e:verify` passed with 180 graph nodes, 180 hierarchy folders, 24 sampled Flow runs, 600 timeline entries, 600 database records, and 250 documentation pages.
- `pnpm --filter @fluxiq/web check` passed.
- The earlier 1,280-run experiment exceeded 150 seconds and was stopped. That result is retained as evidence of write amplification and informs the performance investigation in step 0.4.

**Next plan step:** Granular Phase 0, step 0.4, task timing, payload, long-task, and render-count instrumentation.

### 2026-08-26 - Granular Phase 0.4: Performance Measurement Instrumentation

**Status:** Completed.

**Plan reference:** Granular Phase 0, step 0.4. The browser suite can now produce comparable timing and workload artifacts before and after each UI phase.

**Files changed:**

- `apps/web/src/features/programs/ui-performance.ts`
- `apps/web/src/features/programs/ProgramLiveViews.tsx`
- `apps/web/src/features/automation-studio/AutomationStudioLive.tsx`
- `apps/web/e2e/support/performance.ts`
- `apps/web/e2e/performance-baseline.spec.ts`
- this working document

**Behavior delivered:**

- Added development-only render-count events at the live-program boundary and inside Automation Studio.
- Added pre-navigation browser collection for program API latency, response byte estimates, long tasks, render events, navigation timing, resource counts/bytes, and DOM node count.
- Added reusable interaction timing and JSON artifact writers.
- Added scale-project measurements for project open, first Flow selection, and Runtime Debug open.
- Added cross-program navigation measurements for Database Manager, Documentation, Identity & Access, and Production Runner.
- Performance tests run at all three viewport projects and write isolated JSON artifacts under Playwright test results.
- Existing production builds do not dispatch render events.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter @fluxiq/web test -- program-api.test.ts` passed with 2 tests.
- Playwright discovery passed with the performance suite included, increasing the browser matrix to 60 tests.
- Live timing artifacts were not generated because repository instructions prohibit starting the web panel. The collector is ready for a manually started fixture-backed panel.

**Known baseline evidence:**

- Real-storage fixture setup exposed run-index write amplification: 1,280 run details exceeded 150 seconds; the complete right-sized stress fixture takes about 70 seconds.
- This is a persistence/setup measurement, not yet a browser interaction measurement.

**Next plan step:** Granular Phase 0, step 0.5, axe, keyboard, zoom, and reduced-motion audits.

### 2026-08-26 - Granular Phase 0.5: Accessibility And Resilience Baselines

**Status:** Implementation completed; live artifact execution pending manual panel startup.

**Plan reference:** Granular Phase 0, step 0.5. The required audits are now reproducible at every supported baseline viewport.

**Files changed:**

- `apps/web/e2e/accessibility-baseline.spec.ts`
- `apps/web/package.json`
- `pnpm-lock.yaml`
- this working document

**Behavior delivered:**

- Added `@axe-core/playwright` and structured axe result artifacts for the launcher and scale Automation Studio project.
- Added a 45-step keyboard focus-order capture for the representative Studio project.
- Added 200 percent zoom inspection with document dimensions and up to 200 concrete overflowing elements.
- Added reduced-motion emulation and collection of elements retaining transitions or animations.
- All collectors execute against desktop, compact, and mobile Chromium projects.
- Baseline collectors intentionally preserve violations as evidence instead of requiring a falsely clean initial audit.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter @fluxiq/web test:e2e -- --list` passed with 72 tests in 5 files.
- Live axe, keyboard, zoom, and motion artifacts were not generated because repository instructions prohibit starting the web panel. Run instructions are in `apps/web/e2e/README.md`.

**Next plan step:** Granular Phase 0, step 0.6, stable baseline defect IDs and evidence references.

### 2026-08-26 - Granular Phase 0.6: Baseline Defect Register

**Status:** Completed from source and fixture evidence; browser-generated screenshot links activate after the manually started suite is run.

**Plan reference:** Granular Phase 0, step 0.6. These IDs are the stable closure units for all later UI phases.

| Defect ID | Priority | Problem and current evidence | Reproduction / artifact | Destination | Closure target |
| --- | --- | --- | --- | --- | --- |
| UI-P0-001 | P0 | Competing scroll owners and fixed viewport sizing. `globals.css` contains 546 overflow/minimum-size matches, including repeated `100vh` and large minimum widths. | All surface captures; `zoom-200-baseline.json` | 2, 3, 4, 6-19 | One intentional page/pane scroll owner; all critical actions reachable at 320x568 and 200% zoom. |
| UI-P0-002 | P0 | Native dialogs interrupt edit, recording, settings, adaptation, and navigation workflows. Source audit found 31 `window.prompt/confirm/alert` call sites. | Keyboard suite plus dialog workflows | 3, 4, 6, 11, 12, 16, 17 | No native dialog calls in user workflows; focus-trapped shared dialogs return focus correctly. |
| UI-P0-003 | P0 | Automation Studio owns broad unrelated state in one component and can rerender all open views. | `studio-scale-performance.json`; render metrics | 5 | Domain hooks/stores isolate graph, hierarchy, runtime, state, and layout updates. |
| UI-P0-004 | P0 | Hierarchy traversal repeatedly filters the full node list per recursive node and delays normal selection by 220ms. | 180-folder scale fixture; interaction metrics | 5, 6 | Indexed child/ancestor maps; selection feedback begins within 100ms without a click timer. |
| UI-P0-005 | P0 | Run detail hydrates full detail, then pages actions locally; JSON/audit serialization occurs on the main thread. | 144-run fixture; Runtime Debug capture | 13, 14 | SQL-paged action/effect/audit endpoints; overview <=250KB; detail JSON loaded on demand. |
| UI-P0-006 | P0 | Gateway and client views poll on fixed 1.5/2.5 second intervals without complete visibility/backoff ownership. | API metric artifact | 5, 16 | Hidden documents pause refresh; backoff/event updates prevent idle polling churn. |
| UI-P0-007 | P0 | Large global-program collections and data grids can render or stringify complete result sets. | 600-record SQL fixture; global performance artifact | 18, 19 | Server sorting/filtering/pagination and <=100 default interactive rows. |
| UI-P1-001 | P1 | Global CSS is a chronological patch layer instead of an owned token/primitive system. | Surface matrix | 2, 3 | Tokens and primitives own new styling; feature CSS is colocated; focus/state behavior is consistent. |
| UI-P1-002 | P1 | Program launcher and technical capability tabs prioritize framework inventory over user tasks. | Program launcher/global surface captures | 4 | Searchable compact launcher; technical details demoted; consistent shell/breadcrumbs. |
| UI-P1-003 | P1 | Project browser/tree lacks tree semantics, roving focus, arrow navigation, and full-width stable labels. | Keyboard artifact; 180-folder fixture | 6 | Accessible tree semantics and keyboard model; one unmistakable selected object. |
| UI-P1-004 | P1 | Workspace retains freeform geometry, z-index, snapping, invisible resize edges, and scrollbar-led tab overflow. | Studio inner-view matrix | 7 | Strict pane layout, keyboard splitters, overflow menu/chevrons, narrow single-view composition. |
| UI-P1-005 | P1 | Graph editing lacks complete keyboard creation/navigation, persistent validation, and contained state ownership. | 180-node graph fixture | 8 | Keyboard-complete toolbar/palette/editor, explicit save state, linked Problems, bounded renders. |
| UI-P1-006 | P1 | Router rows are width-heavy, condition summaries hide nested logic, and stale style generations coexist. | Router view captures | 9 | Canonical ordered route editor, visual condition builder, target search, pinned fallback, no stale CSS. |
| UI-P1-007 | P1 | Subflow directory/container/scoped-object distinctions are not consistently explained or navigated. | Representative/scale hierarchy | 10 | Directory links to Nodes; scoped breadcrumbs and typed mapping/object pickers. |
| UI-P1-008 | P1 | Instructions expose technical precedence, weak readiness guidance, and prompt-based authorization. | Instructions capture | 11 | Friendly library/editor, templates, effective-order preview, local drafts, shared authorization. |
| UI-P1-009 | P1 | Settings combine too many concerns and expose IDs/string lists without inheritance or impact clarity. | Settings capture | 12 | Sectioned forms, effective/inherited values, supported object pickers, sticky validated save/discard. |
| UI-P1-010 | P1 | Runtime Debug and Runs duplicate history; run detail stacks every concern and expands JSON in scanning rows. | 144-run fixture; Runtime Debug/Run captures | 13, 14 | One shared history, bottom pagination, inner detail views, action drawer, structured JSON viewer. |
| UI-P1-011 | P1 | State View carries dense overlay collision and large raw/structured data risks. | State capture; zoom artifact | 15 | Accessible view tabs, collision-safe visual layer, searchable/paged structured state, opt-in raw data. |
| UI-P1-012 | P1 | Recording/timeline/client workflows are prompt-heavy, pointer-heavy, polling-heavy, and retain obsolete proposal language. | 600-entry timeline fixture | 16 | Paged recording list, keyboard timeline, shared pairing/dialog flows, evidence-oriented language. |
| UI-P1-013 | P1 | Adaptations coexist with proposal/change-proposal navigation and prompt-based review. | Adaptations/Proposal captures | 17 | Adaptations are canonical; legacy compatibility is labelled and cannot invoke obsolete workflows. |
| UI-P1-014 | P1 | Login, identity, secrets, and sensitive data workflows have inconsistent credential burden and reveal behavior. | Auth/global surface and axe artifacts | 4, 18 | Staged authentication, minimum credential policy, focused key modal, time-bound reveal, shared grants. |
| UI-P1-015 | P1 | Keyboard, zoom, motion, and axe compliance have no existing enforced browser baseline. | `axe-baseline.json`, `keyboard-focus-baseline.json`, `zoom-200-baseline.json`, `reduced-motion-baseline.json` | 2-19 | No critical axe violations; keyboard completion; 200% reflow; reduced-motion compliance. |

**Evidence contract:**

- Screenshot and JSON artifacts are produced under `apps/web/test-results/playwright/<project>/<test>/`.
- `baseline.spec.ts` owns shell/default/empty/loading/error images.
- `surface-matrix.spec.ts` owns all global-program and Studio inner-view default images.
- `performance-baseline.spec.ts` owns timing, payload, long-task, DOM, and render evidence.
- `accessibility-baseline.spec.ts` owns axe, keyboard, zoom, and reduced-motion evidence.
- Source evidence above remains valid before browser execution and is linked to exact remediation phases.
- A later step closes a defect only by updating this register entry or adding a closure ledger reference with passing browser evidence.

**Validation:**

- Phase 0 browser discovery: 72 tests in 5 files across desktop, compact, and mobile Chromium.
- Fixture verifier: 180 graph nodes, 180 hierarchy folders, 24 sampled Flow runs, 600 timeline entries, 600 SQL records, and 250 documentation pages.
- Browser screenshots and JSON outputs remain pending the repository-required manual panel start.

**Next plan step:** Granular Phase 1, step 1.1, canonical Runs versus Runtime Debug relationship.

### 2026-08-26 - Granular Phase 1.1: Canonical Runtime Debug Ownership

**Status:** Completed.

**Decision:** Runtime Debug is the only normal user-facing run surface. It owns run controls, live status, previous-run history, run-detail navigation, and audit export. The former Runs object is compatibility input only.

**Implementation:**

- Removed generated Runs folders and run children from new Flow/subflow hierarchy models.
- Removed Runs from the inner-view picker and baseline surface matrix.
- Redirected legacy run-object opens to `runtime-debug`.
- Migrated persisted `runs-history` tabs and active-view IDs to `runtime-debug` during workspace normalization.
- Kept the legacy Runs renderer isolated for old data paths while preventing new normal navigation to it.
- Updated the stable Automation Studio workspace contract.

**Files changed:**

- `apps/web/src/features/automation-studio/hierarchy/model.ts`
- `apps/web/src/features/automation-studio/hierarchy/ProjectTree.tsx`
- `apps/web/src/features/automation-studio/workspace/components.tsx`
- `apps/web/src/features/automation-studio/workspace/layout.ts`
- `apps/web/src/features/automation-studio/AutomationStudioLive.tsx`
- related hierarchy/workspace tests
- `apps/web/e2e/surface-matrix.spec.ts`
- `docs/architecture/automation-studio/workspace.md`
- this working document

**Validation:**

- Focused hierarchy, ProjectTree, and workspace migration tests passed: 29 tests.
- `pnpm --filter @fluxiq/web check` passed.
- Legacy workspace migration has an explicit regression test.

**Defect impact:** Resolves the navigation-duplication portion of `UI-P1-010`; run-detail architecture remains open for Phases 13 and 14.

**Next plan step:** Granular Phase 1, step 1.2, Proposal Generator and Proposal Workbench compatibility retirement.

### 2026-08-26 - Granular Phase 1.2: Proposal Surface Compatibility Retirement

**Status:** Completed.

**Decision:** Adaptations are the only normal user-facing runtime change concept. Recording-driven Proposal Generator and Proposal Workbench views are retired from ordinary navigation.

**Implementation:**

- Removed Proposal Generator and Proposal Workbench from the Add Tab picker and baseline normal-surface matrix.
- Removed Open Existing Proposal and Generate Proposal actions from Timeline.
- Reworded recording completion states around optional Flow evidence.
- Retained persisted proposal tabs with explicit Legacy labels.
- Made Proposal Generator compatibility tabs explanatory and non-interactive.
- Made Proposal Workbench compatibility tabs read-only: mutation controls are hidden and graph edits are blocked.
- Preserved backend artifacts and rendering only so old stored data remains inspectable.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- Focused proposal, hierarchy, and workspace tests passed: 24 tests.
- Added regression assertions that read-only proposal compatibility markup contains no approval or direct-generation actions.

**Defect impact:** Closes normal-navigation and mutation portions of `UI-P1-013`; Adaptation detail redesign remains in Phase 17.

**Next plan step:** Granular Phase 1, step 1.3, Workspace Dock retirement/reduction.

### 2026-08-26 - Granular Phase 1.3: Workspace Dock Retirement

**Status:** Completed.

**Decision:** Workspace Dock is retired as a user-openable view. Inspector, Problems, and State keep direct ownership of their jobs. Recording Action Preview is the only real bottom dock.

**Implementation:**

- Removed Workspace Dock from the Add Tab inventory, normal view instances, and baseline surface matrix.
- Removed `workspace-dock` from right-sidebar routing.
- Migrated persisted Workspace Dock tabs and active-view IDs to `global-inspector` before region filtering.
- Retained inert legacy view-state handling so old preferences can be read without data loss.
- Updated the stable Automation Studio workspace contract with the reduced dock model.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- Focused workspace layout suite passed: 12 tests.
- The migration regression fixture confirms a persisted Workspace Dock becomes the Inspector.

**Defect impact:** Reduces duplicate workspace chrome tracked by `UI-P1-004`; strict pane and tab-overflow redesign remains in Phase 7.

**Next plan step:** Granular Phase 1, step 1.4, define AI Assistant jobs or remove it until functional.
### 2026-08-26 - Granular Phase 1.4: AI Assistant Scope

**Status:** Completed.

**Decision:** Remove AI Assistant from normal UI until it performs a real, distinct LLM-backed job. A contextual echo and inert proposal copy are not user functionality.

**Implementation:**

- Audited the Assistant and confirmed it made no API or LLM request, persisted no result, and produced no Adaptation.
- Removed AI Assistant from normal view instances, the Add Tab inventory, right-sidebar routing, and the baseline surface matrix.
- Migrated persisted `ai-assistant` sidebar tabs and active-view IDs to Inspector.
- Kept the legacy renderer isolated for compatibility cleanup in a later code-removal phase.
- Defined the return gate in stable docs: a real assistant must have an LLM-backed job, evidence contract, and Adaptation handoff.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- Focused workspace layout suite passed: 13 tests.
- Added explicit persisted Assistant-to-Inspector migration coverage.

**Defect impact:** Removes a misleading nonfunctional surface from `UI-P1-002` and reduces right-sidebar complexity in `UI-P1-004`.

**Next plan step:** Granular Phase 1, step 1.5, Signals Relationship Web ownership and job.
### 2026-08-26 - Granular Phase 1.5: Signal And State Ownership

**Status:** Completed.

**Decision:** State View owns signal registries, snapshots, visual state, and structured state inspection. The standalone Signals Relationship Web is retired because it was a registry list, not a relationship-analysis tool.

**Implementation:**

- Removed Relationship Web from normal view instances, Add Tab inventory, and the baseline surface matrix.
- Routed signal selections directly to State View.
- Migrated persisted `signals-web` tabs and active views to `state-explorer`.
- Retained the old renderer only as isolated compatibility code for later cleanup.
- Added the ownership and future return gate to stable workspace documentation.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- Focused workspace layout suite passed: 14 tests.
- Added explicit persisted Relationship-Web-to-State-View migration coverage.

**Defect impact:** Simplifies the dense state surface scope in `UI-P1-011` and reduces duplicate workspace navigation in `UI-P1-004`.

**Next plan step:** Granular Phase 1, step 1.6, move technical capability tabs out of primary program navigation.
### 2026-08-26 - Granular Phase 1.6: Secondary Technical Details

**Status:** Completed.

**Decision:** Global programs are task-first. API, Storage, and Runtime capability inventories are secondary technical details, not equal-weight primary navigation.

**Implementation:**

- Removed Main/API/Storage/Runtime tabs from the global program topbar.
- Kept each program's working view continuously mounted as its primary surface.
- Added a wrench-labelled Technical Details command and contained right-side drawer.
- Added API, Storage, and Runtime tabs inside the drawer with a scrollable narrow-screen layout.
- Added close-button, backdrop, and Escape dismissal.
- Removed stale retired Proposal Generator, Proposal, and Runs entries from the normal Studio surface matrix.
- Updated the stable global program layout contract.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- Playwright discovery passed with 75 tests across desktop, compact, and mobile Chromium.
- Added a browser regression asserting capability tabs are absent from the topbar, available in the drawer, switchable, and Escape-dismissible.
- Live browser execution remains pending the repository-required manual panel start.

**Defect impact:** Completes the technical-tab demotion portion of `UI-P1-002`; launcher and shared-shell visual redesign remain in Phase 4.

**Next plan step:** Granular Phase 1, step 1.7, canonical project/Flow/subflow/view/detail deep links.
### 2026-08-26 - Granular Phase 1.7: Canonical Studio Deep Links

**Status:** Completed.

**Decision:** Canonical Studio URLs use `project`, parent `flow`, optional child `subflow`, canonical `view`, and typed `detail=<kind>:<id>`. Supported detail kinds are run, adaptation, recording, node, and state.

**Implementation:**

- Added a typed parser and serializer in `automation-studio/navigation.ts`.
- Enforced parent scope: Flow requires project; subflow requires project and Flow; view/detail require project.
- Whitelisted visible canonical views and typed detail kinds.
- Normalized compatibility view IDs through the shared workspace migration map.
- Preserved unrelated query parameters while removing stale Studio descendants on project switch/close.
- Wired current project URL reads and writes through the canonical helper.
- Documented the exact query contract in the stable workspace architecture.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- Deep-link and workspace migration suites passed: 18 tests.
- Tests cover complete parsing, legacy normalization, orphan cleanup, unrelated query preservation, and malformed-value rejection.

**Ownership boundary:** Step 6.6 will restore Flow/subflow/tree selection from this schema. Runtime, Adaptations, Docs, Settings, and paginated views will add their own filter/page detail state in their owning phases.

**Defect impact:** Establishes the URL ownership needed by `UI-P1-003`, `UI-P1-010`, and the global deep-link requirements without coupling feature-specific pagination to the shell.

**Next plan step:** Granular Phase 2, step 2.1, semantic color and contrast tokens.
### 2026-08-26 - Granular Phase 2.1: Semantic Color And Contrast

**Status:** Completed.

**Implementation:**

- Expanded the public `fluxiqConsoleTheme` with semantic canvas, surface, content, interaction, selection, status, code, and overlay tokens.
- Raised subtle text, strong borders, status foregrounds, and the orange focus indicator to contrast-safe values.
- Added matching web CSS variables plus explicit legacy aliases for `--color-bg` and `--color-accent`.
- Migrated repeated selected, success, warning, and danger literals to semantic variables.
- Reduced literal color occurrences in `globals.css` from 402 to 332; remaining feature-specific colors move during their owning view phases.
- Added the semantic ownership and no-new-literal rule to stable UI theme documentation.

**Validation:**

- Public theme contrast suite passed: 10 tests.
- Every canonical normal-text pair is at least 4.5:1; focus is at least 3:1 against the light surface.
- `pnpm --filter fluxiq check` passed.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Establishes the color and contrast foundation for `UI-P1-001` and `UI-P1-015`.

**Next plan step:** Granular Phase 2, step 2.2, type scale and dense operational text rules.
### 2026-08-26 - Granular Phase 2.2: Operational Typography

**Status:** Completed.

**Implementation:**

- Added a public 11-28px caption-to-display type scale, three line-height roles, and four weight roles to `fluxiqConsoleTheme`.
- Added matching web variables and shared sans/mono family ownership.
- Migrated repeated stylesheet sizes and weights to tokens.
- Raised all former 10px content to the 11px caption floor.
- Reduced 800/900 and intermediate ad hoc weights to the supported semibold/bold roles.
- Normalized letter spacing to zero and kept viewport-unit type prohibited.
- Kept container-fitted State labels, but enforced the 11px minimum.
- Added stable documentation describing where each scale role belongs.

**Validation:**

- Public theme suite passed: 11 tests, including ordered 11-28px scale bounds.
- Web typography contract passed: 2 tests covering minimum literals, neutral letter spacing, and no viewport-scaled type.
- `pnpm --filter fluxiq check` passed.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Establishes typography ownership for `UI-P1-001`, improves zoom/readability groundwork for `UI-P1-015`, and supports dense Runtime/Studio rows without undersized text.

**Next plan step:** Granular Phase 2, step 2.3, spacing, control height, radius, border, elevation, and focus tokens.
### 2026-08-26 - Granular Phase 2.3: Geometry, Elevation, And Focus

**Status:** Completed.

**Implementation:**

- Expanded `fluxiqConsoleTheme` with 2-32px spacing, compact/default/comfortable control sizes, bounded radii, border widths, three elevation levels, and focus-ring geometry.
- Added matching web variables.
- Migrated repeated gap, padding, and literal radius declarations to supported roles.
- Mapped shared buttons and icon controls to canonical sizes and borders.
- Mapped repeated popover/modal shadows to named elevations.
- Added a visible baseline `:focus-visible` ring for links, buttons, fields, selects, textareas, and explicit tab stops.
- Added stable usage rules for toolbars, forms, framed tools, and focus overrides.

**Validation:**

- Public theme suite passed: 12 tests.
- Web geometry and typography contracts passed: 4 tests.
- `pnpm --filter fluxiq check` passed.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Establishes shared primitive geometry and keyboard-focus foundations for `UI-P1-001`, `UI-P1-004`, and `UI-P1-015`.

**Next plan step:** Granular Phase 2, step 2.4, status vocabulary and icon/color mapping.
### 2026-08-26 - Granular Phase 2.4: Status Vocabulary

**Status:** Completed.

**Implementation:**

- Added public status normalization, tone, and sentence-case label helpers to `fluxiq/ui`.
- Defined canonical neutral, info, success, warning, and danger vocabularies, including runtime, approval, connectivity, and risk states.
- Rebuilt `StatusBadge` around semantic tone classes instead of raw backend-value classes.
- Added Circle, Info, Check, Warning, and Error icons so status is not color-only.
- Preserved the original raw value only as a tooltip for technical inspection.
- Removed stale special-case LLM/custom badge CSS.
- Documented status-to-tone ownership in the stable theme contract.

**Validation:**

- Framework theme/status suite passed: 13 tests.
- Shared UI rendered-state suite passed: 3 tests.
- `pnpm --filter fluxiq check` passed.
- `pnpm --filter fluxiq build` passed and validated the public runtime export.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Standardizes status semantics for `UI-P1-001`, prevents color-only status in `UI-P1-015`, and gives Runtime, Adaptations, Clients, and global programs one vocabulary.

**Next plan step:** Granular Phase 2, step 2.5, light surface hierarchy for shell, pane, tool, selected, and code content.
### 2026-08-26 - Granular Phase 2.5: Surface Hierarchy

**Status:** Completed.

**Implementation:**

- Added explicit shell, pane, tool, selected, code, and code-content role aliases.
- Assigned Automation Studio frame, sidebar, workspace panes, and pane headers to their owned roles.
- Migrated repeated subtle and selected surfaces to role aliases.
- Consolidated JSON editor, source, documentation code, state technical content, and Runtime JSON onto the canonical code pair.
- Removed five duplicate dark technical background literals and their duplicate foreground literals.
- Documented the no-nested-card and restrained-elevation hierarchy rules.

**Validation:**

- Surface hierarchy and geometry suites passed: 4 tests.
- Tests assert role presence, Studio shell/pane assignments, and removal of duplicate dark code backgrounds.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Establishes coherent visual depth for `UI-P1-001`, reduces one-note pane/card styling, and prepares Runtime/State JSON redesigns in Phases 14 and 15.

**Next plan step:** Granular Phase 2, step 2.6, motion/reduced-motion and z-index layer contracts.
### 2026-08-26 - Granular Phase 2.6: Motion And Layers

**Status:** Completed.

**Implementation:**

- Added public fast, normal, and activity motion durations plus standard easing.
- Added bounded base, raised, sticky, dropdown, overlay, modal, toast, and critical layers with a maximum value of 130.
- Added matching web variables and migrated all extreme z-index declarations, including prior two-billion modal stacks.
- Tokenized shared transitions and loading/spinner activities.
- Added a global `prefers-reduced-motion: reduce` fallback that preserves final state while collapsing movement.
- Documented motion-purpose, reduction, and layer-ownership rules.

**Validation:**

- Framework theme suite passed: 14 tests.
- Web motion/layer and surface suites passed: 4 tests.
- No numeric z-index in the stylesheet exceeds 130.
- `pnpm --filter fluxiq check` passed.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Completes the visual-language foundation for `UI-P1-001` and provides enforceable reduced-motion/layer behavior for `UI-P1-004` and `UI-P1-015`.

**Next plan step:** Granular Phase 3, step 3.1, buttons and links.
### 2026-08-26 - Granular Phase 3.1: Buttons And Links

**Status:** Completed.

**Implementation:**

- Added typed shared `Button`, `IconButton`, and `ActionLink` primitives.
- Added secondary, primary, danger, and ghost command variants plus compact/default sizing.
- Added busy semantics with `aria-busy`, repeat-prevention, retained labels, and activity icon.
- Required accessible label/tooltip ownership for icon-only commands.
- Consolidated hover, active, disabled, busy, danger, primary, ghost, and link states into one CSS block.
- Migrated shared modal close from a text rectangle to the familiar close icon primitive.
- Documented semantic button-versus-link ownership and incremental feature migration.

**Validation:**

- Shared rendered UI and geometry suites passed: 6 tests.
- Tests cover variant classes, busy/disabled semantics, icon accessible name/tooltip, link semantics, status, and modal behavior.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Provides the reusable command foundation for `UI-P1-001` and keyboard/label behavior required by `UI-P1-015`; feature call sites migrate in their owning phases.

**Next plan step:** Granular Phase 3, step 3.2, form fields and validation.
### 2026-08-26 - Granular Phase 3.2: Fields And Validation

**Status:** Completed.

**Implementation:**

- Expanded shared `Field` with stable/generated control IDs, visible required markers, hint text, error text, and validation state.
- Automatically connected hints/errors with merged `aria-describedby`.
- Added `aria-required`, `aria-invalid`, announced error role, and error icon semantics.
- Added shared comfortable input/select/textarea geometry, disabled state, validation border, hint, and error styling.
- Preserved existing simple Field call sites while enabling richer validation incrementally.
- Documented field-local validation versus global completed-action feedback ownership.

**Validation:**

- Shared UI suite passed: 5 rendered tests.
- Field regression covers label/control association, hint and error IDs, required/invalid ARIA, and announced errors.
- `pnpm --filter @fluxiq/web check` passed with exact optional-property typing.

**Defect impact:** Establishes the form foundation for `UI-P1-001`, `UI-P1-008`, `UI-P1-009`, `UI-P1-014`, and accessible validation in `UI-P1-015`.

**Next plan step:** Granular Phase 3, step 3.3, menus, tooltips, comboboxes, and segmented controls.
### 2026-08-26 - Granular Phase 3.3: Choice And Disclosure Controls

**Status:** Completed.

**Plan reference:** Granular Phase 3, step 3.3, menus, tooltips, comboboxes, and segmented controls.

**Implementation:**

- Added a typed action Menu with disclosure semantics, disabled/danger states, focus entry, arrow navigation, Home/End navigation, Escape dismissal, and focus-leave dismissal.
- Added a searchable Combobox with visible labels, filtering, listbox/option semantics, active option tracking, keyboard selection, empty results, hints, errors, and selected-value restoration.
- Added supplemental Tooltip behavior that leaves the wrapped control's accessible name authoritative.
- Completed Segmented semantics with a labelled group and explicit pressed state.
- Styled all four controls with semantic surfaces, focus behavior, bounded dropdown layers, stable control geometry, and restrained operational density.
- Documented when native selects remain preferable to a searchable combobox.

**Validation:**

- Focused shared UI suite passed: 9 tests.
- Tests cover menu disclosure/action roles, combobox/listbox association and selection, tooltip/accessibility separation, segmented pressed state, and the earlier shared primitives.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Provides consistent, keyboard-operable choice and secondary-action behavior for `UI-P1-001`, `UI-P1-004`, `UI-P1-008`, `UI-P1-009`, `UI-P1-014`, and `UI-P1-015`.

**Next plan step:** Granular Phase 3, step 3.4, tabs and overflow.
### 2026-08-26 - Granular Phase 3.4: Tabs And Overflow

**Status:** Completed.

**Plan reference:** Granular Phase 3, step 3.4, tabs and overflow, including AS-SHELL-06.

**Implementation:**

- Rebuilt the canonical Automation Studio tab strip around tablist/tab/tabpanel semantics and roving tabindex.
- Added Arrow Left/Right, Home/End, Ctrl/Cmd+W, and middle-click behavior.
- Replaced the clickable close span with a real icon button carrying a tab-specific accessible name.
- Added persistent previous/next overflow controls plus a searchable open-tabs picker with explicit no-match feedback.
- Removed native scrollbar height from the strip while retaining programmatic and pointer scrolling.
- Added stable tab geometry, ellipsis for long names, full title text, selected state, bounded dropdown elevation, and a linked active panel.
- Upgraded the global program technical-detail tabs to matching roving focus and linked tabpanel semantics.

**Validation:**

- Focused workspace/shared suites passed: 10 tests.
- The workspace regression asserts tablist/tab/tabpanel relationships, roving tabindex, close labels, overflow controls, and the open-tab picker trigger.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Directly resolves the tab scrollbar and clickable-span findings in `UI-P1-004`, adds keyboard parity for `UI-P1-015`, and improves constrained workspace navigation in `UI-P0-001`.

**Next plan step:** Granular Phase 3, step 3.5, dialogs, authorization, drawers, and popovers.
### 2026-08-26 - Granular Phase 3.5: Dialogs, Authorization, Drawers, And Popovers

**Status:** Completed.

**Plan reference:** Granular Phase 3, step 3.5 and the shared foundation of `UI-P0-002`. Feature-owned native-dialog migrations remain attached to their owning phases.

**Implementation:**

- Upgraded Modal/ModalContent with deterministic title/description wiring, `aria-busy`, initial focus, focus trapping, Escape policy, background inertness, body scroll locking, and return-focus restoration.
- Added stable constrained-viewport geometry and a sticky footer so actions remain reachable.
- Added AlertDialog for named consequential/destructive confirmation with danger command styling and busy interruption policy.
- Added AuthorizationDialog with policy-selected password, PIN, and authenticator fields, local validation, numeric normalization, busy state, and action-triggered composition.
- Added left/right Drawer composition using the same labelled, modal, focus, inertness, and scroll ownership contract.
- Kept Menu as the canonical nonblocking action popover with dropdown-layer ownership and focus-leave dismissal.
- Migrated the global client-pairing overlay from its standalone dialog implementation onto the shared Modal and Button primitives.
- Preserved native-dialog occurrences in the defect inventory; they will be removed view by view in the Automation Studio and global-program phases where their action state can be modelled without losing user input.

**Validation:**

- Focused shared/workspace suites passed: 10 tests.
- Dialog regression now covers modal role, title/description relationships, busy state, custom width class, credentials, and close control.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Establishes the reusable resolution path for `UI-P0-002`, strengthens constrained viewport behavior in `UI-P0-001`, and supplies focus/keyboard ownership for `UI-P1-015`.

**Next plan step:** Granular Phase 3, step 3.6, notices, toast, loading, and progress.
### 2026-08-26 - Granular Phase 3.6: Notices, Toast, Loading, And Progress

**Status:** Completed.

**Plan reference:** Granular Phase 3, step 3.6, notices, toast, loading, and progress.

**Implementation:**

- Added InlineNotice with info/success/warning/error roles, icon-plus-text signalling, optional local action, and alert/status announcement.
- Corrected VisualAlert ownership so persistent warnings and errors render inline instead of disappearing from a transient toast.
- Retained StatusText and notifyGlobalAlert for completed/transient action feedback in the bounded global toast viewport.
- Added named LoadingState, shape-preserving Skeleton, determinate/indeterminate Progress, and action-capable EmptyState primitives.
- Added stable compact/default geometry, tabular progress values, reduced-motion-compatible activity, and semantic feedback surfaces.
- Documented the distinction between loading, loaded-empty, local warning/error, and transient result states.

**Validation:**

- Focused shared UI suite passed: 10 tests.
- Regressions cover inline error announcement, busy loading, labelled skeletons, progressbar value semantics, empty-state content, and all earlier shared controls.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Supplies consistent visible system state for `UI-P0-001`, `UI-P0-003`, `UI-P1-006`, `UI-P1-007`, `UI-P1-010`, `UI-P1-011`, `UI-P1-013`, and `UI-P1-015`.

**Next plan step:** Granular Phase 3, step 3.7, tables, lists, pagination, and trees.
### 2026-08-26 - Granular Phase 3.7: Tables, Lists, Pagination, And Trees

**Status:** Completed.

**Plan reference:** Granular Phase 3, step 3.7, tables, lists, pagination, and trees.

**Implementation:**

- Expanded DataTable with accessible label/caption, scoped headers, stable row keys, busy state, compact density, and loading-aware empty content.
- Added Pagination with result range, page/page-count announcement, page size, first/previous/next/last commands, and loading/boundary disabled states.
- Added List and ListRow so a row has one large primary open target while secondary actions remain valid sibling controls.
- Added a semantic recursive Tree with tree/treeitem/group roles, selected/expanded/disabled state, roving tabindex, and stable nesting geometry.
- Implemented Up/Down/Home/End, Left/Right collapse/parent/child movement, Enter/Space selection, explicit expand/collapse buttons, and nested click isolation.
- Added scan-friendly truncation, selected surfaces, compact table mode, tabular pagination values, and responsive minimum-width ownership.
- Documented SQL pagination and URL restoration as feature responsibilities built on the shared control.

**Validation:**

- Focused shared UI suite passed: 13 tests.
- Regressions cover table labelling/header scope, full pagination range controls, list action structure, and tree hierarchy/selection/expansion/focus semantics.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Provides the shared resolution layer for `UI-P0-001`, `UI-P0-003`, `UI-P1-003`, `UI-P1-010`, `UI-P1-011`, `UI-P1-013`, `UI-P1-014`, and `UI-P1-015`.

**Next plan step:** Granular Phase 3, step 3.8, splitters, toolbars, breadcrumb, JSON/code viewer.
### 2026-08-26 - Granular Phase 3.8: Splitters, Toolbars, Breadcrumbs, And Technical Viewers

**Status:** Completed.

**Plan reference:** Granular Phase 3, step 3.8, splitters, toolbars, breadcrumb, JSON/code viewer.

**Implementation:**

- Added labelled horizontal/vertical Toolbar behavior with constrained-width scrolling.
- Added semantic Breadcrumb links, commands, separators, current-page state, and long-context truncation.
- Added an always-visible Splitter with separator orientation/value semantics, Arrow adjustment, Shift acceleration, Home/End bounds, and Enter/double-click reset.
- Added CodeViewer with a labelled command bar, find count, wrap toggle, copy, optional download, constrained source scrolling, and semantic code styling.
- Added JsonViewer collapsed by default so hidden payloads are neither traversed nor stringified.
- Bounded disclosed JSON by depth, item count, collection width, and long string length; added circular/function/undefined handling plus explicit omission markers and performance notice.
- Documented that feature detail APIs must fetch full heavy payloads only after explicit user demand.

**Validation:**

- Focused shared UI suite passed: 16 tests.
- Regressions cover toolbar/breadcrumb labels, splitter value/orientation, collapsed JSON non-rendering, bounded JSON disclosure, source search/wrap/copy/download controls, and all prior Phase 3 primitives.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Completes the reusable foundation for `UI-P0-001`, `UI-P0-003`, `UI-P1-004`, `UI-P1-005`, `UI-P1-006`, `UI-P1-010`, `UI-P1-011`, `UI-P1-013`, and `UI-P1-015`.

**Next plan step:** Granular Phase 4, step 4.1, login and first-setup workflow.
### 2026-08-26 - Granular Phase 4.1: Login And First Setup

**Status:** Completed.

**Plan reference:** Granular Phase 4, step 4.1 and GLOBAL-01.

**Implementation:**

- Removed persistent default username/password instructions and stopped pre-filling the administrator username.
- Added password visibility, correct password-manager autocomplete, Caps Lock detection, staged TOTP entry, accessible local errors, attempts remaining, network failure, and live rate-limit countdown behavior.
- Added bootstrap-session detection to the login response and a forced first-setup password replacement step before directory navigation.
- Reused the identity-access authorized self-password rotation endpoint rather than creating a UI-only credential state.
- Enforced a 12-character minimum, temporary-password rejection, confirmation, preserved entries after failure, and local-device assurance.
- Added narrow-screen authentication reflow with dynamic viewport ownership.
- Documented the bootstrap compatibility boundary and future metadata migration path.

**Validation:**

- Login/first-setup and lockout suites passed: 4 tests.
- Tests assert password-manager fields, visibility naming, absence of published bootstrap copy, replacement validation, lockout window, and retry timing.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Resolves the login portion of `UI-P1-014`, supplies accessible staged errors for `UI-P1-015`, and removes insecure ordinary-workflow bootstrap copy.

**Next plan step:** Granular Phase 4, step 4.2, program launcher and domain directory.
### 2026-08-26 - Granular Phase 4.2: Program Launcher And Domain Directory

**Status:** Completed.

**Plan reference:** Granular Phase 4, step 4.2, GLOBAL-02, and GLOBAL-03.

**Implementation:**

- Replaced repeated global/domain program cards with one reusable compact ProgramLauncher.
- Added search across title, description, category, and domain status plus explicit no-match feedback.
- Added local recent-destination persistence, deduplication, a six-item bound, and a Recent group.
- Added Arrow Up/Down and Home/End focus movement across visible launcher rows.
- Preserved stable program/domain icons, category grouping/order, status metadata, and direct link semantics.
- Rebuilt both root and domain routes on the shared launcher and reduced introductory copy to task-level context.
- Added responsive row reflow that preserves name, icon, and navigation while hiding secondary metadata only on narrow screens.
- Documented server/catalog ownership for permissions and availability.

**Validation:**

- Focused launcher suite passed: 2 tests.
- Tests cover search, compact row composition, domains, programs, removed active card classes, and loaded-empty state.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Resolves the active card-heavy directory portion of `UI-P1-002`, improves narrow discovery for `UI-P0-001`, and supplies keyboard movement for `UI-P1-015`.

**Next plan step:** Granular Phase 4, step 4.3, global topbar, account menu, and breadcrumbs.
### 2026-08-26 - Granular Phase 4.3: Global Topbar, Account Menu, And Breadcrumbs

**Status:** Completed.

**Plan reference:** Granular Phase 4, step 4.3, GLOBAL-02 through GLOBAL-04, and AS-SHELL-02.

**Implementation:**

- Added GlobalTopbar with product-home link, optional shared Breadcrumb, contextual action slot, and authenticated account ownership.
- Rebuilt AuthStatus as an account Menu with semantic navigation to Identity and Access plus logout command.
- Extended Menu with link items while retaining command, disabled, danger, keyboard, and focus-leave behavior.
- Migrated root and domain directories onto GlobalTopbar and semantic current-page breadcrumbs.
- Migrated both standard and fullscreen program headers onto shared Breadcrumb while preserving the existing unsaved-work navigation guard.
- Added sticky shell ownership and narrow reflow that keeps product, current context, and account access while removing only secondary role/domain metadata.
- Documented global versus program-owned command responsibility.

**Validation:**

- Focused shell/shared suites passed: 19 tests.
- Regressions cover product-home labelling, breadcrumb/current-page semantics, account disclosure, linked menu items, and all shared interaction controls.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Advances `UI-P1-002`, preserves constrained-shell access for `UI-P0-001`, and adds semantic keyboard context for `UI-P1-015`.

**Next plan step:** Granular Phase 4, step 4.4, program workspace shell and Technical Details.
### 2026-08-26 - Granular Phase 4.4: Program Workspace And Technical Details

**Status:** Completed.

**Plan reference:** Granular Phase 4, step 4.4 and GLOBAL-04.

**Implementation:**

- Preserved each program's actual usable interface as the default workspace content.
- Kept framework API, Storage, and Runtime inventories behind one explicit Technical Details command.
- Replaced the custom fixed backdrop/aside/header implementation with the shared right-side Drawer.
- Inherited labelled title/description, focus trap, initial/return focus, Escape, inert background, body scroll lock, and dynamic viewport behavior.
- Preserved accessible roving category tabs and linked tabpanel ownership inside the drawer.
- Made capability content an unframed scroll-owned detail region rather than a nested panel card.
- Retained Automation Studio's specialized command bar and full-screen workspace shell.

**Validation:**

- Focused shared shell, launcher, and authentication suites passed: 21 tests.
- Existing tab regressions cover category roving focus/tabpanel semantics; shared dialog regressions cover the drawer behavior foundation.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Completes the active-shell portion of `UI-P1-002`, reduces competing primary navigation, and applies `UI-P0-002` dialog behavior to the technical drawer.

**Next plan step:** Granular Phase 4, step 4.5, global pairing dialog.
### 2026-08-26 - Granular Phase 4.5: Global Pairing Dialog

**Status:** Completed.

**Plan reference:** Granular Phase 4, step 4.5 and GLOBAL-05.

**Implementation:**

- Retained the shared Modal, labelled reference confirmation, keyboard submission, Escape policy, and return-focus behavior.
- Added stable filtering for requested, unconsumed, unexpired, nondismissed pairing records.
- Added multiple-request queue context and sequential advancement.
- Replaced optimistic request removal with server-confirmed approve/reject behavior.
- Added per-action busy state, duplicate prevention, server/network error preservation, and gateway issue feedback.
- Added live expiration countdown and bounded local dismissed-code protection.
- Replaced unconditional one-second polling with document-visibility pause, one-second pending cadence, and capped idle/failure backoff.
- Documented queue, persistence, and refresh ownership in the client gateway integration guide.

**Validation:**

- Focused pairing suite passed: 2 tests.
- Regressions cover stable active queue filtering, consumed/expired/dismissed removal, ordering, countdown rounding, and nonnegative expiry state.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Completes GLOBAL-05, resolves the standalone/polling portion of `UI-P1-012`, and reduces hidden-page background work under `UI-P0-003`.

**Next plan step:** Granular Phase 4, step 4.6, responsive page/drawer composition.
### 2026-08-26 - Granular Phase 4.6: Responsive Page And Drawer Composition

**Status:** Completed.

**Plan reference:** Granular Phase 4, step 4.6 and the global-page portion of `UI-P0-001`.

**Implementation:**

- Added dynamic viewport ownership to body and directory pages with the established viewport fallback.
- Added compact desktop, tablet, and narrow global composition contracts at 1024px, 768px, and 390px.
- Collapsed ordinary program panels, secondary grids, and field rows before content compression.
- Reduced page padding and reflowed page/panel headings for tablet widths.
- Made dialogs bottom-aligned and viewport-bounded on tablets with wrapping, growing footer actions.
- Made dialogs/drawers full-viewport sheets at narrow widths with full-width stacked commands and reflowed notice actions.
- Preserved deliberate horizontal tab/data scrolling while preventing unreachable modal footers.
- Explicitly left Automation Studio region reflow to Granular Phase 7.

**Validation:**

- Focused responsive/authentication/launcher suites passed: 8 tests.
- CSS contract asserts dynamic viewport values, all three global breakpoints, panel collapse, full-width narrow overlays, and reachable command layout.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Completes the global shell portion of `UI-P0-001` and establishes constrained overlay behavior for `UI-P0-002`.

**Next plan step:** Granular Phase 5, step 5.1, split project, hierarchy, Flow, recording, runtime, state, and layout hooks.
### 2026-08-26 - Granular Phase 5.1: Studio Controller Boundaries

**Status:** Completed.

**Plan reference:** Granular Phase 5, step 5.1 and AS-SHELL-01.

**Implementation:**

- Extracted seven explicit Automation Studio state-owner hooks for project, hierarchy, Flow, recording, runtime, state inspection, and layout concerns.
- Moved more than fifty state keys out of the live composition component without duplicating state or changing existing commands and effects.
- Moved Flow preset and run-state contracts with the Flow controller boundary.
- Added an exported ownership manifest that prevents a state key from silently belonging to multiple controllers.
- Kept `AutomationStudioLive` as the composition and cross-domain orchestration layer while preserving existing API and view call sites.
- Updated the authored workspace architecture with the controller ownership and extension rules.

**Validation:**

- Focused controller ownership suite passed: 2 tests.
- Tests assert all seven controller domains and unique ownership across more than fifty state keys.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Establishes the controller boundary required to address `UI-P0-003` request/render instability and reduces the monolithic ownership risk identified by AS-SHELL-01.

**Next plan step:** Granular Phase 5, step 5.2, explicit request-state types and stale-request cancellation.
### 2026-08-26 - Granular Phase 5.2: Request State And Stale Cancellation

**Status:** Completed.

**Plan reference:** Granular Phase 5, step 5.2 and `UI-P0-003`.

**Implementation:**

- Added explicit idle, loading, success, and error request-state contracts with start/finish timing.
- Added a latest-request registry that aborts prior work for the same ownership key and cancels all work on unmount.
- Extended the generic program API transport with optional AbortSignal support and explicit aborted responses.
- Coordinated project opening, runtime summaries, Flow metadata/details, subflow resolution, node definitions, timeline details, recording details, and proposal details.
- Replaced four independently committing runtime-summary promises with one latest-request transaction and one state commit.
- Prevented aborted and superseded requests from committing stale project or selection data.
- Updated the authored workspace architecture with request ownership and cancellation behavior.

**Validation:**

- Focused controller/request/transport suites passed: 7 tests.
- Regressions assert request phase transitions, explicit errors, stale-signal abortion, latest ownership, endpoint classification, and controller ownership.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Directly addresses `UI-P0-003`, removes the runtime list reverse-then-reload behavior caused by competing partial commits, and prevents stale project/detail responses from winning after navigation.

**Next plan step:** Granular Phase 5, step 5.3, summary/detail cache ownership and mutation invalidation.
### 2026-08-26 - Granular Phase 5.3: Summary And Detail Cache Ownership

**Status:** Completed.

**Plan reference:** Granular Phase 5, step 5.3 and `UI-P0-003`.

**Implementation:**

- Added one project-scoped cache owner with explicit summary and entity-detail scopes, bounded lifetimes, expiry, project invalidation, and unmount cleanup.
- Cached coordinated project summaries plus Flow, subflow, recording, proposal, timeline, node-definition, and Flow-metadata details.
- Added successful-mutation events to the generic program API without exposing authorization payloads.
- Expanded mutation classification to include append, apply, generate, mine, normalize, propose, reorder, set, start, and stop operations in addition to existing writes.
- Invalidated all cached entries for the owning project after successful Studio mutations.
- Added explicit invalidation for gateway recording start/stop transitions outside the program API transport.
- Removed the duplicate gateway workspace-summary loader and routed it through the coordinated summary/cache owner.
- Added latest-request cancellation to project-list and Studio-snapshot reads.
- Updated the authored workspace architecture with cache lifetimes and invalidation ownership.

**Validation:**

- Focused cache/request/transport suites passed: 7 tests.
- Cache regressions cover project isolation, summary/detail ownership, expiry, and project invalidation.
- Transport regressions cover summary/detail classification and recording mutation families used for invalidation.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Reduces repeated summary/detail reads under `UI-P0-003`, guarantees post-mutation freshness, and removes a second request path that could race the runtime summary transaction.

**Next plan step:** Granular Phase 5, step 5.4, remove broad `any` view prop bags incrementally.
### 2026-08-26 - Granular Phase 5.4: Typed View Renderer Boundary

**Status:** Completed.

**Plan reference:** Granular Phase 5, step 5.4 and AS-SHELL-01.

**Implementation:**

- Replaced the anonymous broad AutomationViewRenderer prop bag with one exported named contract.
- Derived data fields from the concrete Timeline, Flow Canvas, Runtime, Proposal, Inspector, State, Signal, Problems, and Config component prop contracts.
- Removed all explicit `any` declarations and casts from the renderer boundary.
- Reused the Flow Canvas graph-save and graph-draft callback contracts directly.
- Removed six callbacks that the renderer never consumed: open-pipeline, normalize, publish, deprecate, assisted-generation, and run-pipeline pass-throughs.
- Removed the same dead props from the sole renderer call site and cleaned obsolete imports.
- Updated the authored workspace architecture with renderer ownership and type propagation rules.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- Source audit confirms no `any` declaration/cast and none of the six dead callback names remain in Renderer.tsx.
- The compiler validates the sole renderer caller against all child-derived contracts.

**Defect impact:** Reduces cross-view contract drift in AS-SHELL-01 and makes subsequent per-view typing incremental rather than dependent on a second hand-maintained global prop shape.

**Next plan step:** Granular Phase 5, step 5.5, render/request instrumentation and budgets.
### 2026-08-26 - Granular Phase 5.5: Render And Request Budgets

**Status:** Completed.

**Plan reference:** Granular Phase 5, step 5.5, `UI-P0-003`, and the Initial budgets section.

**Implementation:**

- Added shared enforceable budgets for project open, Flow switch feedback, run-list open, long tasks, detail payload size, summary/detail request latency, scenario request count, and Studio render count.
- Added pure evaluators for individual request metrics, render metrics, and complete Automation Studio performance scenarios.
- Instrumented AutomationStudioLive render count using the existing development metric channel.
- Added request and render budget-violation events with budget name, context, actual value, limit, and unit.
- Typed Playwright API metric collection against the shared request metric contract.
- Upgraded the scale-project Playwright test from artifact-only collection to a failing budget gate with readable diagnostics.
- Preserved JSON artifact output before assertion so failures retain evidence.
- Updated authored workspace and release-checklist documentation with the exact thresholds and required evidence.

**Validation:**

- Focused budget/request/cache suites passed: 10 tests.
- Tests cover slow/oversized detail requests, runaway Studio renders, request-count overflow, long tasks, and interaction limits.
- `pnpm --filter @fluxiq/web check` passed.
- Playwright discovery passed: 6 performance tests across desktop, compact, and mobile projects.
- The browser scenarios were discovered but not executed because repository instructions prohibit starting the web panel in this work session.

**Defect impact:** Makes `UI-P0-003` measurable, converts existing telemetry into release gates, and establishes shared evidence for all later scale-focused phases.

**Next plan step:** Granular Phase 6, step 6.1, project/category browser.
### 2026-08-26 - Granular Phase 6.1: Project And Category Browser

**Status:** Completed.

**Plan reference:** Granular Phase 6, step 6.1 and AS-SHELL-01.

**Implementation:**

- Extracted the inactive-project chooser into a dedicated AutomationProjectBrowser component.
- Replaced large project cards with compact full-width rows grouped under unframed category sections.
- Added search across project name, description, and category name with result count, no-match feedback, and clear action.
- Consolidated refresh, new-category, and new-project commands into one responsive toolbar.
- Added whole-row project open behavior and labelled icon-only overflow menus for secondary project/category actions.
- Preserved category reorder, project move, category drop targeting, Uncategorized behavior, and create-in-category commands.
- Added distinct loading, no-project, empty-category, and no-match states using shared primitives.
- Added tablet and narrow command/row reflow without truncating the primary project name.
- Removed stale project-tile markup and card-grid CSS.
- Extended the shared Menu with an accessible icon-only trigger for familiar overflow actions.
- Updated authored workspace documentation to describe the row browser, search ownership, and command placement.

**Validation:**

- Focused project browser suite passed: 3 tests.
- Browser regressions cover grouping, Uncategorized ownership, name/description/category search, compact rows, search labelling, overflow labelling, and absence of legacy tiles.
- Shared UI suite passed: 16 tests.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Replaces the active card-heavy chooser identified by AS-SHELL-01, improves project discovery, and makes category/project commands predictable and keyboard-labelled.

**Next plan step:** Granular Phase 6, step 6.2, project action dialogs and authorization.
### 2026-08-26 - Granular Phase 6.2: Project Action Dialogs And Authorization

**Status:** Completed.

**Plan reference:** Granular Phase 6, step 6.2, AS-SHELL-01, and `UI-P0-002`.

**Implementation:**

- Consolidated eight duplicated project/category modal variants into one mode-driven dialog contract.
- Added concise action descriptions and explicit irreversible consequences for project and category deletion.
- Clarified that category deletion preserves projects by moving them to Uncategorized.
- Replaced transient dialog errors with persistent inline notices.
- Replaced ordinary primary deletion controls with true danger buttons.
- Added labelled, bounded, masked numeric PIN input plus a clear PIN-not-configured state.
- Added required and max-length form semantics and changed project description to a multiline field.
- Added data-modal-submit ownership so Enter submits except from the description textarea.
- Added one projectActionBusy state owner plus a same-frame ref guard across all eight mutations.
- Disabled duplicate submission, close, and Escape while a mutation is pending and exposed button busy state.
- Corrected shared AuthorizationDialog numeric filtering from a literal D match to the intended non-digit character class.
- Updated authored workspace documentation with authorization timing, busy ownership, inline errors, and server authority.

**Validation:**

- Focused project dialog/controller/shared UI suites passed: 20 tests.
- Dialog tests assert complete project deletion consequences and category preservation behavior.
- Controller tests retain unique projectActionBusy ownership.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Applies the shared `UI-P0-002` dialog contract to project management, prevents duplicate privileged mutations, and makes authorization requirements and consequences understandable before submission.

**Next plan step:** Granular Phase 6, step 6.3, sidebar frame, search, filters, width, and collapse.
### 2026-08-26 - Granular Phase 6.3: Sidebar Frame, Search, Filter, Width, And Collapse

**Status:** Completed.

**Plan reference:** Granular Phase 6, step 6.3, AS-SHELL-01, and `UI-P0-001`.

**Implementation:**

- Made left-sidebar collapse a normalized, persisted workspace preference instead of local mirrored state.
- Added live sidebar width ownership and a bounded 220-420px pointer resize preview with commit on release.
- Added a labelled vertical separator with Left/Right 16px steps and Home reset to 280px.
- Added project-name tooltip context and retained Back to Projects plus Expand commands in collapsed mode.
- Rebuilt the cramped search/select strip as separate readable search and filter controls.
- Added explicit clear-search command and live match-count feedback.
- Expanded filters to Flows, folders, subflows, Flow objects, instructions, adaptations, recordings, and runs.
- Added focus/hover treatment and a larger resize hit target without changing the visible divider width.
- Added compatibility normalization for old workspaces without left-sidebar collapse state.
- Corrected authored performance documentation that still described the retired partial-commit runtime behavior.
- Updated authored workspace documentation with frame ownership, bounds, keyboard behavior, persistence, and collapsed commands.

**Validation:**

- Focused layout suite passed: 15 tests.
- Layout regressions assert default expanded state, persisted collapse, and 420px maximum width clamping.
- Project tree/controller suites passed: 14 tests.
- `pnpm --filter @fluxiq/web check` passed.

**Defect impact:** Advances `UI-P0-001`, makes hierarchy controls usable at practical widths, and removes non-persisted collapse state from the layout controller.

**Next plan step:** Granular Phase 6, step 6.4, semantic Flow/subflow tree and keyboard model.
### 2026-08-26 - Granular Phase 6.4: Semantic Flow And Subflow Tree

**Status:** Completed.

**Plan reference:** Granular Phase 6, step 6.4, AS-SHELL-01, and the shared keyboard/accessibility contract.

**Implementation:**

- Promoted the Flow hierarchy from nested visual rows to an ARIA tree with explicit treeitem and group ownership.
- Added accurate aria-level, aria-expanded, and aria-selected state to root, Flow, subflow, folder, and object rows.
- Added one roving tab stop across the visible hierarchy and restored focus to the root when filtering hides the focused item.
- Added Arrow Up/Down traversal with wrap, Home/End boundaries, Arrow Right expand/first-child behavior, Arrow Left collapse/parent behavior, and Enter/Space activation.
- Kept disclosure and row-action controls independent from primary tree-item activation.
- Preserved Flow-to-Router, subflow-to-Nodes, active-object selection, generated hierarchy, and default-collapse behavior.
- Updated authored workspace documentation with the semantic and keyboard contract.

**Validation:**

- Focused ProjectTree suite passed: 13 tests.
- Regression coverage asserts tree/group/treeitem semantics, hierarchy levels, selected state, parent metadata, and exactly one tab stop.
- Existing selection, icon, subflow collapse, add/delete, and primary-object tests remain green.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Completes the keyboard and assistive-technology foundation for the primary Flow discovery surface without changing its navigation semantics.

**Next plan step:** Granular Phase 6, step 6.5, row actions, context menus, and full title width.
### 2026-08-26 - Granular Phase 6.5: Row Actions, Context Menus, And Full Title Width

**Status:** Completed.

**Plan reference:** Granular Phase 6, step 6.5 and AS-SHELL-01.

**Implementation:**

- Consolidated eligible row commands into one labelled ellipsis menu per hierarchy object.
- Kept Add inside, Open settings, and Delete semantics while removing two or three permanently visible icon columns from each row.
- Retained the root Add Flow command as the primary direct action.
- Added icons and danger treatment inside menus, with shared menu focus, arrow-key, Home/End, and Escape behavior.
- Allowed primary object names to use the recovered row width and wrap long words instead of truncating to a tiny fragment.
- Added full-name title text to every primary tree row.
- Scoped menu trigger and popover CSS so the tree's broad button rules do not distort shared menu controls.
- Updated tree regressions from obsolete per-command labels to the row-action menu contract.

**Validation:**

- Focused ProjectTree suite passed: 13 tests.
- Tests cover eligible/ineligible action menus, full title exposure, hierarchy semantics, primary selection, and generated-object protections.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Resolves narrow title rendering and action crowding while preserving every supported object command in a predictable row-local menu.

**Next plan step:** Granular Phase 6, step 6.6, Flow-to-Router, Subflow-to-Nodes, refresh, and deep-link restoration.
### 2026-08-26 - Granular Phase 6.6: Flow, Subflow, Refresh, And Deep-Link Restoration

**Status:** Completed.

**Plan reference:** Granular Phase 6, step 6.6, AS-SHELL-01, and the deep-link contract.

**Implementation:**

- Added stable Flow scope resolution that translates a subflow graph Flow back to its durable parent Flow and parent subflow IDs.
- Added explicit default navigation: top-level Flow links open Router and subflow links open the normal Nodes editor.
- Added one-shot deep-link restoration for project, Flow, subflow, and view parameters.
- Delayed restoration until the project hierarchy and owning Flow SQL summaries are available.
- Resolved subflow links through get-flow-subflow, loaded the exact graph Flow detail, and then selected the graph in the normal editor.
- Corrected project refresh restoration to read the active strict pane before compatibility window state.
- Added guarded URL synchronization for selected top-level and subflow graph Flows plus active Flow-owned views.
- Prevented stale persisted selection from overwriting an incoming Flow deep link while its summaries are still loading.
- Preserved unrelated URL query parameters and canonical compatibility view normalization.
- Updated authored workspace documentation with defaults, restoration order, and URL identity rules.

**Validation:**

- Navigation, ProjectTree, and workspace layout suites passed: 33 tests.
- New navigation regressions cover top-level scope, subflow graph scope, Router and Nodes defaults, and explicit-view precedence.
- Existing URL parent-scope, compatibility alias, malformed-detail, tree selection, and layout migration tests remain green.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Makes Flow and subflow navigation deterministic across click, refresh, bookmark, and direct-link entry while preserving the required Router and Nodes object selection model.

**Next plan step:** Granular Phase 6, step 6.7, large-tree indexing, pagination where needed, and performance tests.
### 2026-08-26 - Granular Phase 6.7: Large-Tree Indexing, Paging, And Performance

**Status:** Completed.

**Plan reference:** Granular Phase 6, step 6.7, AS-SHELL-01, and UI-P0-003.

**Implementation:**

- Added a reusable hierarchy index with one ID map and one sorted children-by-parent map.
- Replaced repeated recursive full-array child scans and repeated ancestor array scans with memoized indexed lookup.
- Added cycle-safe ancestor visibility expansion for search and type filters.
- Added 100-row progressive pages independently at each unfiltered sibling level.
- Kept filtered results unbounded so search or an object-type filter never hides a matching object behind Show more.
- Kept progressive controls outside tree-item focus ownership while preserving ordinary keyboard access.
- Styled the paging command as a compact full-width continuation row.
- Confirmed Runtime Debug run history and the Subflows directory retain SQL-level limit/offset pages; the hierarchy consumes compact summaries and only pages DOM-heavy sibling rendering.
- Added a measured 10,000-node index/filter regression with a 500 ms ceiling.
- Updated authored workspace and performance documentation with the indexing, rendering-page, and SQL-page boundaries.

**Validation:**

- Hierarchy model and ProjectTree focused suites passed: 20 tests.
- The test command also matched the state view-model suite; 36 tests passed in total.
- Scale coverage asserts 10,000 indexed IDs, constant parent-child lookup, ancestor inclusion, and the 500 ms budget.
- Rendering coverage asserts 100 initial siblings plus one root tree item, a 25-item continuation, and immediate discovery of a match beyond the first page.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Removes quadratic hierarchy traversal and bounds initial DOM work without weakening search or confusing client rendering pages with database pagination.

**Next plan step:** Granular Phase 7, step 7.1, remove freeform windows and geometry.
### 2026-08-26 - Granular Phase 7.1: Remove Freeform Windows And Geometry

**Status:** Completed.

**Plan reference:** Granular Phase 7, step 7.1 and UI-P0-001.

**Implementation:**

- Removed freeform window creation and fallback routing from openView.
- Made View Adder target a strict main pane or fixed right sidebar only.
- Removed move, resize, snap, shared-edge resize, reset-size, maximize, and page-fullscreen runtime functions.
- Removed live window geometry, snap preview, and page-fullscreen state from the layout controller ownership contract.
- Removed the freeform window canvas and shell renderer.
- Removed move/resize/fullscreen/reset controls and resize-edge DOM from AutomationViewContainer.
- Removed window-count presentation from the workspace header.
- Advanced persisted layout output to version 3.
- Kept v2 window geometry as read-only migration input for deterministic pane/sidebar/dock derivation.
- Discarded legacy windows, activeWindowId, and maximizedWindowId from normalized v3 output.
- Removed window fallback from active-view capture and Flow-object deletion cleanup.
- Restored and revalidated coordinated summary commits, request cancellation, project-scoped cache use, project mutation busy guards, and canonical deep-link writing after bounded recovery work.
- Updated authored workspace documentation with the migration-only compatibility boundary.

**Validation:**

- Strict runtime, layout migration, and view-container suites passed: 18 tests.
- Source contract rejects freeform shell, move, resize, live geometry, and page-fullscreen identifiers.
- Migration regression proves a legacy window becomes a strict pane and is then discarded.
- Combined project, navigation, hierarchy, cache/request, and workspace suites passed: 76 focused tests across the recovery and retirement checks.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Eliminates the hidden dual workspace model. Runtime behavior now has one strict pane/sidebar/dock architecture, while old geometry survives only as migration input.

**Next plan step:** Granular Phase 7, step 7.2, main panes, inspector region, and timeline region.
### 2026-08-26 - Granular Phase 7.2: Main Panes, Inspector, And Timeline Regions

**Status:** Completed.

**Plan reference:** Granular Phase 7, step 7.2 and UI-P0-001.

**Implementation:**

- Kept automationWorkspaceRegionForView as the single canonical main/right/bottom routing boundary.
- Added an accessible Main editor landmark with explicit region metadata.
- Added numbered group labels to each deterministic editor pane.
- Changed the fixed right region to an Inspector aside landmark.
- Added an accessible Action preview timeline landmark for the fixed bottom region.
- Added source-contract coverage requiring all three region markers.
- Preserved strict layout presets, main split ratios, inspector collapse/width, and timeline collapse/height behavior.

**Validation:**

- Strict runtime, layout mapping/migration, and view-container suites passed: 18 tests.
- Region tests cover recording action preview, full timeline, Inspector, Problems, State, and Proposal Generator routing.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Makes the strict workspace structure explicit to users, assistive technology, CSS, and tests instead of relying on visual placement alone.

**Next plan step:** Granular Phase 7, step 7.3, semantic tabs with close, reorder, move, and overflow.
### 2026-08-26 - Granular Phase 7.3: Semantic Tabs, Close, Reorder, Move, And Overflow

**Status:** Completed.

**Plan reference:** Granular Phase 7, step 7.3 and UI-P1-004.

**Implementation:**

- Retained linked tablist, tab, and tabpanel semantics with one roving tab stop per pane.
- Changed tablist labelling from the retired Window concept to the supplied Pane or Sidebar frame label.
- Changed frame close language to Close active tab.
- Retained dedicated per-tab close commands, middle-click close, and Ctrl/Cmd+W.
- Retained pointer drag reorder within a pane and cross-pane drop through moveAutomationWorkspacePaneTab.
- Added Alt+Shift+ArrowLeft/Right cross-pane tab movement with aria-keyshortcuts exposure.
- Retained Home/End and Left/Right tab selection navigation.
- Retained fixed-size left/right scroll commands plus searchable open-tab overflow so scrollbar appearance cannot consume tab height.
- Kept right-sidebar tabs region-bound and main tabs main-region-bound.

**Validation:**

- Workspace component and layout suites passed: 16 tests.
- Tests cover semantic tab linkage, roving focus, close controls, scroll controls, searchable overflow, move/reorder helpers, region guards, and keyboard shortcut metadata.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Makes tab management complete without relying on hidden pointer drag behavior and removes remaining Window terminology from the active tab surface.

**Next plan step:** Granular Phase 7, step 7.4, keyboard splitters and layout reset.

### 2026-08-26 - Granular Phase 7.4: Keyboard Splitters And Layout Reset

**Status:** Completed.

**Plan reference:** Granular Phase 7, step 7.4 and UI-P1-004.

**Implementation:**

- Made the right Inspector divider a vertical ARIA separator with current, minimum, and maximum width values.
- Added ArrowLeft/ArrowRight keyboard resizing for the Inspector and Home restoration to the 320 px default.
- Made the Action Preview divider a horizontal ARIA separator with current, minimum, and maximum height values.
- Added ArrowUp/ArrowDown keyboard resizing for the Action Preview and Home restoration to the 220 px default.
- Made every main-pane divider an orientation-aware ARIA separator with a reported split percentage.
- Added axis-correct arrow-key resizing for main columns and rows plus Home restoration to the selected preset's default ratios.
- Extracted adjacent-pane ratio resizing into resizeAutomationMainSplitRatios so pointer and keyboard paths share the same pair-total and minimum-size constraints.
- Kept pointer movement transient and persisted only the final dimensions.
- Confirmed Workspace Preferences exposes all region dimensions and one Reset command that restores the complete version 3 workspace default.
- Updated authored workspace documentation to define pointer, keyboard, persistence, and reset behavior.

**Validation:**

- Strict runtime contract, workspace layout, and workspace component suites passed: 20 tests.
- New regressions prove adjacent pane resizing preserves the total and unrelated panes while enforcing the minimum ratio.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** All visible workspace dividers are now operable without a pointer, communicate their state, share deterministic constraints, and have a reliable full-layout recovery command.

**Next plan step:** Granular Phase 7, step 7.5, View Adder valid-context filtering.
### 2026-08-26 - Granular Phase 7.5: View Adder And Valid-Context Filtering

**Status:** Completed.

**Plan reference:** Granular Phase 7, step 7.5 and AS-SHELL-07.

**Implementation:**

- Added a typed View Adder catalog that owns region, group, required context, object scope, and placement copy.
- Restricted main-editor views to main panes and Inspector utilities to the fixed right region.
- Added Flow, recording, project, and current-selection requirements with direct disabled reasons.
- Enforced a singleton policy across open main and Inspector tabs so the adder cannot create duplicate view instances.
- Removed legacy Proposal Generator, Proposal, Config, and duplicate Dock entries from the addable catalog.
- Added a guarded add handler so stale or invalid options cannot bypass the presentation filter.
- Rebuilt the adder as an accessible labelled dialog-style popover.
- Added autofocus search across title, label, description, scope, and placement.
- Added Escape, outside-click, explicit close, and trigger-focus restoration behavior.
- Replaced Window language with Main editor and Inspector placement language.
- Scoped option CSS so the popover close command is not accidentally styled as a large view card.
- Added responsive empty, disabled, search-focus, and grouped-option styling.
- Updated authored workspace documentation with catalog ownership, context, singleton, dismissal, and focus behavior.

**Validation:**

- View Adder model, strict runtime, workspace layout, and workspace component suites passed: 23 tests.
- Regressions cover region separation, missing-context explanations, duplicate singleton prevention, and obsolete-view exclusion.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Invalid views can no longer be inserted into a region where they disappear or fail to render, and users can understand exactly where and for which object every available tab will open.

**Next plan step:** Granular Phase 7, step 7.6, Preferences and migration.
### 2026-08-26 - Granular Phase 7.6: Preferences And Migration

**Status:** Completed.

**Plan reference:** Granular Phase 7, step 7.6 and AS-SHELL-08.

**Implementation:**

- Replaced the absolutely positioned Preferences panel with the shared accessible Modal.
- Added modal focus containment, inert background, Escape close, trigger-focus return, and shared narrow-screen behavior through the existing dialog contract.
- Grouped controls into Workspace Frame, Main Editor, Action Preview, and Display sections.
- Kept bounded sliders for hierarchy width, Inspector width, and Action Preview height.
- Kept a complete strict-layout preset selector and immediate live preview through normalized workspace state.
- Added an explicit Action Preview visibility control.
- Added comfortable and compact operational density modes; compact mode targets repeated hierarchy and table rows rather than shrinking all controls.
- Added system and reduced-motion modes with a shell-level reduced-motion override.
- Extended the version 3 persisted schema with density and motion fields.
- Added safe migration defaults for missing or invalid density and motion values.
- Renamed Reset to Reset workspace layout and made it restore the full normalized version 3 default.
- Added an aria-live save state for saving, saved, and failed persistence.
- Changed debounced hierarchy/workspace persistence to retain and expose server errors.
- Added a global error alert when workspace persistence fails while the dialog is closed.
- Added narrow preference-row and footer reflow.
- Updated authored workspace documentation with preference ownership, modal behavior, migration, reset, density, motion, and persistence feedback.

**Validation:**

- Workspace layout, preference component, strict runtime, and View Adder suites passed: 26 tests.
- Migration regressions cover invalid fallback and supported density/motion preservation.
- Component coverage asserts all preference groups, controls, save state, and explicit reset copy.
- Source contract asserts dialog, failure alert, density, and motion wiring.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Workspace settings are now a complete, recoverable, persisted settings experience instead of an uncontained panel with silent save failures.

**Next plan step:** Granular Phase 7, step 7.7, narrow single-view plus drawer/sheet mode.
### 2026-08-26 - Granular Phase 7.7: Narrow Single-View Plus Drawer And Sheet Mode

**Status:** Completed.

**Plan reference:** Granular Phase 7, step 7.7, AS-SHELL-05, and UI-P1-015.

**Implementation:**

- Added a matchMedia-owned narrow workspace state at 820 px and below.
- Rendered only the active main editor pane in narrow mode while preserving all configured desktop panes and split ratios.
- Removed main split handles from the narrow presentation.
- Added compact workbar commands for Hierarchy, Inspector, and Action Preview.
- Extracted the project hierarchy into reusable content instead of duplicating tree state or controls.
- Opened Project Hierarchy in the shared left Drawer and forced its full content visible even when the desktop sidebar preference is collapsed.
- Closed the hierarchy drawer after object selection.
- Opened Inspector in the shared right Drawer with its fixed-region content forced expanded for the drawer session.
- Opened Action Preview as a bottom sheet with expanded preview content.
- Did not mount the inline desktop sidebar, Inspector, or Action Preview while their narrow equivalents own the surface.
- Closed narrow overlays automatically when the viewport widens.
- Added a stable viewport-height shell and one-column workspace at narrow widths.
- Added 480 px command reflow so labels remain visible and controls do not overlap.
- Hid pointer splitters/resizers inside drawers and assigned one scroll owner to each overlay.
- Kept Drawer focus trap, inert background, Escape close, close command, and focus return through the shared dialog contract.
- Updated authored workspace documentation with breakpoint, single-pane, overlay, selection-close, and desktop-layout preservation behavior.

**Validation:**

- Strict runtime, layout, component, and View Adder suites passed: 26 tests.
- Source contract asserts the breakpoint, active-pane-only rendering, all three Drawer/Sheet routes, conditional unmounting of desktop secondary regions, and narrow CSS ownership.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Automation Studio no longer compresses a desktop multi-region workspace into an unusable narrow viewport; the active task stays full width and secondary context is available through predictable accessible overlays.

**Phase result:** Granular Phase 7 is complete.

**Next plan step:** Granular Phase 8, step 8.1, graph controller/view split.
### 2026-08-26 - Granular Phase 8.1: Graph Controller And View Split

**Status:** Completed.

**Plan reference:** Granular Phase 8, step 8.1 and AS-VIEW-05.

**Implementation:**

- Added useAutomationGraphController as the canonical mutable graph-document owner.
- Moved Policy Canvas node arrays, edge arrays, synchronized refs, direct/functional updater semantics, atomic graph replacement, and imperative snapshots into the controller.
- Kept selection, palette collapse, viewport, and drag-marquee state in the rendering component as presentation concerns.
- Replaced separate source-sync state/ref writes with one atomic replacePolicyGraph operation.
- Preserved local node positions while replacing persisted or recovered source content.
- Retained the existing pure graph view-model and port modules for conversion, layout, routing, validation compatibility, and spawn calculations.
- Removed render-owned node/edge useState declarations and ref synchronization effects from the canonical canvas.
- Updated authored workspace documentation with graph controller, rendering, and pure-model ownership boundaries.

**Validation:**

- Graph controller ownership/updater and GraphEditor render-cost suites passed: 3 tests.
- Source regression rejects direct Policy Canvas node/edge state declarations.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Graph document mutation now has one explicit controller boundary, reducing synchronization bugs and making later toolbar, history, validation, draft, and performance work testable without coupling it to JSX.

**Next plan step:** Granular Phase 8, step 8.2, canvas toolbar and keyboard graph outline.
### 2026-08-26 - Granular Phase 8.2: Canvas Toolbar And Keyboard Graph Outline

**Status:** Completed.

**Plan reference:** Granular Phase 8, step 8.2 and AS-VIEW-05.

**Implementation:**

- Added a stable canvas toolbar above the graph content without consuming graph layout space.
- Added explicit Select and Pan modes with pressed state and React Flow selection/pan behavior.
- Added Fit, Zoom In, and Zoom Out commands.
- Added bounded graph-controller undo/redo history with source-replacement reset.
- Checkpointed add, delete, connect, reconnect, edge removal, node removal, parameter edit, and node drag mutation paths.
- Added Undo and Redo toolbar commands with Ctrl/Cmd+Z, Ctrl/Cmd+Y, and Cmd+Shift+Z behavior.
- Added a Validate command with a stable problem count.
- Added structural validation for missing/multiple Start nodes, unreachable nodes, and dangling edges.
- Added a Graph Outline command and non-overlapping outline panel.
- Implemented the outline as a semantic tree with roving focus, Arrow navigation, Home/End, Enter/Space, selection state, and node-focused viewport fitting.
- Added Add Node and the A shortcut to expose the palette.
- Added V, H, F, plus, and minus canvas shortcuts.
- Exposed aria-keyshortcuts and labels for every toolbar command.
- Removed duplicate built-in controls from the canonical Policy Canvas.
- Removed graph-wide context-menu suppression from canonical and routine frames.
- Added focused and narrow toolbar/outline styling with stable dimensions and bounded overflow.
- Updated authored workspace documentation with commands, shortcuts, history, validation, outline, and context-menu behavior.

**Validation:**

- Graph controller, toolbar/outline/validation, and render-cost suites passed: 5 tests.
- Tests cover structural problem IDs, all toolbar commands, semantic outline roles, explicit select/pan props, and context-menu restoration.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Core graph commands are now visible, keyboard reachable, and reversible, while the graph has a readable nonvisual navigation model.

**Next plan step:** Granular Phase 8, step 8.3, Node palette.
### 2026-08-26 - Granular Phase 8.3: Node Palette

**Status:** Completed.

**Plan reference:** Granular Phase 8, step 8.3 and AS-VIEW-05.

**Implementation:**

- Added searchable filtering across node title, description, family, and compatibility.
- Preserved canonical node-registry categories in the All view.
- Added All, Favorites, and Recent palette modes.
- Added UI-only persisted favorite node IDs.
- Added a bounded 12-item session recent list updated on successful add.
- Added compatibility hints for Flow-only, Routine-only, dual-scope, Domain, Published Flow, Project, Code, and privileged nodes.
- Replaced nested-control risk with separate add and favorite buttons in a stable item grid.
- Added explicit empty states for search, favorites, and recents.
- Made Add Node and the A shortcut expand the palette and focus node search.
- Retained read-only disabled behavior with direct language.
- Added search focus, segmented mode, item, favorite, compatibility, empty, and overflow styling.
- Updated authored workspace documentation with catalog, search, favorite/recent ownership, compatibility, and focus behavior.

**Validation:**

- Node palette, graph toolbar/outline/validation, controller, and render-cost suites passed: 7 tests.
- Tests cover compatibility copy, search, modes, favorite persistence key, recent ownership, item structure, and focused Add Node entry.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Users can now find and understand nodes without scanning the entire registry or knowing importer/source internals, while frequently used nodes become immediately reachable.

**Next plan step:** Granular Phase 8, step 8.4, node, edge, port, selection, connect, and drag behavior.
### 2026-08-26 - Granular Phase 8.4: Node, Edge, Port, Selection, Connect, And Drag Behavior

**Status:** Completed.

**Plan reference:** Granular Phase 8, step 8.4 and AS-VIEW-05.

**Implementation:**

- Replaced single-node command ownership with a synchronized selected-node ID set.
- Preserved one primary selected node for Inspector context while retaining the full multi-selection.
- Added Ctrl/Cmd+A select-all.
- Added Ctrl/Cmd+C and Ctrl/Cmd+V selected induced-subgraph copy/paste.
- Added Ctrl/Cmd+D duplication with remapped node IDs, remapped internal edges, offset placement, and selected pasted nodes.
- Added Shift+Arrow movement in stable 10 px increments.
- Added Delete/Backspace graph-selection deletion.
- Added C keyboard connection staging and completion.
- Reused automationConnectionIsValid to choose a compatible source/target port pair for keyboard connections.
- Added Duplicate, Connect, and Delete toolbar alternatives with disabled and pressed states.
- Enabled native node and edge focusability.
- Kept pointer connect/reconnect, typed compatibility, edge rebalancing, and drag history checkpoints.
- Added explicit accessible input/output labels to every port handle.
- Removed the canonical right-button marquee and its state/capture layer; Select mode now uses standard selection drag.
- Kept selection synchronized across pointer clicks, React Flow multi-selection, outline selection, add, paste, edge selection, and deletion.
- Updated authored workspace documentation with multi-selection, editing commands, typed keyboard connection, focus, ports, and drag behavior.

**Validation:**

- Typed port, graph interaction, palette, toolbar/outline, controller, and render-cost suites passed: 10 tests.
- Port tests cover compatible, incompatible, self, any, signal, caption, and semantic title behavior.
- Source regressions cover set-based selection, every keyboard mutation, toolbar alternatives, focusable elements, port labels, and marquee retirement.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Pointer and keyboard users now operate the same graph model, including multi-node edits and typed connections, without hidden right-click behavior.

**Next plan step:** Granular Phase 8, step 8.5, Parameter editor and real reference pickers.### 2026-08-26 - Granular Phase 8.5: Parameter Editor And Real Reference Pickers

**Status:** Completed.

**Plan reference:** Granular Phase 8, step 8.5 and AS-INNER-03.

**Implementation:**

- Extended the shared node-parameter contract with examples and numeric, integer, string-length, and regular-expression constraints.
- Applied native min, max, step, minLength, maxLength, and pattern constraints to compatible controls.
- Added inline required, type, range, integer, length, format, identifier, and stale-reference validation.
- Added a restrained invalid-field treatment plus adjacent example and error copy.
- Replaced reference-shaped text entry with a searchable project-backed listbox.
- Derived friendly action, task, policy, routine, data-table, and Flow-variable choices from loaded Studio artifacts.
- Deduplicated reference choices by stable ID while retaining user-facing labels and descriptions.
- Added selected, optional-clear, no-match, no-compatible-object, and previously-selected-object-unavailable states.
- Kept raw object IDs out of the normal picker surface.
- Added bounded picker scrolling and focus-visible behavior suitable for the narrow Inspector.
- Passed reference data through the canonical Renderer and Inspector ownership path.
- Updated authored workspace documentation with constraint, picker-source, friendly-label, stale-reference, and inline-error behavior.

**Validation:**

- Parameter editor and Inspector reference-option suites passed: 5 tests.
- Tests cover required, numeric range, integer, pattern, valid/invalid references, searchable listbox markup, friendly labels, raw-ID suppression, and option deduplication.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Node configuration no longer asks users to paste internal object IDs into controls labelled as pickers, and invalid values are explained at the field that needs attention.

**Next plan step:** Granular Phase 8, step 8.6, Validation/Problems integration.### 2026-08-26 - Granular Phase 8.6: Validation And Problems Integration

**Status:** Completed.

**Plan reference:** Granular Phase 8, step 8.6, P1 Flow Nodes Whiteboard, and AS-INNER-03/04.

**Implementation:**

- Unified live selected-Flow graph problems with server/project snapshot problems.
- Added required/type/constraint parameter failures to graph-level validation.
- Added existing-edge port compatibility validation in addition to connection-time rejection.
- Retained missing/multiple Start, unreachable-node, and dangling-edge checks.
- Marked invalid nodes and rendered invalid edges with explicit danger styling.
- Replaced the passive Problems data table with a scrollable severity-sorted issue list.
- Added All, Errors, and Warnings filters with stable counts and accessible pressed state.
- Added friendly problem labels, messages, and artifact context plus true empty/filter-empty states.
- Made Validate open the canonical shared Problems utility view.
- Added direct navigation from graph problem rows to the Nodes whiteboard.
- Added node focus/selection and viewport fitting, edge selection/end-point fitting, and graph-level fitting.
- Preserved snapshot problem identity while preventing key collisions with live graph issues.
- Restored the adjacent runtime, adaptation, instruction, and workbench SQL pagination constants after detecting an edit-boundary regression during typecheck.
- Updated authored workspace documentation with validation ownership and navigation behavior.

**Validation:**

- Graph editor, Problems workspace, and parameter editor suites passed: 26 tests.
- Tests cover incompatible edges, required node parameters, existing structural checks, focus-event wiring, invalid-element projection, Problems filters/context, and parameter controls.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Validation is no longer trapped in an Inspector summary or disconnected server table. Users can find a concrete problem, understand it, and jump to the graph object that needs work.

**Next plan step:** Granular Phase 8, step 8.7, Draft recovery and save/conflict state.### 2026-08-26 - Granular Phase 8.7: Draft Recovery And Save Conflict State

**Status:** Completed.

**Plan reference:** Granular Phase 8, step 8.7 and P1 Flow Nodes Whiteboard.

**Implementation:**

- Added a typed browser graph-draft store isolated by encoded project and Flow IDs.
- Persisted graph, base canonical updatedAt, and recovery write time without placing graph payloads in workspace preferences.
- Debounced ordinary recovery writes and flushes the latest pending graph when Flow/project navigation occurs.
- Preserved in-memory and browser drafts across inner-view, Flow, and project navigation.
- Removed internal navigation confirmations that incorrectly described recoverable work as discarded.
- Added reload detection and an explicit Restore Draft / Discard recovery banner.
- Distinguished current-revision and stale older-revision recovery records.
- Added visible Saved, Unsaved changes, Saving, Save failed, and Save conflict canvas states.
- Changed graph saves to return a structured result rather than treating every non-false response as success.
- Made the global Save command wait for an editor result and removed its premature one-second success fallback.
- Added background save handling so a selected Flow draft can be saved from another inner view.
- Extended SaveFlowRequest with optional expectedUpdatedAt optimistic concurrency.
- Rejected mismatched canonical revisions before any repository/file/config/index write with FLOW_SAVE_CONFLICT.
- Preserved the unsaved draft on failed and conflicting saves; successful saves and explicit discard remove recovery data.
- Added a global conflict alert and direct user-facing conflict explanation without exposing revision internals.
- Updated authored workspace and persistence documentation with recovery ownership and optimistic concurrency behavior.

**Validation:**

- Web and FluxIQ package typechecks passed.
- Draft-store and graph save/recovery suites passed: 10 tests.
- The exact Automation Studio service suite passed: 74 tests, including stale-save rejection and no overwrite of the current Flow.
- An initial broad Vitest invocation reached unrelated suites and suffered a Windows worker exit; the exact service suite was rerun with one worker and completed cleanly.

**Defect impact:** Unsaved whiteboard work now survives recoverable navigation and reload, save status reflects reality, and concurrent edits cannot silently overwrite a newer canonical Flow.

**Next plan step:** Granular Phase 8, step 8.8, Large graph performance and screenshots.### 2026-08-26 - Granular Phase 8.8: Large Graph Performance And Screenshots

**Status:** Completed.

**Plan reference:** Granular Phase 8, step 8.8 and P1 Flow Nodes Whiteboard.

**Implementation:**

- Replaced per-edge full-array node searches with one indexed node map.
- Replaced repeated Start-node membership scans with a Start-ID set.
- Kept validation linear in nodes, edges, parameters, and local port counts.
- Memoized graph problems, invalid ID sets, and projected invalid node/edge arrays.
- Enabled React Flow onlyRenderVisibleElements for the canonical whiteboard.
- Kept the minimap for large wide canvases and hides it below 720 px where it obstructs editing.
- Added content-visibility containment for offscreen graph-outline rows.
- Added a deterministic 2,000-node/1,999-edge validation performance guard with a 250 ms budget.
- Extended the existing deterministic scale fixture verification at 180 graph nodes, 180 hierarchy folders, 24 run rows, and 600 timeline entries.
- Added a Playwright scale-whiteboard capture that verifies the frame, a rendered node, Canvas tools, and minimum editing dimensions.
- Routed that capture through existing desktop 1440x900, compact 1280x720, and mobile 390x844 projects.
- Updated authored workspace documentation with large-graph rendering, validation, outline, minimap, budget, and screenshot contracts.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Graph editor suite passed in a stable single-thread run: 9 tests, including the 2,000-node budget.
- Typed port suite passed: 2 tests.
- fixture:e2e:verify passed and reported the expected scale counts.
- The Playwright capture spec is implemented and typechecked. No existing local panel was running, and repository policy prohibits the agent from starting the web panel, so PNG execution remains in the documented manual-server browser-test workflow.
- A parallel Vitest attempt hit the recurring Windows Tinypool worker exit; exact suites were rerun separately with one thread and passed.

**Defect impact:** Large connected graphs no longer incur quadratic validation work or require React Flow to mount every offscreen element, while scale and narrow screenshot coverage is now a repeatable repository test.

**Phase result:** Granular Phase 8 is complete.

**Next plan step:** Granular Phase 9, step 9.1, Router empty state and first subflow path.### 2026-08-26 - Granular Phase 9.1: Router Empty State And First Subflow Path

**Status:** Completed.

**Plan reference:** Granular Phase 9, step 9.1 and P1 Router.

**Implementation:**

- Added a distinct no-selected-Flow state instead of rendering disabled route controls.
- Rebuilt the no-subflow state as a centered, unframed dependency message with one Create Subflow command.
- Removed the decorative Router-to-subflow pseudo-diagram and setup-card composition from rendered UI.
- Kept the action wired to AutomationStudioLive's hierarchy action for the selected Flow's Subflows root.
- Reused the same item-type hierarchy modal as the left-sidebar Subflows plus action.
- Disabled the command only when the embedding context does not provide a creation action.
- Kept route controls entirely out of the DOM until at least one active subflow exists.
- Added responsive stable empty-state sizing and direct operational copy.
- Updated authored workspace documentation with Flow/subflow dependency and shared creation ownership.

**Validation:**

- Workspace view suite passed: 17 tests.
- Tests cover no Flow, no subflows, populated routes, shared view identity, direct dependency copy, and removal of the fake visual from rendered output.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Router now tells users exactly what dependency is missing and takes them through the established Subflows creation flow instead of showing a blank whiteboard, disabled workbench, or fake routing picture.

**Next plan step:** Granular Phase 9, step 9.2, Ordered route list and responsive rows.### 2026-08-26 - Granular Phase 9.2: Ordered Route List And Responsive Rows

**Status:** Completed.

**Plan reference:** Granular Phase 9, step 9.2 and P1 Router.

**Implementation:**

- Kept one canonical scrollable route list rather than parallel map/list surfaces.
- Exported and verified stable ordering by numeric priority followed by route name.
- Preserved aligned priority, route/condition, target, group, status, and action columns on wide containers.
- Added an accessible row label containing priority, route name, and friendly target label.
- Wrapped status in a stable grid cell so badge dimensions cannot shift neighboring columns.
- Added Router container queries so behavior follows pane width rather than browser width.
- Reflowed narrow rows into priority, detail, and action columns with three content rows.
- Preserved a two-line readable condition, target, group, status, and chevron in narrow panes.
- Removed narrow-row minimum width and horizontal overflow dependence.
- Kept full-row click/focus behavior with stable minimum hit area.
- Updated authored workspace documentation with ordering, responsive, field-preservation, and accessibility contracts.

**Validation:**

- Workspace view suite passed: 18 tests.
- Tests cover stable priority/name ordering, populated row content, status-cell structure, accessible row naming, empty states, and surrounding Flow views.
- pnpm --filter @fluxiq/web check passed.

**Defect impact:** Router remains scannable in wide workspaces and fully usable in narrow panes without clipping or hiding the fields needed to understand route priority.

**Next plan step:** Granular Phase 9, step 9.3, Groups and fallback.
### 2026-08-26 - Granular Phase 9.3: Groups And Fallback

**Status:** Completed.

**Plan reference:** Granular Phase 9, step 9.3 and P1 Router.

**Implementation:**

- Kept route groups as compact filters with direct edit controls and deterministic ordering.
- Added editable active, disabled, and archived lifecycle status to route groups.
- Preserved group name, description, priority order, and collapsed-by-default behavior.
- Kept group deletion non-destructive by ungrouping affected routes.
- Converted the persistent fallback summary into a full-row accessible edit command.
- Added a focused fallback modal with explicit Send to a subflow and Stop the run behaviors.
- Used friendly subflow names in fallback selection and the persisted Router summary.
- Required a meaningful terminal message when Stop the run is selected.
- Added a dedicated save-flow-map-fallback API contract, authorized handler, and service mutation.
- Ensured direct fallback changes do not create, duplicate, or reorder ordinary route rules.
- Routed fallback changes through the existing in-product PIN authorization modal.
- Added hover, keyboard-focus, responsive, and stable-column styling to the fallback command.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- pnpm --filter fluxiq check passed.
- Workspace view suite passed: 19 tests.
- Automation Studio service suite passed: 74 tests.
- Service coverage verifies both terminal and subflow fallback mutations preserve the existing route count.

**Defect impact:** Route grouping and unmatched behavior are now directly understandable and editable without hidden route creation, raw documents, or ambiguous static summaries.

**Next plan step:** Granular Phase 9, step 9.4, Visual condition builder.
### 2026-08-26 - Granular Phase 9.4: Visual Condition Builder

**Status:** Completed.

**Plan reference:** Granular Phase 9, step 9.4 and P1 Router.

**Implementation:**

- Replaced the freeform condition summary plus Advanced matching disclosure with an explicit visual builder.
- Added a keyboard-operable Always/When segmented mode.
- Added friendly Run input and Current state source choices.
- Separated source from the nested field path so users do not need to compose an internal signal prefix.
- Replaced internal operator tokens with readable comparison labels.
- Added typed Text, Number, and True or false expected-value controls.
- Added a live plain-language condition summary.
- Kept status, confidence, and description in a secondary Route details disclosure.
- Disabled save with a visible incomplete builder when When has no field.
- Added clearCondition to the route API and service contract.
- Removed stale canonical conditions and condition summaries when an edited route switches to Always.
- Kept partial API callers backward compatible when clearCondition is omitted.
- Added compact, responsive builder styling and keyboard focus states.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- pnpm --filter fluxiq check passed.
- Workspace view suite passed: 20 tests.
- Automation Studio service suite passed: 74 tests.
- Tests verify source/path parsing, typed boolean/number values, readable summaries, visual labels, absence of Advanced matching, and persisted condition clearing.

**Defect impact:** Route matching can now be authored without raw JSON, opaque operator names, or stale hidden conditions.

**Next plan step:** Granular Phase 9, step 9.5, Searchable target picker.
### 2026-08-26 - Granular Phase 9.5: Searchable Target Picker

**Status:** Completed.

**Plan reference:** Granular Phase 9, step 9.5 and shared form/object-picker requirements.

**Implementation:**

- Replaced native target selects in both Route and Fallback editors with the shared Combobox.
- Search uses friendly subflow names, descriptions, roles, and stable IDs.
- Kept friendly names primary and IDs as secondary searchable metadata.
- Reused established labelled combobox/listbox semantics, keyboard navigation, Enter selection, Escape dismissal, and active-option state.
- Added context-specific inline errors for missing route and fallback targets.
- Kept active-subflow filtering and deterministic friendly-name ordering.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Router workspace suite passed: 21 tests.
- Shared UI suite passed: 16 tests.
- Combined focused run passed: 37 tests.

**Defect impact:** Users can select route targets by recognizable names at scale instead of scanning a long native select or entering an internal ID.

**Next plan step:** Granular Phase 9, step 9.6, Reorder, duplicate, enable, and delete actions.
### 2026-08-26 - Granular Phase 9.6: Route Reorder And Actions

**Status:** Completed.

**Plan reference:** Granular Phase 9, step 9.6 and shared row-action requirements.

**Implementation:**

- Kept full-row route editing as the primary action.
- Added one compact accessible overflow menu per route instead of crowding rows with five buttons.
- Added Move up and Move down commands with correct first/last disabled states.
- Added collision-safe Duplicate route behavior.
- Added active/disabled lifecycle toggling with contextual Enable/Disable labels.
- Added destructive Delete route styling and authorization.
- Added a dedicated mutate-flow-map-route endpoint and service mutation.
- Made move, duplicate, toggle, and delete operate against one canonical Router write.
- Normalized route priorities after structural mutations for stable deterministic order.
- Preserved conditions, targets, groups, and metadata when duplicating.
- Added wide and container-narrow row layouts with a fixed action column.
- Reused the shared keyboard-operable Menu primitive.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- pnpm --filter fluxiq check passed.
- Router plus shared-menu suites passed: 38 tests.
- Automation Studio service suite passed: 74 tests.
- Service tests cover duplicate naming, normalized priorities, moving, toggling, and deleting.

**Defect impact:** Every route can now be reordered and managed directly without reopening the edit form, conflicting order values, or an overloaded row layout.

**Next plan step:** Granular Phase 9, step 9.7, Route test and explanation.
### 2026-08-26 - Granular Phase 9.7: Route Test And Explanation

**Status:** Completed.

**Plan reference:** Granular Phase 9, step 9.7 and P1 Router.

**Implementation:**

- Added a Test this route panel inside the focused Route editor.
- Generated the sample-value control from the selected text, number, or boolean condition type.
- Built nested sample input/state objects from the visual source and field controls.
- Added a read-only test-flow-map-route-condition endpoint.
- Reused evaluateAutomationStudioRouteCondition from the canonical runtime matcher.
- Avoided duplicating or approximating matching logic in the browser.
- Added Testing progress and disabled duplicate test requests.
- Displayed Route matches or Route does not match with a plain-language runtime reason.
- Kept test failures local to the panel without discarding the route draft.
- Added responsive result styling that uses text and iconography as well as color.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter fluxiq check passed.
- pnpm --filter @fluxiq/web check passed on isolated retry.
- Router workspace suite passed: 23 tests.
- Canonical Router runtime suite passed: 6 tests.
- One combined Windows typecheck process exited with status 3221225477 after printing no diagnostics; the exact web check was rerun alone and passed.

**Defect impact:** Users can verify a route before saving and see the same explanation runtime would produce, without entering JSON or relying on a separate browser-only matcher.

**Next plan step:** Granular Phase 9, step 9.8, Loading, save, authorization, errors, and stale CSS removal.
### 2026-08-26 - Granular Phase 9.8: Router States And Cleanup

**Status:** Completed.

**Plan reference:** Granular Phase 9, step 9.8 and shared loading/error/authorization requirements.

**Implementation:**

- Kept a stable three-row loading skeleton with aria-busy and a named Router loading label.
- Scoped Router and subflow-target responses to the active project/Flow.
- Ignored late responses after navigation instead of overwriting the newly selected Router.
- Added a local retryable error banner for Router and target reads.
- Preserved current Router context while retrying.
- Added named Saving changes and Testing progress.
- Kept authorization inside a focused Authorize Router Change modal with contextual copy.
- Reset route-test samples/results whenever a different route draft opens.
- Removed obsolete Flow Map layout, inspector, form-grid, decision-map, route-card, first-use illustration, and Advanced matching CSS.
- Removed accidental request-scope declarations from unrelated workspace components.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Router workspace suite passed: 24 tests.
- Stale-selector audit returned no Router map, first-use, advanced, or legacy Flow Map layout selectors.
- Source audit confirms exactly one scopeRef declaration, owned by AutomationFlowMapWorkspace.

**Defect impact:** Router no longer flashes stale data after navigation, strands users on failed reads, hides save state, or carries a second obsolete visual implementation in CSS.

**Phase result:** Granular Phase 9 is complete.

**Next plan step:** Granular Phase 10, step 10.1, Subflow directory list, SQL pagination, filters, and URL state.
### 2026-08-26 - Granular Phase 10.1: Subflow Directory And SQL Pagination

**Status:** Completed.

**Plan reference:** Granular Phase 10, step 10.1 and shared table/pagination requirements.

**Implementation:**

- Kept Subflows as a link directory rather than embedding the Nodes editor.
- Added synchronized flow.subflows SQLite summary records.
- Moved Flow/status/role/search filters, count, sort, limit, and offset into SQL.
- Preserved equivalent filtering for in-memory service instances.
- Synchronized canonical Subflow saves and deletes with the SQL summary index.
- Added debounced name/ID search plus status, role, sort, and direction controls.
- Added URL restoration for query, filters, sorting, page size, and offset.
- Added 10/25/50 page-size choices and first/previous/next/last controls.
- Added out-of-range page correction after deletes/filter changes.
- Rejected stale responses and retained rows during refresh.
- Added retryable errors, loading skeleton, and distinct no-data/no-match states.
- Added responsive toolbar and pagination styling.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- pnpm --filter fluxiq check passed.
- Workspace view suite passed: 25 tests.
- Automation Studio service suite passed: 74 tests.
- Tests cover URL restoration and SQL Flow/role/search filtering.

**Defect impact:** Large Subflow collections are now filtered, counted, sorted, and paged at the database boundary, with stable navigable UI state.

**Next plan step:** Granular Phase 10, step 10.2, Folder/Subflow creation modal.
### 2026-08-26 - Granular Phase 10.2: Folder And Subflow Creation Modal

**Status:** Completed.

**Plan reference:** Granular Phase 10, step 10.2 and hierarchy creation requirements.

**Implementation:**

- Reused one hierarchy dialog from the Router empty state, Subflows root plus action, and nested Subflow folder plus actions.
- Kept the first modal view as an explicit Subflow versus Folder choice.
- Used familiar Workflow and Folder icons with concise object descriptions.
- Collected a friendly name and a real hierarchy location in the second view.
- Preserved nested parentCategoryId for folders and subflows.
- Kept creation inside the existing PIN authorization step.
- Reused createFlowSubflowFromHierarchy and createSubflowCategoryFolder instead of introducing a second creation workflow.
- Added a source contract test covering item-type choice, nested parent resolution, both creation paths, location, and friendly placeholder.
- Updated authored workspace documentation.

**Validation:**

- Strict workspace/hierarchy contract suite passed: 3 tests.
- pnpm --filter @fluxiq/web check passed on isolated retry.
- A combined Windows test/check process exited with status 3221225477 after the test passed and tsc printed no diagnostics; isolated tsc passed.

**Defect impact:** Users can create a Subflow or arbitrarily nested organizational folder from any relevant plus action with one consistent, visible choice flow.

**Next plan step:** Granular Phase 10, step 10.3, Rename, duplicate, lifecycle, and delete.
### 2026-08-26 - Granular Phase 10.3: Subflow Actions And Lifecycle

**Status:** Completed.

**Plan reference:** Granular Phase 10, step 10.3, Subflow rename, duplicate, lifecycle, and delete.

**Implementation:**

- Made each Subflow row's primary surface open its normal Nodes editor.
- Added a compact row action menu for rename, duplicate, enable/disable, archive, and delete.
- Added focused action dialogs with consequences, friendly-name editing where relevant, and PIN authorization.
- Added framework endpoints and handlers for enable and delete operations.
- Changed duplication to clone the canonical Subflow graph into an independent graph Flow with repaired ownership metadata.
- Synchronized deletion across graph Flow storage, Subflow JSON, compatibility indexes, and the SQLite summary.
- Guarded deletion when any Router route or fallback still targets the Subflow.
- Refreshed the directory and hierarchy through the shared subflows-changed event after successful mutations.
- Removed the obsolete browser-side route evaluator import.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter fluxiq check passed.
- pnpm --filter @fluxiq/web check passed.
- Automation Studio service suite passed: 74 tests.
- Workspace view suite passed: 26 tests.
- Lifecycle coverage verifies independent graph duplication, disable/archive/enable transitions, synchronized deletion, and the remaining SQL page.

**Defect impact:** Subflow lifecycle work is now discoverable from each row, uses explicit confirmations, preserves independent graph ownership, and cannot silently leave broken Router references.

**Next plan step:** Granular Phase 10, step 10.4, route references and readiness summary.
### 2026-08-26 - Granular Phase 10.4: Route References And Readiness

**Status:** Completed.

**Plan reference:** Granular Phase 10, step 10.4, route references and readiness summary.

**Implementation:**

- Added graphFlowId and an explicit migration version to compact SQL-backed Subflow summaries.
- Added one-time JSON and SQLite backfill for existing project indexes.
- Added a user-facing Ready or Needs setup signal based on active lifecycle and canonical Nodes graph ownership.
- Loaded one parent Router document per Flow scope rather than issuing per-row relationship requests.
- Derived route and fallback reverse references with the existing tested Router helper.
- Displayed Router reference counts independently from structural readiness.
- Listed exact blocking route names and conditions in the delete confirmation.
- Disabled destructive confirmation while Router references remain; the service guard remains authoritative.
- Added semantic success/warning styling and focused readiness tests.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter fluxiq check passed.
- pnpm --filter @fluxiq/web check passed.
- Automation Studio service suite passed: 74 tests.
- Workspace view suite passed in isolated retry: 27 tests.
- A parallel Windows Vitest worker first exited with status 3221225477 and no diagnostics; isolated execution passed.

**Defect impact:** Users can now tell whether a Subflow is executable, whether the Router uses it, and exactly what must be changed before deletion without opening raw records.

**Next plan step:** Granular Phase 10, step 10.5, container/Nodes navigation and breadcrumbs.
### 2026-08-26 - Granular Phase 10.5: Container Navigation And Breadcrumbs

**Status:** Completed.

**Plan reference:** Granular Phase 10, step 10.5, container/Nodes navigation and breadcrumbs.

**Implementation:**

- Revalidated the hierarchy primary-object contract: top-level Flow selects Router and Subflow selects Nodes.
- Kept the Subflow disclosure control independent from its primary Nodes navigation action.
- Added a canonical breadcrumb model for Flow, optional Subflow, and current object.
- Rendered one shared Workspace location navigation trail in the workbar rather than duplicating location headers in every inner view.
- Used friendly loaded Flow and Subflow names with stable-ID fallback.
- Made Flow crumbs return to the parent Router and Subflow crumbs return to the normal Nodes editor.
- Labeled policy-primary as Nodes in scoped navigation.
- Added truncation and narrow-layout behavior so long names do not crowd workbar controls.
- Added navigation-model tests and reran hierarchy interaction/model suites.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Navigation suite passed: 6 tests.
- ProjectTree and hierarchy model suites passed: 20 tests.
- Source audit confirms the shared breadcrumb owns Flow and Subflow navigation.

**Defect impact:** Users can always see and navigate their Flow/Subflow/object location while Subflows continue to open the normal Nodes editor rather than a separate editor mode.

**Next plan step:** Granular Phase 10, step 10.6, nested Subflow scoped objects and refresh hydration.
### 2026-08-26 - Granular Phase 10.6: Nested Scoped Objects And Refresh Hydration

**Status:** Completed.

**Plan reference:** Granular Phase 10, step 10.6, nested Subflow scoped objects and refresh hydration.

**Implementation:**

- Audited recursive hierarchy generation from compact Flow summaries rather than in-memory creation state.
- Verified nested Subflow graph ownership is reconstructed from parentFlowId and parentSubflowId.
- Verified nested categories and Subflows are placed under each graph Flow's own Subflows object.
- Verified every recursive Subflow container receives Nodes, Subflows, Instructions, Recordings, Adaptations, Runtime Debug, and Settings.
- Preserved Router exclusively on the top-level Flow.
- Preserved default-collapsed Subflow containers and normal Nodes selection.
- Extracted a selected-summary hydration predicate and wired it into the Flow-detail effect.
- Kept broad project opening summary-only while hydrating only the selected compact graph on demand.
- Added a two-level refresh regression covering graph ownership, categories, scoped objects, Router exclusion, and top-level Flow exclusion.
- Updated authored persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- AutomationStudioLive suite passed: 9 tests.
- ProjectTree and hierarchy model suites passed: 20 tests.
- The initial recursive assertion assumed readable hierarchy IDs; it was corrected to assert the actual parent relationship and passed.

**Defect impact:** Nested Subflows and every scoped object now survive refresh from compact persisted metadata while detail hydration remains limited to the active graph.

**Next plan step:** Granular Phase 10, step 10.7, Subflow scale/performance tests.
### 2026-08-26 - Granular Phase 10.7: Subflow Scale And Performance

**Status:** Completed.

**Plan reference:** Granular Phase 10, step 10.7, Subflow scale/performance tests and the shared 500 ms local-list budget.

**Implementation:**

- Added a 10,000-record compact Subflow SQL fixture through one repository transaction.
- Exercised the real listFlowSubflowSummaries SQL count, sort, limit, offset, status, role, and search path.
- Covered a 9,950-row deep offset with a 50-row page.
- Covered combined active/recovery/needle filtering across the full data set.
- Asserted summary pages omit hydrated input mappings.
- Enforced separate 500 ms local budgets for deep paging and combined filtering.
- Verified URL restoration accepts 50 rows and rejects unsupported 100-row pages back to the 25-row default.
- Updated authored persistence documentation with the scale contract.

**Validation:**

- pnpm --filter fluxiq check passed.
- pnpm --filter @fluxiq/web check passed.
- Focused 10,000-record service budget passed in 741 ms total including fixture seeding; both timed SQL reads stayed below 500 ms.
- Workspace view suite passed: 28 tests.

**Defect impact:** Subflow directory behavior is now guarded against full-detail hydration, unbounded DOM rows, and slow SQL paging/filtering at realistic scale.

**Phase result:** Granular Phase 10 is complete.

**Next plan step:** Granular Phase 11, step 11.1, Instructions library list, search, filters, and pagination.
### 2026-08-26 - Granular Phase 11.1: Instruction Library Discovery

**Status:** Completed.

**Plan reference:** Granular Phase 11, step 11.1, library list, search, filters, and pagination.

**Implementation:**

- Added compact flow.instructions SQLite summaries with explicit migration versioning.
- Added requirement to compact Instruction summaries while keeping bodies out of list payloads.
- Moved Flow/subflow scope, text, status, scope-kind, requirement, count, sort, limit, and offset into SQL.
- Preserved equivalent in-memory filtering and sorting semantics.
- Added get-flow-instruction so selecting one row no longer hydrates the entire effective instruction set.
- Added URL-restored query, scope, status, requirement, sorting, direction, page size, and offset.
- Added stale list/detail response rejection and separate loading states.
- Added retryable errors and distinct no-data/no-match states.
- Added 10/25/50 bottom pagination with first/previous/next/last controls and out-of-range correction.
- Added responsive filter-toolbar and pagination styling.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter fluxiq check passed.
- pnpm --filter @fluxiq/web check passed.
- Focused large-summary service test passed with SQL Instruction filters and versioned compact summaries.
- Workspace view suite passed: 29 tests.

**Defect impact:** Large Instruction libraries are now searchable and pageable at the database boundary, and opening one instruction no longer loads every effective instruction body.

**Next plan step:** Granular Phase 11, step 11.2, editor hierarchy and draft preservation.
### 2026-08-26 - Granular Phase 11.2: Instruction Editor Hierarchy And Draft Preservation

**Status:** Completed.

**Plan reference:** Granular Phase 11, step 11.2, editor hierarchy and draft preservation.

**Implementation:**

- Reorganized the editor into clear Content and Behavior sections with stable, responsive form styling.
- Added canonical base-draft comparison and an immediate Unsaved changes state.
- Added project/Flow/instruction-isolated browser recovery keys with debounced persistence.
- Added explicit Restore and Discard recovery actions after reload.
- Guarded New Instruction and instruction-row navigation with an in-product unsaved-changes modal.
- Added the standard browser unload warning while a draft is dirty.
- Cleared recovery data only after successful save or explicit discard.
- Added focused regression coverage for key isolation, dirty detection, recovery, navigation guarding, and editor hierarchy.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 30 tests.

**Defect impact:** Instruction work can no longer disappear silently during row changes or reloads, and the editor now presents writing and behavior controls as an understandable form instead of one undifferentiated block.

**Next plan step:** Granular Phase 11, step 11.3, scope picker and object targeting.
### 2026-08-26 - Granular Phase 11.3: Instruction Scope And Object Picker

**Status:** Completed.

**Plan reference:** Granular Phase 11, step 11.3, scope/object picker.

**Implementation:**

- Added Global and Project to the save contract and preserved both canonical scope kinds in the API translator.
- Added all supported scope choices to the editor: Global, Project, Flow, Router, Subflow, node, on-error, and adaptation review.
- Replaced object-ID entry with the shared accessible searchable Combobox using object names and descriptions.
- Lazily loads Router or SQL-paged Subflow targets only when the chosen scope requires them.
- Uses the current graph's named node inventory for node-scoped guidance.
- Added Flow/subflow/node target-level selection for on-error guidance and Flow/subflow targeting for adaptation review.
- Added explicit missing-target validation, inline errors, loading/error states, and save prevention.
- Added responsive target-control and selected-scope summary styling.
- Added API regressions for every scope translation and UI regressions for target validation and picker wiring.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- pnpm --filter fluxiq check passed.
- Workspace view suite passed: 31 tests.
- Focused instruction scope API suite passed: 2 tests.

**Defect impact:** Users choose instruction ownership from recognizable Flow objects instead of entering internal identifiers, and canonical Global/Project instructions no longer degrade into Flow scope when saved.

**Next plan step:** Granular Phase 11, step 11.4, importance, requirement, status, and templates.
### 2026-08-26 - Granular Phase 11.4: Importance, Requirement, Status, And Templates

**Status:** Completed.

**Plan reference:** Granular Phase 11, step 11.4, importance, requirement, status, and templates.

**Implementation:**

- Replaced raw priority-first editing with Low, Normal, High, and Critical importance levels.
- Preserved a bounded 0-100 numeric priority override behind an explicit advanced control.
- Replaced plain requirement and lifecycle selects with visible, accessible segmented controls and pressed state.
- Clarified that Required guidance is a runtime constraint while Advisory guidance can be weighed contextually.
- Added seven editable starter templates for Flow goals, safety constraints, error recovery, Router guidance, Subflow rules, node guidance, and adaptation review.
- Templates populate title, body, scope, importance, and requirement without hiding the resulting editable values.
- Added responsive template, segmented-control, and advanced-priority styling.
- Added focused mappings/template/control regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 32 tests.

**Defect impact:** Authors can express instruction strength and lifecycle in familiar terms and can begin from useful guidance patterns instead of a sparse blank editor or an unexplained numeric priority.

**Next plan step:** Granular Phase 11, step 11.5, effective precedence and inheritance preview.
### 2026-08-26 - Granular Phase 11.5: Effective Precedence And Inheritance Preview

**Status:** Completed.

**Plan reference:** Granular Phase 11, step 11.5, effective precedence and inheritance preview.

**Implementation:**

- Replaced the cramped always-visible library/editor split with Library, Editor, and Effective Preview inner views.
- Preserved dirty-draft navigation guarding across inner-view changes.
- Opens selected and new instructions directly in Editor while returning leaves the draft intact unless explicitly discarded.
- Loads full instruction bodies only when Effective Preview is opened and rejects stale responses.
- Mirrors runtime ordering: broad-to-specific scope, higher importance within scope, then stable update/ID ordering.
- Excludes disabled and archived instructions from the active effective sequence.
- Labels inherited Global/Project guidance separately from Flow-owned guidance.
- Resolves Router, Subflow, and node targets to friendly visible names instead of exposing IDs in the preview.
- Added clear precedence guidance plus loading, retryable error, and create-first-instruction empty states.
- Added stable responsive scrolling, tab overflow, and ordered-row styling.
- Added focused runtime-order and inner-view regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 33 tests.

**Defect impact:** Users can now understand exactly which active guidance reaches the runtime, where it came from, and the order in which it is applied without mixing that task into library browsing or editing.

**Next plan step:** Granular Phase 11, step 11.6, conflict, shadow, and token diagnostics.
### 2026-08-26 - Granular Phase 11.6: Conflict, Shadow, And Token Diagnostics

**Status:** Completed.

**Plan reference:** Granular Phase 11, step 11.6, conflict/shadow/token diagnostics.

**Implementation:**

- Replaced the single broad keyword check with scoped, severity-based diagnostics.
- Detects Required same-target always/never conflicts.
- Detects duplicate guidance after whitespace and case normalization.
- Detects lower-importance same-title guidance that may be shadowed on the same target.
- Warns when one instruction is unusually large.
- Warns near the 2,000-token runtime instruction budget and errors when the effective set exceeds it.
- Added live approximate token meters to the draft and Effective Preview.
- Shows actionable titles, explanations, severity badges, and affected instruction names instead of leading with diagnostic codes.
- Added separate Draft Checks and Effective Set Checks surfaces with responsive progress and severity styling.
- Added focused regressions for every diagnostic class and token estimation.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 34 tests.

**Defect impact:** Instruction authors can see why guidance is ambiguous, redundant, overridden, or too large before a run depends on it, while still retaining exact affected-instruction detail.

**Next plan step:** Granular Phase 11, step 11.7, readiness links, save, and authorization.
### 2026-08-26 - Granular Phase 11.7: Readiness, Save, And Authorization

**Status:** Completed.

**Plan reference:** Granular Phase 11, step 11.7, readiness links, save, and authorization.

**Implementation:**

- Removed the browser Authorization PIN prompt from instruction saving.
- Added an in-product Authorize Instruction Save modal using the established PIN-only write check.
- Keeps the authorization modal and local draft intact when authorization or persistence fails.
- Added explicit Saved, Unsaved changes, Saving, and Save failed states.
- Added a sticky editor footer with Discard Changes and Save Instruction commands.
- Prevents no-op, incomplete, invalid-target, and concurrent saves.
- Added a first-run readiness banner when a Flow has no instructions, with direct creation and template-browsing actions.
- Successful save clears recovery state, refreshes the SQL library, invalidates Effective Preview, and dispatches fluxiq:instructions-changed for surrounding readiness consumers.
- Added responsive readiness, state, footer, and authorization styling.
- Added focused regressions proving the prompt is gone and readiness/save/authorization controls are present.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 35 tests.
- Focused instruction scope API suite passed: 2 tests.

**Defect impact:** Instruction creation is now a complete user workflow with readiness guidance, recoverable editing, visible persistence state, and consistent in-product authorization instead of disruptive browser dialogs.

**Phase result:** Granular Phase 11 is complete.

**Next plan step:** Granular Phase 12, step 12.1, Settings section navigation and sticky form footer.
### 2026-08-26 - Granular Phase 12.1: Settings Navigation And Sticky Form Footer

**Status:** Completed.

**Plan reference:** Granular Phase 12, step 12.1, section navigation and sticky form footer.

**Implementation:**

- Added persistent anchored section navigation to both Flow and Subflow Settings.
- Added stable IDs for every existing settings section and smooth local navigation.
- Uses a side index on wide screens and a horizontally scrollable section strip on narrow screens.
- Added canonical loaded/saved draft comparison for Flow and Subflow forms.
- Added Saved and Unsaved changes state in each settings header.
- Removed duplicate header save commands.
- Added one sticky footer per form with Discard Changes and context-specific Save commands.
- Save is disabled until a real draft change exists; discard returns to the last loaded/saved values.
- Kept save controls out of Subflow loading/no-selection states.
- Added responsive navigation/footer styling and focused dirty/navigation/footer regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 36 tests.

**Defect impact:** Large settings forms are now navigable, expose one predictable save location, and clearly distinguish persisted values from unsaved edits in both Flow and Subflow contexts.

**Next plan step:** Granular Phase 12, step 12.2, General and Runtime settings.
### 2026-08-26 - Granular Phase 12.2: General And Runtime Settings

**Status:** Completed.

**Plan reference:** Granular Phase 12, step 12.2, General and Runtime.

**Implementation:**

- Upgraded General with required-name feedback, a bounded description/count, and explicit Private/Public composite visibility.
- Replaced the terse training-mode select with readable intervention choices and Fully adaptive as the canonical default.
- Preserved fixed-run, until-stable, and no-LLM modes with plain-language consequences.
- Shows training-run and stability-target inputs only for the modes that use them.
- Added canonical Flow timeout and maximum concurrency controls backed by executionDefaults.
- Converts the user-facing timeout in seconds to persisted milliseconds without losing other execution defaults.
- Added bounds for timeout, concurrency, fixed training count, and stability target.
- Added field-level invalid state, a blocking validation summary, and save-handler enforcement.
- Added responsive mode cards, unit inputs, help text, and validation styling.
- Added focused General/Runtime validation and rendering regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 37 tests.

**Defect impact:** Basic Flow identity and execution behavior are now understandable and safely editable, with adaptive behavior visible as the default and invalid runtime limits prevented before persistence.

**Next plan step:** Granular Phase 12, step 12.3, LLM provider, model, and secret settings.
### 2026-08-26 - Granular Phase 12.3: LLM Provider, Model, And Secret

**Status:** Completed.

**Plan reference:** Granular Phase 12, step 12.3, LLM provider/model/secret.

**Implementation:**

- Replaced the free-text provider field with a controlled provider catalog including DeepSeek.
- Added provider-specific model choices and preserves a previously configured custom model as a named current option.
- Added llmModel and llmSecretKeyId to canonical Flow metadata persistence.
- Loads only non-sensitive encrypted-key summaries through secret-keys/snapshot.
- Filters keys to enabled LLM entries matching provider and Global or current-Flow scope.
- Uses the shared searchable Combobox to select a key by name; users never enter internal IDs.
- Never requests, stores, or renders decrypted secret values in Automation Studio.
- Handles Host default and Ollama as no-key-required connections.
- Added loading, unavailable, missing, disabled/wrong-provider/wrong-scope validation and direct Key Manager links.
- Moved adaptation policy out of the LLM section into a controlled named choice under Adaptations.
- Added responsive key-status/picker styling and focused provider/model/DeepSeek/key regressions.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 38 tests.

**Defect impact:** Flow authors can configure an actual LLM connection without typing provider, model, key, or policy identifiers, while encrypted values remain exclusively owned by the global key manager.

**Next plan step:** Granular Phase 12, step 12.4, adaptation, approval, and training settings.
### 2026-08-26 - Granular Phase 12.4: Adaptation, Approval, And Training

**Status:** Completed.

**Plan reference:** Granular Phase 12, step 12.4, adaptation/approval and training.

**Implementation:**

- Removed duplicate adaptation approval controls from Runtime and safety panels.
- Added one Adaptation behavior selector with Fully adaptive as the default, plus Observe only, Locked, and Broad autonomy.
- Made presets apply their complete dependent permission set instead of changing a label only.
- Added one mutually exclusive approval control: Automatic, Manual for risky, or Manual only.
- Automatic remains limited to validated low-risk changes; structural/destructive safeguards remain explicit.
- Manual only disables automatic promotion and synchronizes training/adaptation approval metadata.
- No LLM intervention now disables LLM invocation, adaptation creation, and promotion together.
- Other training modes re-enable LLM and adaptation creation consistently.
- Preserved first-adaptation and structural/destructive review controls in the Adaptations section.
- Added invalid-combination diagnostics for deterministic/adaptive, creation/promotion, and manual/automatic contradictions.
- Added focused preset/training/approval consistency regressions and updated prior UI assertions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 39 tests.

**Defect impact:** Adaptation behavior is now one coherent system instead of several contradictory switches, with Fully adaptive as the visible default and manual/no-LLM choices enforcing their actual consequences.

**Next plan step:** Granular Phase 12, step 12.5, limits, safety, inputs/outputs, and dependencies.

### 2026-08-26 - Granular Phase 12.5: Limits, Safety, Interfaces, And Dependencies

**Status:** Completed.

**Plan reference:** Granular Phase 12, step 12.5, limits/safety/inputs/outputs/dependencies.

**Implementation:**

- Added bounded LLM, adaptation, retry-per-action, recovery-per-subflow, and reroute-per-run controls with blocking validation.
- Added the three recovery limits to canonical framework defaults and nested settings metadata.
- Merged recovery defaults per field and passed configured values into the graph executor's recovery budget.
- Consolidated safety controls around deterministic recovery, structural review, and destructive approval.
- Removed side-effect authorization switches from Flow Settings; runtime capability grants remain host-owned and read-only.
- Replaced interface JSON/ID editing with responsive typed input and output rows using names, types, defaults, descriptions, required input flags, generated internal IDs, add, and remove commands.
- Added duplicate-name, missing-name, numeric-default, structured-default, and numeric-bound validation.
- Added friendly published Flow/version dependency selection for code Flows and graph-derived dependency summaries for visual Flows.
- Preserved authorized domain grants as read-only technical context rather than an unsafe bypass control.
- Added responsive flat-row styling for interface and dependency collections.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- pnpm --filter fluxiq check passed.
- Workspace view suite passed: 40 tests.
- Runtime service suite passed: 76 tests.

**Defect impact:** Flow authors can now configure execution bounds, reusable contracts, and dependencies without typing internal IDs or raw settings JSON, and the recovery limits shown in Settings actually govern runtime execution.

**Next plan step:** Granular Phase 12, step 12.6, defaults, inherited values, overrides, and effective-value reset controls.
### 2026-08-26 - Granular Phase 12.6: Effective Defaults, Inheritance, And Overrides

**Status:** Completed.

**Plan reference:** Granular Phase 12, step 12.6, effective/default/inherited/override behavior.

**Implementation:**

- Replaced the ordinary Flow Settings JSON dump with a friendly Effective Values surface.
- Shows resolved Runtime, LLM, Adaptation, and Limit values with Framework default or Flow override source badges.
- States the actual inheritance model: framework defaults plus Flow overrides; no fictional project-default layer is shown.
- Classifies effective deviations instead of key presence so historically materialized default values are not mislabeled as user overrides.
- Added Use Default actions only for meaningful resettable overrides.
- Reworked Settings persistence to write controlled defaults sparsely while retaining unrelated metadata, execution properties, and runtime grants.
- Resetting timeout, concurrency, LLM, adaptation, approval, budget, or recovery fields now removes the corresponding default-valued override on save.
- Kept technical metadata opt-in and lazy so collapsed content does not render a potentially large JSON payload.
- Added a responsive effective-value row layout and focused source/reset/persistence regressions.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 41 tests.

**Defect impact:** Users can understand what the runtime will actually use, distinguish defaults from Flow-specific behavior, and return settings to inheritance without raw JSON or misleading source labels.

**Next plan step:** Granular Phase 12, step 12.7, Subflow mappings, instructions, approval, and lifecycle.
### 2026-08-26 - Granular Phase 12.7: Subflow Mappings, Instructions, Approval, And Lifecycle

**Status:** Completed.

**Plan reference:** Granular Phase 12, step 12.7, Subflow mappings/instructions/approval/lifecycle.

**Implementation:**

- Loads the canonical subflow, parent Flow contract, compact Flow instruction summaries, and parent Router together.
- Replaced newline-separated local instruction IDs with a searchable title-based picker and removable named bindings.
- Preserves unavailable saved bindings as an explicit missing-reference state without requiring ID entry.
- Replaced free-text boundary mapping IDs with typed named parent-Flow and subflow port selectors.
- Shows friendly Text, Number, Yes / No, and Structured type labels in mapping choices.
- Blocks missing-port, duplicate-pair, incompatible-type, and empty-name settings.
- Disables mapping creation until both interface sides define named ports.
- Replaced the approval select with explicit Inherit, Automatic, Manual for risky, and Manual only controls.
- Shows the effective parent approval behavior when inheritance is selected.
- Shows parent Router references as read-only named rules; Subflow Settings does not edit top-level routing.
- Added Active, Disabled, and Archived lifecycle controls backed by the existing dedicated mutations.
- Moved parent/subflow/graph IDs into collapsed technical ownership details.
- Added responsive binding-list spacing and focused draft/mapping/validation regressions.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 42 tests.

**Defect impact:** Subflow authors can configure boundaries, guidance, approval, and lifecycle by recognizable objects and types without typing internal IDs, while Router ownership remains unambiguous.

**Next plan step:** Granular Phase 12, step 12.8, validation, authorization, save/conflict behavior, and Settings deep links.
### 2026-08-26 - Granular Phase 12.8: Validation, Authorization, Conflict, And Deep Links

**Status:** Completed.

**Plan reference:** Granular Phase 12, step 12.8, validation/save/conflict and Settings deep links.

**Implementation:**

- Added a validated settingsSection URL query contract for Flow and Subflow Settings.
- Restores the selected section on entry, scrolls to it, and updates history when section navigation changes.
- Added beforeunload protection for dirty Flow and Subflow Settings drafts.
- Removed native PIN prompts from both Settings forms.
- Save now opens an in-product PIN-only authorization modal after the user invokes the write.
- Authorization errors stay inside the modal and preserve every draft field.
- Flow saves send expectedUpdatedAt through the existing canonical save-flow conflict contract.
- Added expectedUpdatedAt to Subflow Settings requests, handlers, and service input.
- The service rejects stale Subflow writes with SUBFLOW_SAVE_CONFLICT before canonical mutation.
- Conflict messages explain that another edit won and keep the local draft available for review.
- Successful saves close authorization, clear the PIN, refresh the loaded base revision, and emit scoped change events.
- Existing blocking validation remains enforced both before opening and while submitting saves.
- Added focused deep-link, native-dialog-removal, expected-revision, and stale-write preservation regressions.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- pnpm --filter fluxiq check passed.
- Workspace view suite passed: 43 tests.
- Runtime service suite passed: 77 tests.

**Defect impact:** Settings now behave like reliable application forms: links restore the intended section, unsafe native prompts are gone, unsaved work is guarded, and concurrent edits cannot silently overwrite canonical Flow or Subflow state.

**Phase result:** Granular Phase 12 is complete.

**Next plan step:** Granular Phase 13, step 13.1, typed runtime inputs and readiness.
### 2026-08-26 - Granular Phase 13.1: Typed Runtime Inputs And Readiness

**Status:** Completed.

**Plan reference:** Granular Phase 13, step 13.1, typed schema inputs and readiness.

**Implementation:**

- Replaced string-only declared inputs with controls generated from canonical Flow interface ports.
- Added Text, Number, Yes / No, and Structured input controls with friendly names and descriptions.
- Preserves number, boolean, object, and list values as typed JSON in the runtime payload.
- Seeds declared Flow input defaults when the selected Flow changes.
- Supports up to 50 declared inputs without the former eight-field truncation.
- Added required, number, boolean, and structured-data validation with inline field errors.
- Runtime launch now loads effective instructions, parent Router, and active Subflow count before enabling Run.
- Blocks execution without active guidance or without runnable Nodes/an active routed Subflow path.
- Readiness failures include direct Open Instructions, Open Nodes, Open Router, or Open Problems actions.
- Loading and ready states are explicit; readiness request failures cannot silently allow a run.
- Added responsive readiness styling and focused typed-input/readiness regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 44 tests.

**Defect impact:** Running a Flow no longer requires hidden JSON/string coercion, and incomplete Flow setup is caught with actionable fixes before an invalid runtime request starts.

**Next plan step:** Granular Phase 13, step 13.2, adaptive/manual/deterministic mode control.
### 2026-08-26 - Granular Phase 13.2: Adaptive, Manual, And Deterministic Run Modes

**Status:** Completed.

**Plan reference:** Granular Phase 13, step 13.2, adaptive/manual/deterministic mode control.

**Implementation:**

- Replaced the compact mode dropdown with three simultaneously visible mode choices.
- Fully adaptive remains selected by default and uses the saved policy with safe validated auto-application.
- Manual approval allows LLM assistance while queuing every adaptation for review.
- No LLM intervention runs only saved deterministic behavior.
- Each mode states its runtime consequence directly and exposes aria-pressed selection state.
- Mode changes are disabled while a run request is active, preserving one stable choice per launch.
- Kept one primary Run command instead of mode-specific run/repair actions.
- Added responsive single-column behavior on narrow screens and updated focused regressions.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 44 tests.

**Defect impact:** Users can compare and deliberately choose all supported intervention modes without hidden repair semantics or multiple competing run commands.

**Next plan step:** Granular Phase 13, step 13.3, progress, Stop, retry, and Live Log.
### 2026-08-26 - Granular Phase 13.3: Progress, Stop, Retry, And Live Log

**Status:** Completed.

**Plan reference:** Granular Phase 13, step 13.3, progress/Stop/retry/Live Log.

**Implementation:**

- Changed runtime launch from one opaque blocking request to start-runtime-session followed by run-runtime-session using the queued run ID.
- Stores the active run ID before execution begins so cancel-runtime-session can target an in-process run.
- Added an elapsed-seconds progress state and explicit Run in progress status.
- Added Stop while a run is active.
- Added Open Live Log, which focuses Runtime Debug on the queued/active run ID.
- Added Retry Run using the same typed inputs and last selected intervention mode.
- Prevents mode changes and duplicate launches while the current request is active.
- Clears active progress only after the run request resolves and preserves completion/error summaries.
- Added responsive active-run controls and a focused queue/run/cancel ordering regression.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 45 tests.

**Defect impact:** Runtime controls now own a cancellable run identity while work is happening, so Stop and Live Log are functional instead of appearing only after execution has already finished.

**Next plan step:** Granular Phase 13, step 13.4, shared Run History.
### 2026-08-26 - Granular Phase 13.4: Shared Run History

**Status:** Completed.

**Plan reference:** Granular Phase 13, step 13.4, shared Run History.

**Implementation:**

- Replaced the private Runtime Debug list controller with the exported shared `RuntimeRunHistory` component.
- Runtime Debug and the Runs workspace now render the same list, paging, selection, and detail-loading implementation.
- Consolidated UI reads onto the canonical SQL-backed `list-flow-runs` summary endpoint.
- Flow Runtime Debug supplies `flowId`; the global Runs workspace intentionally requests project-wide history.
- Filters initial in-memory sessions to the active Flow before the first SQL response, preventing unrelated-run flashes.
- Preserves one-row click-through into the compact run-detail endpoint and existing inner list/log navigation.
- Corrected readiness navigation so a Flow with Subflows but no active route points to Router setup.
- Updated authored workspace documentation and focused regressions.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 46 tests.

**Defect impact:** Runtime Debug and Runs can no longer drift into separate history implementations, and Flow-scoped history does not briefly show project-wide rows while loading.

**Next plan step:** Granular Phase 13, step 13.5, SQL filters, sort, page size, and stable ordering.
### 2026-08-26 - Granular Phase 13.5: SQL Filters, Sort, Page Size, And Stable Ordering

**Status:** Completed.

**Plan reference:** Granular Phase 13, step 13.5, SQL filters, sort, page size, and stable ordering.

**Implementation:**

- Extended `list-flow-runs` with optional status, case-insensitive run/Flow ID search, sort, and direction parameters.
- Applies Flow/status/search clauses, total count, allowlisted sort expressions, and limit/offset inside SQLite.
- Added updated, started, duration, action-count, and status sort modes with deterministic run-ID tie-breaking.
- Preserved equivalent filtering, sorting, tie-breaking, and paging in the in-memory service fallback.
- Added visible search, status, sort, direction, and 10/25/50/100 row controls to shared Run History.
- Added First, Previous, Next, Last, and current-page context in the bottom pagination footer.
- Server pages retain their requested order; the client no longer re-sorts alternate SQL results.
- Added filtered-empty, retry, responsive layout, compact action-count compatibility, and busy-state behavior.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter fluxiq check passed.
- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 46 tests.
- Runtime service suite passed: 77 tests.

**Defect impact:** Large run histories can now be searched, filtered, sorted, and deeply paged without loading or filtering the project history in the browser, and equal-sort rows no longer drift between pages.

**Next plan step:** Granular Phase 13, step 13.6, Runtime Runs versus Replays composition.
### 2026-08-26 - Granular Phase 13.6: Runtime Runs Versus Replays Composition

**Status:** Completed.

**Plan reference:** Granular Phase 13, step 13.6, Runtime Runs versus Replays composition.

**Implementation:**

- Replaced the stacked Runtime History plus Replay table with two mutually exclusive inner modes.
- Runtime Runs is the default and renders only the shared SQL-backed Run History.
- Replays renders recording/policy validation rows in its own scrollable view.
- Added an accessible pressed-state mode group with explicit Runtime Runs and Replays labels.
- The Runs subtitle changes with the selected mode instead of presenting both workflows as one list.
- Removed the mixed statistics strip that combined runtime and replay counts from partial in-memory data.
- Added narrow-screen stacking and focused default-composition coverage.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 47 tests.

**Defect impact:** Runtime debugging and replay validation no longer compete in one long page, and opening Runs lands directly on the primary executable history workflow.

**Next plan step:** Granular Phase 13, step 13.7, live updates without flicker or reorder surprise.
### 2026-08-26 - Granular Phase 13.7: Live Updates Without Flicker Or Reorder Surprise

**Status:** Completed.

**Plan reference:** Granular Phase 13, step 13.7, live updates without flicker or reorder surprise.

**Implementation:**

- Added monotonic request sequencing so stale history responses cannot replace a newer query/page.
- Keeps the current rows mounted during foreground loads and quiet background refreshes.
- Polls the visible list every three seconds and pauses work while the browser tab is hidden.
- Refreshes immediately when the tab becomes visible again.
- Emits scoped runtime-history events when a run is queued, completes/fails, or is cancelled.
- Listens for project/Flow-matching runtime events and quietly refreshes the current SQL page.
- Initial in-memory rows seed only on project/Flow scope changes; later parent snapshots cannot override server sorting.
- Preserves current page, filters, sort, and rows throughout live refreshes.
- Updated authored workspace documentation and focused regressions.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 47 tests.

**Defect impact:** Run History no longer flashes empty, reverses order, or accepts stale responses while active runs and filter changes overlap.

**Next plan step:** Granular Phase 14, step 14.1, Run Detail overview.
### 2026-08-26 - Granular Phase 14.1: Run Detail Overview

**Status:** Completed.

**Plan reference:** Granular Phase 14, step 14.1, Overview.

**Implementation:**

- Retained the human-readable run headline and deterministic/recovery/LLM/adaptation/retry story.
- Added a compact Overview fact grid before action inspection.
- Shows exact started and finished timestamps plus elapsed duration.
- Shows the executed Flow version when available and a clear current-version fallback.
- Normalizes saved/default/manual/deterministic intervention modes into user-facing labels.
- Shows the terminal failure/reason/message before falling back to status.
- Preserved status, action, recovery, LLM, token, cost, adaptation, and durable-change metrics.
- Added responsive single-column behavior and focused Overview assertions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 47 tests.

**Defect impact:** A user can now understand when, how, and under which intervention policy a run ended before reading individual action records or raw JSON.

**Next plan step:** Granular Phase 14, step 14.2, server-paged Actions.
### 2026-08-26 - Granular Phase 14.2: Server-Paged Actions

**Status:** Completed.

**Plan reference:** Granular Phase 14, step 14.2, server-paged Actions.

**Implementation:**

- Added `list-flow-run-actions` with clamped 1-100 limit/offset pages and compact page metadata.
- Canonical Run Detail saves now persist ordered action attempts to a dedicated `actions.jsonl` sequence mirror.
- Reads stream only until the requested action window is filled instead of hydrating the full sequence.
- Uses the compact SQL run summary action count for totals.
- Lazily repairs pre-migration runs whose action sequence mirror is missing.
- Preserved equivalent in-memory paging behavior.
- Added a compact Run Detail request that omits embedded action attempts for normal UI opens.
- Runtime Action Log now requests and renders 50 server-paged rows with retained rows, busy state, errors, Retry, Previous, and Next.
- Story and header counts use the compact run summary rather than requiring embedded actions.
- Added ordered offset-page persistence coverage and UI contract regressions.
- Updated authored workspace and persistence documentation.

**Validation:**

- pnpm --filter fluxiq check passed.
- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 47 tests.
- Runtime service suite passed: 77 tests.

**Defect impact:** Opening a large run no longer transfers or renders every action in the browser, while action order and page boundaries remain durable and directly testable.

**Next plan step:** Granular Phase 14, step 14.3, action detail drawer and inner views.
### 2026-08-26 - Granular Phase 14.3: Action Detail Inspector And Inner Views

**Status:** Completed.

**Plan reference:** Granular Phase 14, step 14.3, action detail drawer and inner views.

**Implementation:**

- Preserved action attempts as compact single-line rows with no expandable row body.
- Made rows selectable by pointer, Enter, and Space with visible selected/focus states.
- Replaced per-row Details JSON controls with one selected-action inspector.
- Added Summary, Data, Effects, State, and Raw JSON inner modes.
- Summary exposes status, node, definition, route, region, timing, and message in friendly fields.
- Data separates Inputs and Outputs; Effects lists emitted effects; State separates before/after/diff references.
- Raw JSON remains explicit and opt-in after an action is selected.
- Added an icon close command with accessible name and tooltip.
- Wide layouts place detail beside the scrollable list; narrow layouts place it below without clipping.
- Changing action pages closes stale detail and resets the inspector mode.
- Updated authored workspace documentation and focused regressions.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 47 tests.

**Defect impact:** Detailed action inspection is now stable and user-directed without turning the log into a stack of expanded JSON blocks or causing row-height churn.

**Next plan step:** Granular Phase 14, step 14.4, Recovery and Routing.
### 2026-08-26 - Granular Phase 14.4: Recovery And Routing

**Status:** Completed.

**Plan reference:** Granular Phase 14, step 14.4, Recovery and Routing.

**Implementation:**

- Replaced the flat Recovery Ladder table with one Recovery and Routing decision timeline.
- Includes persisted Router decisions that were previously absent from Run Detail UI.
- Merges route and recovery records in chronological order with stable ID tie-breaking.
- Distinguishes normal route selection, Router fallback, and recovery-candidate selection.
- Shows selected target, outcome status, recorded explanation, fallback state, and rejected-alternative count.
- Added direct Open Router and selected-Subflow links.
- Keeps raw decision JSON opt-in for technical inspection.
- Added responsive timeline layout and focused chronology/target regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 48 tests.

**Defect impact:** Users can now see how routing and deterministic recovery unfolded, including fallbacks and rejected options, instead of decoding disconnected IDs from a generic table.

**Next plan step:** Granular Phase 14, step 14.5, LLM and Adaptation.
### 2026-08-26 - Granular Phase 14.5: LLM And Adaptation

**Status:** Completed.

**Plan reference:** Granular Phase 14, step 14.5, LLM and Adaptation.

**Implementation:**

- Consolidated separate LLM and Adaptation tables into one ordered assistance sequence.
- Starts with each intervention rationale, provider, model, token usage, and estimated cost.
- Continues through candidate patch-test status and recorded validation explanation.
- Shows every created adaptation with approval context and a direct Open Adaptation link.
- Ends with deterministic retry status and action count when a retry occurred.
- Preserves diagnosis -> patch test -> adaptation -> retry stage order even when records lack timestamps.
- Keeps raw JSON opt-in per stage instead of presenting full intervention objects by default.
- Provides an explicit no-intervention/adaptation empty state for deterministic runs.
- Added responsive sequence styling and focused stage/provider/model/usage/link regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 49 tests.

**Defect impact:** Users can follow the complete LLM-assisted adaptation lifecycle in one readable order instead of correlating interventions, patch metadata, adaptations, and retries across unrelated sections.

**Next plan step:** Granular Phase 14, step 14.6, State and Effects.
### 2026-08-26 - Granular Phase 14.6: State And Effects

**Status:** Completed.

**Plan reference:** Granular Phase 14, step 14.6, State and Effects.

**Implementation:**

- Replaced the capped generic Runtime Effects table and standalone final-values block with one State and Effects view.
- Added explicit Effects and State mode controls.
- Derives ordered effect records from canonical run effects, compatibility traces, or compact visible action records.
- Pages effects in 50-row windows with payload detail on demand.
- Derives named Starting state, Before action, After action, and State diff evidence records.
- Shows action, phase, friendly reference, and opt-in reference detail.
- Added a direct run-scoped Open State Viewer link.
- Keeps potentially large final state values opt-in with a key count.
- Added responsive mode/header behavior and focused evidence derivation regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 50 tests.

**Defect impact:** State transitions and side effects are now discoverable in user-facing phases with direct State Viewer access, while payloads and final values remain controlled instead of dominating initial render.

**Next plan step:** Granular Phase 14, step 14.7, Audit and large export.
### 2026-08-26 - Granular Phase 14.7: Audit And Large Export

**Status:** Completed.

**Plan reference:** Granular Phase 14, step 14.7, Audit and large export.

**Implementation:**

- Kept export completeness server-owned and independent of the currently loaded action page.
- Added an audit manifest with action, recovery, route, Subflow, intervention, adaptation, and evidence counts.
- Added SHA-256 integrity metadata for the complete serialized Run Detail.
- Preserved referenced adaptation patches, validation, approval, mutation before/after/rollback evidence, and retention policy.
- Added explicit Preparing, ready-with-action-count, and error states and disables duplicate export requests.
- Moves large JSON serialization into a short-lived browser Worker when supported.
- Keeps a Blob-based synchronous compatibility fallback without coupling serialization to render.
- Revokes worker and download object URLs and terminates workers after use.
- Added service manifest/integrity and browser serialization regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter fluxiq check passed.
- pnpm --filter @fluxiq/web check passed.
- Workspace view suite passed: 51 tests.
- Runtime service suite passed: 77 tests.

**Defect impact:** Large audit bundles remain complete and verifiable without synchronously stringifying them on the UI render path or exporting only the visible action page.

**Next plan step:** Granular Phase 14, step 14.8, 10,000-action stress validation.
### 2026-08-26 - Granular Phase 14.8: 10,000-Action Stress Validation

**Status:** Completed.

**Plan reference:** Granular Phase 14, step 14.8, 10,000-action stress validation.

**Implementation:**

- Added a production-path persisted Run Detail containing 10,000 ordered compact action attempts.
- Exercises the canonical Run Detail writer and dedicated `actions.jsonl` sequence mirror.
- Reads the final deep page at offset 9,950 through `listFlowRunActions`.
- Asserts exactly 50 rows, total 10,000, and exact first/last attempt IDs and order values.
- Caps the serialized page response below 100 KiB.
- Enforces a 1.5-second local deep-page read budget.
- Confirms the stress fixture does not require loading all actions into the returned page.
- Updated authored persistence documentation.

**Validation:**

- pnpm --filter fluxiq check passed.
- Runtime service suite passed: 78 tests, including the 10,000-action gate.

**Defect impact:** The exact large-run scenario that previously froze the browser now has a durable bounded-response and latency regression gate at the server paging boundary.

**Next plan step:** Granular Phase 15, step 15.1, State source/phase controls and data loading.
### 2026-08-26 - Granular Phase 15.1: State Source And Phase Controls And Data Loading

**Status:** Completed.

**Plan reference:** Granular Phase 15, step 15.1, source/phase controls and data loading.

**Implementation:**

- Restored the visible State View header with active context title and source/phase subtitle.
- Restored summary counts for facts, evidence, strong/weak evidence, and runtime mismatches.
- Added a controlled source selector containing all loaded observed, learned, runtime, and indexed sources.
- Added visible Input, Action, Expected Output, and Actual Output phase choices.
- Disables Actual Output for non-runtime sources with an availability explanation.
- Switching away from runtime Actual Output safely resets to Input when required.
- Source/phase changes clear stale evidence/fact focus and propagate through the canonical State selection.
- Controls remain disabled during exact requested-state loading; the existing non-blocking loading overlay remains scoped to the State workspace.
- Preserved requested-source exactness and no-source/no-facts states.
- Added responsive controls and updated focused State regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- State Viewer suite passed: 17 tests.

**Defect impact:** Users can now choose which state evidence and execution phase they are inspecting instead of being trapped on an implicitly selected visual source.

**Next plan step:** Granular Phase 15, step 15.2, visual canvas and collision-safe overlays.
### 2026-08-26 - Granular Phase 15.2: Visual Canvas And Collision-Safe Overlays

**Status:** Completed.

**Plan reference:** Granular Phase 15, step 15.2, visual canvas and collision-safe overlays.

**Implementation:**

- Retained stable aspect-ratio canvas geometry, bounded scrolling, and 25%-400% discrete zoom/reset controls.
- Retained screenshot/document coordinate translation, scroll offsets, viewport rectangle, clipping, and deterministic z-index behavior.
- Retained direct-rendered text fitting and collision suppression so parent/child or overlapping labels do not duplicate incoherently.
- Retained pointer plus Enter/Space fact/evidence overlay selection and selected-bound synchronization.
- Retained visual tones for controls, text, regions, mismatches, evidence, and interacted action targets.
- Retained contained image-load failure and no-visual-frame structured fallbacks.
- Added an explicit Document/Screenshot surface selector when both representations exist.
- Resets surface and zoom when the active source/phase changes.
- Omits the selector for single-surface evidence to avoid a dead control.
- Added focused dual/single-surface regressions and responsive control styling.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- State Viewer suite passed: 17 tests.

**Defect impact:** Dual visual evidence is no longer silently forced to Document, while existing collision, coordinate, zoom, and accessibility protections remain intact.

**Next plan step:** Granular Phase 15, step 15.3, Structured state.
### 2026-08-26 - Granular Phase 15.3: Structured State

**Status:** Completed.

**Plan reference:** Granular Phase 15, step 15.3, Structured state.

**Implementation:**

- Added a visible Visual/Structured State mode control.
- Wired the existing structured renderer into the primary State workspace instead of leaving it unreachable.
- Shows namespace, friendly path, formatted value, confidence, and source/type.
- Keeps the structured table bounded and independently scrollable.
- Makes each row pointer-, Enter-, and Space-selectable.
- Added a direct fact-path button without duplicating selection behavior.
- Structured fact selection propagates through the same canonical State selection and updates visual/evidence focus when returning to Visual.
- Preserved an explicit no-structured-facts row.
- Added hover/focus styling and focused mode visibility regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- State Viewer suite passed: 17 tests.

**Defect impact:** Structured facts are now a first-class usable view rather than dead renderer code hidden behind the Visual fallback.

**Next plan step:** Granular Phase 15, step 15.4, Diff and Compare.
### 2026-08-26 - Granular Phase 15.4: Diff And Compare

**Status:** Completed.

**Plan reference:** Granular Phase 15, step 15.4, Diff and Compare.

**Implementation:**

- Added visible Diff and Compare State mode choices.
- Diff is enabled only when the active source contains before/after deltas and explains why it is unavailable otherwise.
- Diff renders path, change kind, before/after values, and confidence in a bounded list.
- Compare is enabled only when runtime expected-vs-actual comparison exists and explains its runtime requirement otherwise.
- Compare summarizes matched, mismatched, and irrelevant facts.
- Comparison rows show expected -> actual, status, severity/score, and synchronize evidence/fact selection.
- Source/phase changes automatically return to Visual when the active Diff/Compare mode becomes invalid.
- Existing mismatch overlays and summary counts remain synchronized with Compare.
- Updated focused mode-selection regressions and authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- State Viewer suite passed: 17 tests.

**Defect impact:** Recorded deltas and expected-vs-actual runtime evidence are now reachable, availability-aware user views instead of dead renderer implementations.

**Next plan step:** Granular Phase 15, step 15.5, Evidence and cross-links.


### 2026-08-26 - Granular Phase 15.5: Evidence And Cross-Links

**Status:** Completed.

**Plan reference:** Granular Phase 15, step 15.5, Evidence and cross-links.

**Implementation:**

- Added one persistent Evidence Inspector beside the active State surface.
- Shows active source kind and ownership, selected fact path/value/confidence/time, and selected evidence role, comparator, expected value, confidence, and provenance.
- Keeps evidence bindings selectable without expanding canvas rows or duplicating detail panels.
- Cross-links observed sources to Recording Timeline, runtime sources to Run Log, and node-bound evidence to the Flow editor.
- Synchronizes fact and evidence selection across Visual, Structured, Diff, and Compare modes.
- Moves the inspector below the primary surface at narrow workspace widths while preserving independent scrolling.
- Replaced obsolete tests that required evidence context to be absent with persistent-inspector contracts.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- State Viewer suite passed: 17 tests.

**Defect impact:** Evidence ownership and provenance are now visible in the State workspace itself, with direct navigation back to the recording, run, or node that produced the fact.

**Next plan step:** Granular Phase 15, step 15.6, Raw detail and state repair.

### 2026-08-26 - Granular Phase 15.6: Raw Detail And State Repair

**Status:** Completed.

**Plan reference:** Granular Phase 15, step 15.6, Raw detail and state repair.

**Implementation:**

- Exposed Raw as an explicit State mode without rendering raw payloads into the initial Visual DOM.
- Preserved an opt-in Show raw JSON gate before serialization.
- Added a bounded Raw state detail surface with diagnostic context, clipboard copy, and accessible copy status.
- Added Retry state loading only for exact requested-state links that are not currently available.
- Reuses the canonical State selection contract for retries so timeline, snapshot, source, and phase identity are preserved.
- Suppresses duplicate retry actions while the exact state request is loading.
- Added focused missing-state, loading, and Raw discoverability regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- State Viewer suite passed: 18 tests.

**Defect impact:** Advanced JSON remains available without penalizing normal State views, and transient exact-state misses can be recovered from the UI without leaving the workspace.

**Next plan step:** Granular Phase 15, step 15.7, huge-state and failed-asset tests.

### 2026-08-26 - Granular Phase 15.7: Huge-State And Failed-Asset Tests

**Status:** Completed.

**Plan reference:** Granular Phase 15, step 15.7, huge-state and failed-asset tests.

**Implementation:**

- Added deterministic Visual render budgets of 200 image/layer records, 200 derived fact boxes, and 200 evidence overlays.
- Always retains prioritized image context and the selected fact/evidence item even when it falls beyond the initial budget.
- Reports how many visual items are hidden and directs users to Structured state for complete traversal.
- Added 100-row Structured state pagination with stable range and page controls.
- Kept image-load failures contained in the canvas and rejects malformed or unsafe asset references before assigning an image source.
- Added a 10,000-fact component regression that verifies the selected final fact remains visible and output stays bounded.
- Added direct 10,000-item render-budget and unsafe asset-reference regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- State Viewer suite passed: 19 tests in 118 ms.

**Defect impact:** Very large reconstructed states no longer create unbounded DOM trees, while selected context and access to every structured fact remain intact. Invalid visual assets fail locally without destabilizing the workspace.

**Phase result:** Granular Phase 15 is complete.

**Next plan step:** Granular Phase 16, step 16.1, Recording list/detail states and pagination.

### 2026-08-26 - Granular Phase 16.1: Recording List/Detail States And Pagination

**Status:** Completed.

**Plan reference:** Granular Phase 16, step 16.1, Recording list/detail states and pagination.

**Implementation:**

- Added explicit Recordings and Timeline inner views to the Recording workspace.
- Recordings opens a dedicated row-based list instead of requiring hierarchy-only discovery.
- Added loading, empty, error/retry, and populated list states.
- Entire recording rows open canonical Timeline detail and retain a clear route back to the list.
- Added stable finalized/open, event count, note count, start time, friendly name, and technical ID columns with narrow-layout reduction.
- Added bottom Previous/Next pagination with accurate empty, full, and partial-page ranges.
- Extended list-recordings with backward-compatible limit/offset support and a page envelope.
- Added index-level service pagination that sorts stably and slices before constructing summary records.
- Added stale-request rejection in the Recording list loader.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- pnpm --filter fluxiq check passed.
- Recording pagination contract suite passed: 1 test.

**Defect impact:** Users can now browse recording history inside the Recordings view without loading or rendering the complete recording collection, and selection leads to a distinct, usable detail surface.

**Next plan step:** Granular Phase 16, step 16.2, Timeline controls and keyboard operation.

### 2026-08-26 - Granular Phase 16.2: Timeline Controls And Keyboard Operation

**Status:** Completed.

**Plan reference:** Granular Phase 16, step 16.2, Timeline controls and keyboard operation.

**Implementation:**

- Made the timeline editor an explicitly labelled keyboard focus surface.
- Added Left/Right event movement and Home/End boundary navigation with safe empty and unselected behavior.
- Keyboard movement updates canonical timeline selection and scrolls the selected event into view.
- Added visible Previous event and Next event controls to the selected-event detail strip.
- Added a visible Open State command so state inspection no longer depends on clip double-click.
- Added accessible labels and pressed state to every overview marker.
- Preserved pointer clip selection and overview scrolling behavior.
- Added deterministic keyboard boundary regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Recording Timeline suite passed: 2 tests.

**Defect impact:** Every timeline event can now be traversed and opened for state inspection with keyboard-only operation, while pointer workflows remain intact.

**Next plan step:** Granular Phase 16, step 16.3, Notes, markers, rename, finalize, repair, and delete dialogs.

### 2026-08-26 - Granular Phase 16.3: Recording Action Dialogs

**Status:** Completed.

**Plan reference:** Granular Phase 16, step 16.3, Notes, markers, rename, finalize, repair, and delete dialogs.

**Implementation:**

- Added one accessible, focus-managed Recording action modal for rename, note, marker, finalize, state-index repair, and delete.
- Each action shows contextual intent/consequence copy and only its relevant value field plus PIN.
- Uses PIN-only authorization; no password or second factor is requested for these mutations.
- Added local required-value and PIN validation, busy state, Escape/cancel behavior, and destructive delete styling.
- Routed note and marker values through mutation callbacks instead of chained native prompts.
- Routed rename and finalize authorization through the modal instead of native prompts.
- Added a manual Repair Index command backed by repair-recording-state-index.
- Removed automatic state-open confirm/prompt repair and directs failures to the explicit Recording repair command.
- Removed native confirm/prompt fallback from Recording deletion.
- Added dialog-copy and forbidden native-dialog source regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Recording Timeline suite passed: 3 tests.

**Defect impact:** Recording maintenance is now coherent, keyboard accessible, and context preserving instead of a chain of blocking browser dialogs.

**Next plan step:** Granular Phase 16, step 16.4, Bottom timeline synchronization.

### 2026-08-26 - Granular Phase 16.4: Bottom Timeline Synchronization

**Status:** Completed.

**Plan reference:** Granular Phase 16, step 16.4, Bottom timeline synchronization.

**Implementation:**

- Kept the bottom action preview bound to canonical timeline/state-derived selected action IDs.
- Automatically centers the selected bottom action whenever selection or action count changes.
- Added full accessible action labels, interacted-target context, and pressed state.
- Added Left/Right/Home/End action movement with focus transfer to the newly selected preview button.
- Reused the same boundary contract as the full Recording Timeline.
- Preserved State View behavior: selecting a bottom action while State is active opens that action state and keeps preview focus synchronized.
- Added cross-surface keyboard synchronization regressions.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Recording Timeline suite passed: 4 tests.

**Defect impact:** The bottom preview no longer drifts off-screen or behaves as a separate selection system; it stays aligned with Timeline, State, and inspector context.

**Next plan step:** Granular Phase 16, step 16.5, Connected Clients and pairing.

### 2026-08-26 - Granular Phase 16.5: Connected Clients And Pairing

**Status:** Completed.

**Plan reference:** Granular Phase 16, step 16.5, Connected Clients and pairing.

**Implementation:**

- Added Approve and Reject commands beside pending client pairing reference codes.
- Reuses the global approve-pairing and dismiss-pairing endpoints and preserves unresolved requests after network failures.
- Reworded pairing guidance around reference-code verification instead of sending users to an unspecified popup.
- Replaced the ambiguous always-visible PIN field with command-specific PIN-only AuthorizationDialogs shown after Start, Stop, Send Action, or Revoke.
- Start and Stop availability now reflects the selected session active-recording state.
- Added loading feedback, disabled refresh while active, stale snapshot response rejection, and five-second polling.
- Polling starts only while the Connected Clients view is active and stops when hidden.
- Preserved safe trust metadata and explicit revocation consequences.
- Added focused pairing, polling, and authorization source contracts.
- Updated authored Client Gateway documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Connected Clients suite passed: 1 test.

**Defect impact:** Pairing and client control are now complete inside the view, while privileged commands have clear ownership and no longer share an unexplained credential field.

**Next plan step:** Granular Phase 16, step 16.6, recording-as-evidence language and legacy path cleanup.

### 2026-08-26 - Granular Phase 16.6: Recording-As-Evidence Language And Legacy Cleanup

**Status:** Completed.

**Plan reference:** Granular Phase 16, step 16.6, recording-as-evidence language and legacy path cleanup.

**Implementation:**

- Standardized normal Recording language around optional Flow evidence rather than proposal generation.
- Finalization now reports that the recording is available as optional Flow evidence.
- Removed obsolete Timeline callbacks for opening or generating recording proposals.
- Removed the now-unreachable normal-path openRecordingProposal and openRecordingProposalGenerator helpers.
- Kept persisted legacy Proposal and Proposal Generator view IDs renderable for saved workspace compatibility.
- Updated compatibility descriptions to read-only/retired language instead of advertising generation.
- Verified Proposal Generator remains absent from the normal workspace tab adder.
- Reworded client importer warnings as legacy recording-mapper compatibility.
- Added source-contract regressions for evidence language and dead callback removal.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Recording Timeline and workspace adder suites passed: 8 tests.

**Defect impact:** The current UI no longer teaches the retired recording-to-proposal workflow, while old saved artifacts remain understandable instead of breaking.

**Next plan step:** Granular Phase 16, step 16.7, Long timeline and event-stream performance.

### 2026-08-26 - Granular Phase 16.7: Long Timeline And Event-Stream Performance

**Status:** Completed.

**Plan reference:** Granular Phase 16, step 16.7, Long timeline and event-stream performance.

**Implementation:**

- Added fixed 200-event render windows for the full Timeline lanes and overview.
- Selection automatically switches to the owning event window before centering the selected clip.
- Added explicit Previous events and Next events controls with visible event ranges.
- Replaced five-lane complete-event multiplication with visible-window rendering.
- Added a selected-centered 200-action render window to the bottom preview rail.
- Preserved global action numbering, selected context, keyboard movement, and state synchronization across window boundaries.
- Added concise visible range feedback to both full Timeline and bottom preview.
- Added 10,000-event and 10,000-action window regressions plus source contracts forbidding unbounded render loops.
- Updated authored workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Recording Timeline suite passed: 6 tests.

**Defect impact:** Long recordings no longer create tens of thousands of repeated lane and preview DOM elements, while every event remains reachable by selection, keyboard movement, and paging.

**Phase result:** Granular Phase 16 is complete.

**Next plan step:** Granular Phase 17, step 17.1, Adaptation list and filters.
## Granular Phase 17.1 Completion - Adaptation List And Filters

**Plan reference:** Granular Phase 17, step 17.1.

**Status:** Complete.

**Implementation:**

- Replaced the proposed-only button strip with a compact Adaptation Inbox that opens across all lifecycle statuses.
- Added debounced trigger/ID search, status and risk filters, updated/status/risk/trigger sorting, and an explicit sort-direction control.
- Moved Previous and Next page controls to the list footer with visible range and page counts.
- Made each compact row the selection command and preserved selected-row state while detail loads.
- Added distinct loading, no-data, no-match, and retryable error states.
- Added monotonic list/detail request guards so stale responses cannot replace newer filters, Flow scope, or row selection.
- Extended list-flow-adaptations through its shared contract and handler with search, risk, sort, and direction.
- Added an adaptation-specific SQLite summary query so filtering, counting, sorting, limit, and offset happen before browser hydration; the in-memory service path has matching semantics.
- Added responsive filter and stable-column row styling without restoring the removed statistics header.
- Updated authored Automation Studio workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- pnpm --filter fluxiq check passed.
- Focused web Adaptation Inbox regression passed: 1 test.
- Focused large-project SQL summary regression passed: 1 test.

**Defect impact:** Adaptation browsing no longer hides non-proposed records by default, performs no page-local filtering, does not race stale responses into view, and keeps navigation and dense row scanning usable on constrained screens.

**Next plan step:** Granular Phase 17, step 17.2, Summary/Changes/Evidence/Validation/Audit.
## Granular Phase 17.2 Completion - Adaptation Detail Inner Views

**Plan reference:** Granular Phase 17, step 17.2.

**Status:** Complete.

**Implementation:**

- Replaced the single long adaptation detail dump with Summary, Changes, Evidence, Validation, and Audit inner views.
- Added a stable, accessible, horizontally scrollable detail tab strip with visible selected state.
- Made Summary explain why the adaptation exists before showing status, risk, author, scope, timestamps, and current decision.
- Isolated proposed and durable applied mutations in Changes.
- Made Evidence list source runs, recordings, instructions, and observed/expected/failed-action availability without exposing IDs as an editing surface.
- Made Validation list each run result, checked time, and friendly detail with a dedicated empty state.
- Moved approval records, lifecycle commands, and complete raw JSON into Audit.
- Confined long detail content to an independently scrollable body.
- Updated authored Automation Studio workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Focused adaptation detail-view regression passed: 1 test.

**Defect impact:** Adaptation review now has a predictable information architecture; users can understand the change and its evidence without scanning one unbounded technical table or opening raw JSON.

**Next plan step:** Granular Phase 17, step 17.3, Structured diffs and object links.
## Granular Phase 17.3 Completion - Structured Diffs And Object Links

**Plan reference:** Granular Phase 17, step 17.3.

**Status:** Complete.

**Implementation:**

- Replaced primary Before/After JSON controls with bounded field-level Previous and New rows.
- Added friendly rendering for missing, null, empty, boolean, number, string, array, and object values.
- Preserved complete before/after/metadata payloads behind one secondary Technical change details disclosure.
- Added compact change cards for planned patches and durable applied mutations.
- Mapped Router, Subflow/recovery, Instruction, expectation, and action-target patch kinds to their owning editor surfaces.
- Added fallback navigation for promotion-only or unknown patch kinds.
- Turned source run, recording, and instruction IDs into exact evidence deep links.
- Added horizontal containment for wide value differences and visible added/removed color cues.
- Updated authored Automation Studio workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Focused structured-diff and adaptation-view regressions passed: 2 tests.

**Defect impact:** Users can review what changed and open the affected object without manually decoding JSON or copying internal IDs, while technical payloads remain available on demand.

**Next plan step:** Granular Phase 17, step 17.4, Review authorization and lifecycle.
## Granular Phase 17.4 Completion - Review Authorization And Lifecycle

**Plan reference:** Granular Phase 17, step 17.4.

**Status:** Complete.

**Implementation:**

- Removed every native window prompt from adaptation review.
- Added a focused in-product PIN authorization modal after the user chooses a lifecycle command.
- Added user-facing titles, consequences, and labels for approve, reject, apply, disable, revert, supersede, validation, and manual-approval commands.
- Required a reason for reject and supersede, plus a replacement adaptation ID for supersede.
- Kept authorization, validation, and API errors inside the open modal without discarding entered decision context.
- Added a status-aware transition matrix so normal UI only exposes valid commands.
- Made rejected, disabled, reverted, and superseded records audit-only; applied records expose only durable revert.
- Added clear primary and destructive command styling.
- Updated authored Automation Studio workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Focused adaptation lifecycle, prompt-removal, diff, and view regressions passed: 3 tests.

**Defect impact:** Adaptation review no longer interrupts users with browser prompts or advertises impossible transitions, and privileged decisions retain enough context to recover from authorization failures.

**Next plan step:** Granular Phase 17, step 17.5, Legacy Proposal Generator compatibility.
## Granular Phase 17.5 Completion - Legacy Proposal Generator Compatibility

**Plan reference:** Granular Phase 17, step 17.5.

**Status:** Complete.

**Implementation:**

- Converted the remaining standalone Proposal Generator component from an executable generator into a read-only compatibility view.
- Removed LLM-assisted and direct-generation inputs, buttons, progress state, and callback invocation from that component.
- Routed restored saved generator tabs through the same compatibility component instead of duplicate static markup.
- Added clear retired/read-only language, retained selected legacy recording context, and provided only Open Adaptations and Open Recordings links.
- Preserved Proposal Generator as a recognized legacy view type solely so old workspace layouts remain understandable.
- Confirmed the normal view-adder excludes the legacy generator.
- Updated authored Automation Studio workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Proposal Generator compatibility and normal-navigation exclusion suites passed: 4 tests.

**Defect impact:** No reachable Proposal Generator component can create recording-derived proposals, while old saved tabs remain useful enough to direct users to current Adaptations and recording evidence.

**Next plan step:** Granular Phase 17, step 17.6, Legacy Proposal Workbench compatibility.
## Granular Phase 17.6 Completion - Legacy Proposal Workbench Compatibility

**Plan reference:** Granular Phase 17, step 17.6.

**Status:** Complete.

**Implementation:**

- Removed the hidden editable/mutation toolbar branch from Proposal Workbench.
- Removed prompt-based apply/save handlers and proposal mutation event listeners.
- Made the legacy proposal graph unconditionally read-only with no palette and no editable node IDs.
- Removed proposal mutation callbacks and the editable flag from the component contract and renderer wiring.
- Preserved readable proposal summary, status, evidence counts, graph, and inspector selection.
- Added clear read-only compatibility language plus Open Adaptations and exact source-recording links.
- Migrated existing Proposal Workbench tests to the compatibility-only API and added a no-mutation-path regression.
- Updated authored Automation Studio workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Proposal Workbench state-linking and compatibility suites passed: 8 tests.

**Defect impact:** A restored legacy proposal can still be understood and inspected, but no component flag or callback can reactivate obsolete proposal editing, regeneration, LLM processing, or Flow application.

**Next plan step:** Granular Phase 17, step 17.7, remove normal Change Proposal navigation and creation.
## Granular Phase 17.7 Completion - Normal Change Proposal Retirement

**Plan reference:** Granular Phase 17, step 17.7.

**Status:** Complete.

**Implementation:**

- Removed Change Proposals from the current Automation Studio view-type union.
- Removed the Change Proposals renderer branch, workspace component, title, and description.
- Removed stale Change Proposal icon routing and the unused proposal hierarchy generator from normal sidebar construction.
- Removed unreachable recording-finalization, direct/assisted generation, manual pipeline, payload-application, and proposal-review mutation helpers from the web client.
- Removed obsolete proposal mutation callbacks from Renderer and Connected Clients contracts.
- Kept proposal artifact loading, selection, restored saved tabs, and read-only graph inspection only for compatibility.
- Preserved Flow-linked proposal/change-proposal IDs under the single Adaptations hierarchy surface.
- Added a cross-file retirement regression that fails if the retired view, hierarchy generator, creation endpoints, or executable controls return.
- Updated authored Automation Studio workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Full focused Phase 17 web set passed: 7 files, 71 tests.
- Phase 17 framework SQL summary regression passed earlier: 1 test.

**Defect impact:** Adaptations is now the only normal generated-change review surface. Separate Change Proposal navigation and recording-driven proposal creation cannot reappear through dormant web code, while historical workspaces remain readable.

**Phase result:** Granular Phase 17 is complete.

**Next plan step:** Granular Phase 18, step 18.1, Problems.
## Granular Phase 18.1 Completion - Problems Utility

**Plan reference:** Granular Phase 18, step 18.1 and AS-VIEW-15.

**Status:** Complete.

**Implementation:**

- Replaced the flat issue list with stable normalization and deduplication by code, scope IDs, and message.
- Added Whole project and Current object scope controls wired to the global Automation Studio selection.
- Added All, Errors, Warnings, and Info severity filters with scoped counts.
- Grouped visible issues by owning Flow/subflow/object and then by severity.
- Distinguished blocking errors, recommendations, and information in both headings and row metadata.
- Preserved exact onOpenProblem navigation while adding unmistakable selected-row state.
- Cleared selected state when refresh resolves or removes that problem.
- Added distinct no-problems and no-matches states.
- Bounded large collections to 100 rows per page with footer pagination.
- Kept one contained scroll surface in the fixed right utility region.
- Updated authored Automation Studio workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Focused Problems normalization, scope, grouping, semantics, and 101-item paging regressions passed: 3 tests.

**Defect impact:** Project validation is now scan-friendly, scoped, deduplicated, and bounded; users can distinguish blockers from advice and jump from one stable issue to the exact object that needs work.

**Next plan step:** Granular Phase 18, step 18.2, Global Inspector.
## Granular Phase 18.2 Completion - Global Inspector

**Plan reference:** Granular Phase 18, step 18.2 and AS-VIEW-17.

**Status:** Complete.

**Implementation:**

- Added a stable selected-object identity contract with object type, friendly label, canonical ID, owning Flow breadcrumb, and context-aware detail destination.
- Added explicit Copy ID and Open Detail commands without exposing IDs as the primary label.
- Replaced the cosmetic field input with controlled filtering across inspector sections, summary widgets, and detail-card widgets.
- Added a purposeful unselected state and reset stale search whenever global selection changes.
- Preserved schema-driven node parameter editing only for canonical editor-node selections; legacy proposal steps remain read-only.
- Removed fabricated node runtime/training statistics and obsolete recording dataset-action claims. Inspector rows now represent loaded project/runtime data only.
- Added compact, wrapping identity/tool styling and keyboard-visible search focus treatment inside the existing bounded right utility region.
- Updated authored Automation Studio workspace documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Focused Inspector state, identity, breadcrumb, detail-routing, and reference-option regressions passed: 3 tests.

**Defect impact:** The global Inspector now follows selection predictably, identifies the inspected object without opaque-ID hunting, routes users to the owning detail surface, and no longer presents fictional operational data.

**Next plan step:** Granular Phase 18, step 18.3, Signals decision and implementation/removal.
## Granular Phase 18.3 Completion - Signals Decision And Retirement

**Plan reference:** Granular Phase 18, step 18.3 and AS-VIEW-13.

**Status:** Complete.

**Decision:** State View remains the canonical signal/state inspection surface. The former Signals Relationship Web remains retired because it was a registry list and did not provide a distinct relationship-analysis workflow.

**Implementation:**

- Removed the retired `signals` workspace view type, renderer branch, title, description, and renderer-only recording-domain prop.
- Removed the unused Signals registry-list component, namespace grouping helper, and exclusive CSS.
- Removed the Inspector's stale Open in signal web claim.
- Preserved signal registries as real data consumed by State View, evidence resolution, runtime authoring, and Inspector detail.
- Preserved compatibility migration from persisted/deep-linked `signals-web` views to `state-explorer`.
- Updated authored Automation Studio workspace documentation to distinguish migration support from live UI implementation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Focused navigation migration, workspace restoration, State View, and Inspector regressions passed: 4 files, 47 tests.
- Source audit found no remaining Signals workspace component, view type, renderer branch, exclusive helper/style, or live-view label.

**Defect impact:** Users now have one canonical place to inspect signal-backed state. Persisted legacy workspaces still recover safely without keeping a misleading duplicate view alive.

**Next plan step:** Granular Phase 18, step 18.4, AI Assistant decision and implementation/removal.
## Granular Phase 18.4 Completion - AI Assistant Decision And Retirement

**Plan reference:** Granular Phase 18, step 18.4 and AS-VIEW-16.

**Status:** Complete.

**Decision:** Remove the AI Assistant from the live workspace until FluxIQ has a real provider-backed assistant contract. The former surface was a local text echo, not an LLM workflow.

**Implementation:**

- Removed the standalone `assistant` view type, renderer branch, component, title, description, and exclusive styles.
- Removed fake Explain Selection, Compare Evidence, and Propose Edit controls that never contacted an LLM or produced an Adaptation.
- Preserved compatibility migration from persisted `ai-assistant` tabs to the global Inspector.
- Kept the documented return criteria: explicit supported jobs, visible context, provider/model/key readiness, streaming and cancellation, evidence citations, structured preview/approval, retention policy, complete failure states, and no hidden mutation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Focused navigation and workspace migration regressions passed: 2 files, 25 tests.
- Source audit found no live Assistant view type, renderer, component, title, description, or dedicated styling; only compatibility migration and its regression fixture retain the historical ID.

**Defect impact:** FluxIQ no longer presents a fake assistant that implies LLM capability without performing any model operation. Historical workspaces recover into a useful Inspector surface.

**Next plan step:** Granular Phase 18, step 18.5, Workspace Dock retirement/reduction.
## Granular Phase 18.5 Completion - Workspace Dock Retirement

**Plan reference:** Granular Phase 18, step 18.5 and AS-VIEW-18.

**Status:** Complete.

**Decision:** Retire the generic Workspace Dock completely. It had no unique job and duplicated Assistant, Problems, history, and State surfaces.

**Implementation:**

- Removed the `dock` view type, Dock tab type/state, renderer branch, component, titles/descriptions, saved-tab persistence, and exclusive CSS.
- Removed duplicate fake Assistant context, truncated Problems, placeholder Change History, and embedded State View panels.
- Removed obsolete Dock state from the controller ownership inventory.
- Preserved `.automation-dock-layout` because it is the active generic workspace pane container, not the retired Dock feature.
- Preserved recording Action Preview as the only fixed bottom contextual region.
- Preserved compatibility migration from persisted `workspace-dock` views to global Inspector.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Focused navigation and workspace migration/layout regressions passed: 2 files, 25 tests.
- Source audit found no Dock type, state, renderer, component, panel classes, persistence command, or live title/description; only compatibility migration and its test retain the historical ID.

**Defect impact:** Problems, State, and Inspector each have one clear owning surface, and the workspace no longer offers a duplicate bottom utility container full of partial or fictional content.

**Next plan step:** Granular Phase 18, step 18.6, utility placement and narrow behavior verification.
## Granular Phase 18.6 Completion - Utility Placement And Narrow Behavior

**Plan reference:** Granular Phase 18, step 18.6; AS-VIEW-15, AS-VIEW-17, and AS-VIEW-18.

**Status:** Complete.

**Implementation and verification:**

- Confirmed Inspector and Problems are the only live right-region utilities; State View is main-region, and recording Action Preview is the only bottom-region surface.
- Confirmed right utilities cannot be routed into main panes and State cannot be routed into the right sidebar through normalized layout or Add Tab.
- Renamed the right-region landmark/frame from Inspector to Right utilities so Problems does not inherit the wrong accessible identity.
- Made the narrow utility command and Drawer title reflect the active right utility instead of always saying Inspector.
- Made Hierarchy, right utility, and Preview commands toggle their own drawers closed on a second activation.
- Opening Problems from graph validation now opens the right utility drawer automatically on narrow screens.
- Verified shared Drawer focus trap, Escape close, background inertness/scroll lock, and trigger focus return.
- Retained bounded independent scrolling in Problems and Inspector and fixed 260-620 px desktop utility sizing.
- Updated authored workspace documentation and removed stale recording-proposal and duplicate Dock wording encountered in the same contract.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Focused strict runtime contract, layout normalization/routing, Add Tab placement, and Inspector regressions passed: 4 files, 28 tests.

**Defect impact:** Utility views retain one owner and remain operable on desktop, narrow screens, keyboard navigation, and zoom-driven narrow layout without duplicate mounted controls or mislabeled drawers.

**Phase result:** Granular Phase 18 is complete.

**Next plan step:** Granular Phase 19, step 19.1, Identity and Access.
## Granular Phase 19.1 Completion - Identity And Access

**Plan reference:** Granular Phase 19, step 19.1 and PROGRAM-01.

**Status:** Complete.

**Implementation:**

- Rebuilt the program into Users, Roles, and Authentication Policy inner views.
- Added user search by friendly identity fields and enabled/disabled filtering with distinct empty-data and no-match states.
- Added a stable list/detail composition with selected account status, credentials, 2FA, timestamps, and active-session audit context.
- Replaced inline action clusters with accessible row menus and focused Add User, Edit Profile, Change Role, Change Password/PIN, 2FA enrollment, and 2FA disable dialogs.
- Kept QR, manual secret copy, advanced OTP URI, and confirmation code together in the enrollment dialog.
- Added explicit security-consequence copy and acting-user password/PIN/TOTP fields for privileged changes.
- Required fresh credential reauthorization before disabling 2FA and standardized failure responses with `requiresRecheck`.
- Added UI and service enforcement preventing disable or demotion of the final enabled administrator.
- Removed presentation of first-run default credentials from the authenticated policy page.
- Added loading, retryable service error, status, and responsive single-column states.
- Updated authored Global Programs documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- pnpm --filter fluxiq check passed.
- Focused Identity filtering and final-admin UI regressions passed: 2 tests.
- Focused framework final-admin and disable-2FA reauthorization regressions passed: 2 tests.
- Broader global-services run passed 28 of 29 tests; the unrelated TypeDoc generation test exceeded its existing 5-second timeout. Its Identity tests passed, and the affected security tests were rerun in isolation successfully.

**Defect impact:** Account administration is now a navigable, searchable security workflow with clear detail ownership and focused consequences. Critical administrator and 2FA protections are enforced below the UI rather than relying on presentation alone.

**Next plan step:** Granular Phase 19, step 19.2, Secret Keys.
## Granular Phase 19.2 Completion - Secret Keys

**Plan reference:** Granular Phase 19, step 19.2 and PROGRAM-02.

**Status:** Complete.

**Implementation:**

- Replaced the always-visible create form and statistics panel with a list-first saved-key/detail workspace and explicit Add Key intent.
- Added search across name, provider, scope, scope object, and model plus LLM/custom and enabled/disabled filters.
- Replaced four inline row buttons with one accessible action menu for edit, rotate, reveal, and delete.
- Kept LLM provider as a known-provider dropdown including DeepSeek, with custom-provider fallback and optional model metadata.
- Added provider readiness detail for built-in adapters, local Ollama, missing providers, and host-required custom adapters.
- Added real Domain choices from the authenticated program directory and lazy Project then SQL-summary Flow choices from Automation Studio. Full Flow graphs are never loaded for the picker.
- Added structured global/domain/Flow/custom scope controls with known-object selection and exact-reference fallback.
- Split Add Key metadata/value entry from its subsequent authorization dialog; creation requires password and configured PIN but intentionally not TOTP.
- Added explicit runtime-impact dialogs for rotation and deletion.
- Added 30-second reveal auto-hide, copy status, and clearing on close, navigation/unmount, selection change, failed reauthorization, and stale/deleted/rotated metadata.
- Added loading, retryable load error, no-key, no-filter-match, and selected-detail states.
- Removed obsolete summary-grid CSS and added responsive list/detail behavior.
- Updated authored Global Programs documentation.

**Validation:**

- pnpm --filter @fluxiq/web check passed.
- Focused Secret Keys filtering, provider readiness, stale reveal, scope source, and auth-tier regressions passed: 5 tests.
- Complete Secret Keys encrypted runtime service regressions passed: 2 tests.
- Integrated create-without-TOTP and reveal-with-TOTP authorization regression passed: 1 test.

**Defect impact:** Operators can manage encrypted keys through a predictable metadata-first workflow, choose real runtime scope objects, understand provider support, and reveal values without leaving durable plaintext in UI state.

**Next plan step:** Granular Phase 19, step 19.3, Database Manager.

## Granular Phase 19.3 Completion - Database Manager

**Plan reference:** Granular Phase 19, step 19.3 and PROGRAM-03.

**Status:** Complete.

**Implementation:**

- Added repository-level SQL pagination with escaped ID/JSON search, stable created/updated/ID sorting, direction, filtered counts, bounded limits, and offset.
- Added a service page contract and a bounded compatibility fallback for non-SQL custom repositories.
- Prevented sensitive `identity.users` and `secret.keys` repositories from being queried for snapshot counts; their counts remain explicitly unavailable.
- Added opaque five-minute sensitive-store grants scoped to the authenticated user, store kind, and database scope.
- Rebuilt the browser view around 50-row server pages, debounced server search, stale-request rejection, bottom pagination, and on-demand record detail.
- Kept normal browsing free of raw JSON entry. Detailed JSON is opt-in and only serialized for the selected record.
- Added structured database/store selection, selected-row state, empty/no-match/error/loading/locked states, sticky headers, null/value formatting, and bounded independent scrolling.
- Capped page grids at 30 matching columns with a visible wide-schema notice while retaining every field in record detail.
- Added visible grant countdown and one-shot expiry cleanup that removes sensitive rows, detail, and browser grant state.
- Corrected database switching so stale detail and paging state cannot leak between scopes.
- Added responsive five-control toolbar, fixed footer row, readable locked-store labels, bounded raw detail, and single-column narrow behavior.
- Updated authored Global Programs documentation.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter fluxiq check` passed.
- Database repository/service suite passed: 8 tests, including 130-row SQL paging/search/sort and no-query sensitive summaries.
- Sensitive-store authorization integration passed: 1 test, including opaque-grant record access.
- Database Manager web contract suite passed: 2 tests.

**Defect impact:** Database browsing no longer loads complete tables into memory or the browser, sensitive summaries cannot accidentally inspect protected rows, and large or wide stores remain responsive and understandable through bounded pages and explicit detail.

**Next plan step:** Granular Phase 19, step 19.4, Documentation.

## Granular Phase 19.4 Completion - Documentation

**Plan reference:** Granular Phase 19, step 19.4 and PROGRAM-04.

**Status:** Complete.

**Implementation:**

- Rebuilt the program around source/search/tree explorer, document viewer, and heading-outline regions.
- Added source list counts, source filtering, title/path search, selected-file state, and distinct no-match state.
- Bounded rendered metadata to 1,000 matching pages; users can refine search to reach every omitted page without mounting an unbounded tree.
- Added explicit snapshot loading/error, page loading/missing/error, empty selection, rebuild progress/failure/success, and warning states.
- Added stale page-request rejection so rapid navigation cannot replace the current document with an older response.
- Added stable heading IDs and a generated H1-H4 outline, including deterministic duplicate-heading suffixes.
- Added shareable `doc` query deep links with refresh restoration.
- Internal links resolve in-program, hash links scroll to headings, and broken links report a visible snapshot mismatch.
- Added ARIA tree semantics and Arrow Up/Down/Left/Right plus Home/End navigation while preserving pointer folder expansion.
- Kept generated HTML script-free and CSP-sandboxed while adding readable constrained document styles.
- Added a single left explorer Drawer under 820 px and retained independent tree, document, warning, source, and outline scrolling.
- Removed the split file's unrelated imports and updated authored Global Programs documentation.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- Documentation UI contract suite passed: 3 tests.
- Framework runtime-documentation generation regression passed: 1 test.

**Defect impact:** Documentation is now searchable, linkable, keyboard-operable, bounded for large trees, and explicit about stale pages, broken links, rebuild work, and source warnings.

**Next plan step:** Granular Phase 19, step 19.5, Background Tasks.

## Granular Phase 19.5 Completion - Background Tasks

**Plan reference:** Granular Phase 19, step 19.5 and PROGRAM-05.

**Status:** Complete.

**Implementation:**

- Limited scheduler snapshots to 20 recent run summaries instead of returning complete history.
- Extended task detail with bounded 1-100 run pages, offset, status filtering, total, and stable newest-first order.
- Preserved all retained history; no destructive retention change was introduced.
- Replaced duplicate selected/recent tables with one task-scoped 50-run page and bottom pagination.
- Added task search, enabled-state filter, run-status filter, selected-run detail, stale-response rejection, and distinct empty/no-match/load-error states.
- Added scheduler running/paused controls, live due/manual/disabled countdowns, selected schedule progress, manual Run Now, failed Run Again, and explicit service limitations around cancellation.
- Added bounded scrolling and responsive three-, two-, and one-column layouts.
- Updated authored Global Programs documentation.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter fluxiq check` passed.
- Background Tasks web contract suite passed: 2 tests.
- 75-run service pagination/filter/snapshot regression passed: 1 test.

**Defect impact:** Background Tasks no longer sends or renders complete run history on initial load, and operators can filter, page, inspect, and rerun work through one predictable history surface.

**Next plan step:** Granular Phase 19, step 19.6, Compute Control.

## Granular Phase 19.6 Completion - Compute Control

**Plan reference:** Granular Phase 19, step 19.6 and PROGRAM-06.

**Status:** Complete.

**Implementation:**

- Replaced summary cards with searchable node list, selected detail, and activity regions.
- Added healthy/degraded/offline heartbeat derivation, health and capability filters, domain/host search, and explicit no-node/no-match/load-error states.
- Added node identity, reported state, heartbeat age, domains, capabilities, metadata, recent commands, errors, and active leases.
- Bounded snapshot command summaries at 100 without deleting stored history.
- Added responsive three-, two-, and one-column layouts and independent scrolling.
- Updated authored Global Programs documentation.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter fluxiq check` passed.
- Compute Control health and UI contract suite passed: 2 tests.

**Defect impact:** Operators can now identify unhealthy or stale compute, inspect why, and understand node capability and activity ownership without scanning undifferentiated cards.

**Next plan step:** Granular Phase 19, step 19.7, Deployment Sync.

## Granular Phase 19.7 Completion - Deployment Sync

**Plan reference:** Granular Phase 19, step 19.7 and PROGRAM-07.

**Status:** Complete.

**Implementation:**

- Retained repository unavailable, branch, current branch, remote, version, clean/dirty tree, dry-run, action history, and accessible inner-tab states.
- Added focused checkout and rollback confirmation dialogs with target/action/version context and repository-change consequences.
- Disabled repository actions while Git is unavailable or another action is running.
- Added visible in-progress and failure/success status.
- Replaced selected-result raw JSON with structured version or deployment-action detail and ordered plan steps.
- Retained dirty-worktree guidance and selected action/version ownership.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- Deployment Sync protected-action/result contract passed: 1 test.

**Defect impact:** Repository-changing actions no longer fire from a single click, and action/version outcomes are readable without inspecting raw JSON.

**Next plan step:** Granular Phase 19, step 19.8, Production Runner.

## Granular Phase 19.8 Completion - Production Runner

**Plan reference:** Granular Phase 19, step 19.8 and PROGRAM-08.

**Status:** Complete.

**Implementation:**

- Removed manual Parameters JSON entry from launch workflows.
- Added friendly string/number/boolean controls derived from each target's optional `parameterSchema`, capped at 30 fields.
- Retained routine/task/interface target selection, loops, loop delay, start delay, launch, progress, advance, and cancel.
- Added selected active-run detail and preserved workload grouping by target type.
- Bounded snapshots to 100 recent run summaries and visible filtered execution logs to 500 with an explicit truncation notice; stored history is not deleted.
- Retained status/type log filtering and added clear empty workload/log states.
- Added responsive parameter controls and authored contract coverage.

**Validation:**

- `pnpm --filter @fluxiq/web check` passed.
- `pnpm --filter fluxiq check` passed.
- Production Runner schema, no-raw-JSON, bounded-log, and control suite passed: 2 tests.

**Defect impact:** Launching supported workloads no longer requires users to author JSON, and run/log rendering cannot grow without a browser-side bound.

**Next plan step:** Granular Phase 19, step 19.9, automated accessibility, keyboard, visual, zoom, and performance gates.

## Granular Phase 19.9 Completion - Automated Quality Gates

**Plan reference:** Granular Phase 19, step 19.9 and the Exhaustive Completion Rule.

**Status:** Complete (gate implementation).

**Implementation:**

- Retained deterministic empty/representative/scale fixtures and desktop, compact, and mobile Chromium projects.
- Retained visual captures for every global program and every Automation Studio inner view.
- Converted axe collection into a gate for serious and critical violations.
- Added axe and 200% page-overflow checks for all eight operational global programs.
- Extended global-program performance navigation from four programs to all eight.
- Retained keyboard focus-order, reduced-motion, scale graph, request/payload, render, DOM, long-task, and interaction budget artifacts.

**Validation:**

- `pnpm --filter @fluxiq/web exec playwright test --list` passed.
- Playwright discovered 81 tests across 5 files and 3 viewport projects.
- Browser execution and refreshed screenshots were not run because repository instructions require the user to start the web panel manually. The implemented gates will run against that externally started panel.

**Defect impact:** Accessibility failures are no longer merely recorded, and global operational programs now participate in the same zoom and performance evidence matrix as Automation Studio.

**Next plan step:** Granular Phase 19, step 19.10, dead CSS/component removal and authored documentation update.

## Granular Phase 19.10 Completion - Cleanup, Documentation, And Final Gate

**Plan reference:** Granular Phase 19, step 19.10 and the Exhaustive Completion Rule.

**Status:** Complete.

**Implementation:**

- Removed stale mega-imports from split operational views and retired exclusive Documentation summary and duplicate Background Tasks activity CSS.
- Added missing narrow modal action wrapping and excluded Playwright specifications from Vitest collection.
- Updated the audited global-program catalog expectation for Secret Keys.
- Regenerated both deterministic framework references and updated authored Global Programs documentation.
- Audited normal UI source for manual parameter JSON and retired operational view residues; compatibility Config/Proposal code remains governed by prior migration phases and is not normal navigation.
- Restored the repository's Turbopack build command after evaluating the standard bundler.

**Validation:**

- Full `pnpm check` passed across all workspace packages.
- Web unit/component suite passed: 54 files, 284 tests.
- Framework full suite passed 359 of 360 before the sole stale Secret Keys catalog expectation; that expectation was corrected and its complete 6-test file then passed.
- Client gateway suite passed: 3 tests.
- `pnpm docs:check` passed after deterministic reference regeneration.
- Playwright discovery passed: 81 tests across desktop, compact, and mobile projects.
- Browser journeys were not executed because repository instructions require an externally started panel.
- Production build passed after moving browser-used status helpers from the Node-heavy root `fluxiq` barrel to the browser-safe `fluxiq/ui` export. The rejected browser-empty export rewrite was not applied.

**Defect impact:** The implemented UI plan has clean type, unit, documentation, browser-gate, and production-build coverage, with stale split-view residue and the client/server package leak removed.

**Phase result:** Granular Phase 19 and its final production-build gate are complete.

### 2026-08-26 - Phase 19.10 Build-Gate Resolution

- Traced the browser `fs` failure to `shared-ui.tsx` importing `fluxiqStatusLabel` and `fluxiqStatusTone` from the root Node runtime barrel.
- Moved the value import to the existing browser-safe `fluxiq/ui` subpath.
- Rejected and did not apply a broad browser-empty package-export workaround.
- `pnpm --filter @fluxiq/web build` compiled, type-checked, generated all 15 routes, finalized traces, and passed.

### 2026-08-26 - Automation Studio Project-Open Memory Correction

**Plan reference:** Phase 0 performance budgets, UI-P0-003, Granular Phase 6.7, and the project-open performance gate completed under Phase 19.9.

**Status:** Complete.

**Finding:**

- Opening a project supplied every project and canonical recording to every top-level Flow hierarchy.
- A Flow without explicit `recordingIds` treated all recordings as its children, producing a Flow-by-recording Cartesian product.
- With 100 Flows and 500 recordings, hierarchy generation could allocate roughly 50,000 recording rows before normal Flow objects, then rebuild that result during unrelated Studio updates.
- Project switches also retained prior Flow details, recording details, indexed state, graph drafts, and cache entries while merging the next project's summaries.

**Correction:**

- Flow recording folders now contain only recordings explicitly linked by the Flow document.
- Active-project hierarchy input is isolated from the broad canonical snapshot recording and timeline collections.
- Switching projects clears the previous project's hydrated details, runtime state, indexed state, graph drafts, and request cache before loading the next summary.
- Recording/timeline composition, adaptation composition, generated hierarchy nodes, generated-ID lookup, and deleted-node filtering are memoized so gateway polling and unrelated workspace state do not rebuild the hierarchy.
- Added a 100-Flow/500-recording regression proving unlinked recordings produce zero duplicated recording rows and keep generated hierarchy size below 1,000 nodes.

**Validation:**

- Focused Automation Studio suites passed: 2 files, 15 tests.
- `pnpm --filter @fluxiq/web check` passed.
- Full web suite passed: 54 files, 285 tests.
- `pnpm --filter @fluxiq/web build` compiled, type-checked, generated all 15 routes, and finalized build traces.
- Interactive browser profiling remains an external-panel check under the repository instruction not to start the web panel for the user.

**Defect impact:** Project opening is bounded by actual Flow structure and explicit artifact links instead of the product of project collections, while repeated project navigation no longer retains hydrated data from previous projects.

### 2026-08-27 - Automation Studio Persistent Freeze Second Pass

**Plan reference:** Phase 0 performance budgets, UI-P0-003, Granular Phase 6.7, Granular Phase 8.8, Granular Phase 10.7, and Phase 19.9.

**Status:** Complete.

**Why the first correction was insufficient:**

- The Flow-by-recording hierarchy product was removed, but Studio mount still invoked the legacy global `snapshot` endpoint.
- That endpoint synchronously read and serialized every full recording session, normalized timeline, signal registry, learned task model, and policy graph in the domain before scoped project summaries loaded.
- The 1.5-second client-gateway poll always stored a new parsed snapshot object, invalidating the entire 3,000-line Studio owner even when recording activity had not changed.
- Selection changes reran complete graph validation, Flow-to-policy conversion, signal flattening, model merging, problem normalization, node-definition concatenation, and indexed-state conversion.
- Each visible hierarchy row scanned the full hierarchy to determine active-child ownership, and Router views mounted every route row without a render bound.

**Correction:**

- Removed the legacy global snapshot request from normal Automation Studio bootstrap.
- Made the HTTP snapshot handler explicitly request a lightweight canonical-free response; full service snapshots remain opt-in for compatibility and controlled internal use.
- Reduced Studio-owned gateway state to active recording IDs and the latest 20 project-required audit records, and skip state updates when that activity signature is unchanged.
- Memoized graph validation, policy conversion, signal/model/problem derivation, available node definitions, and indexed state source arrays.
- Reused the hierarchy parent/child index for row ownership checks and memoized default-collapse derivation.
- Added bottom pagination to Router lists with a maximum of 100 mounted route rows.

**Validation:**

- Focused web performance regressions passed: 4 files, 90 tests.
- Automation Studio runtime service file passed: 79 tests.
- Web and framework TypeScript checks passed.
- Added regressions for no client snapshot bootstrap, bounded/lightweight gateway activity, lightweight service snapshots with persisted data, and 100-row Router rendering.
- Complete web suite passed: 54 files, 288 tests.
- Web and framework production builds passed; the web build compiled, type-checked, generated all 15 routes, and finalized traces.
- `pnpm docs:check` passed across 41 authored/reference Markdown files and the deterministic framework reference.
- Interactive browser profiling remains an external-panel check under the repository instruction not to start the web panel for the user.

**Defect impact:** Opening and interacting with a project no longer triggers full-domain database hydration, unchanged gateway polls do not rerender the workspace, and ordinary clicks do not repeatedly recompute complete graph/project collections.
