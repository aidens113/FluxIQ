# Working Document Index

Every working document in this repository is listed here, grouped by the
`Status` field of its header block. This index is derived from those headers
and regenerated when a document is created, retired, or re-statused; edit the
document's header, not this table. Read it first, pick the relevant document,
then read that document's `Current State` section before anything else.

Format, status vocabulary, ledger rules, worker briefs, and cross-repository
pairing are defined in
[Agent Working Document Protocol](./agent-working-doc-protocol.md).

The downstream web-extension index is at `F:\!FluxIQWebExtension\docs\working\README.md`.

## Active

| Document | Owner | Lines | Scope | Paired downstream |
| --- | --- | --- | --- | --- |
| [adaptive-flow-training-roadmap.md](./adaptive-flow-training-roadmap.md) | FluxIQ Core (Automation Studio runtime); the 2026-09-06 checkpoints were executed by Core safety, provider, and backend-grant subagents operating under the repository AGENTS.md | 969 ⚠ | Core-side roadmap for turning recording/prompt-generated adaptive Flows into stable deterministic Flows (generation, expected-state comparison, runtime recovery, training patches, Training Mode UX, stabilization, integration primitives), plus the 2026-09-06 Production LLM Phase 0/1A/1B safety, provider-seam, and diagnosis-only grant checkpoints. | `llm-production-automation-plan.md` |
| [agent-working-doc-protocol.md](./agent-working-doc-protocol.md) | Senior supervisor agent | 479 | How the supervisor and workers use `docs/working/` as durable memory | `agent-working-doc-protocol.md` |
| [automation-studio-render-data-separation-plan.md](./automation-studio-render-data-separation-plan.md) | Parent agent (the integration owner named in the Implementation Journal); area: Automation Studio, `apps/web/src/features/automation-studio/` | 2740 ⚠ | Full separation of interactive rendering from project data, background work, persistence, and view-domain rendering in Automation Studio, plus the global-program shell interaction repairs that the live browser gate exposed. | none |
| [automation-studio-runtime-debug-ui-cleanup.md](./automation-studio-runtime-debug-ui-cleanup.md) | Automation Studio web UI | 137 | Restructure the Flow-owned Runtime Debug inner view in Automation Studio (run launcher, Runs/Replays history, responsive styling) into one configure-run-inspect workflow while preserving runtime commands, bounded data loading, query pagination, subscriptions, and detail navigation. | none |
| [automation-studio-scalable-data-architecture-plan.md](./automation-studio-scalable-data-architecture-plan.md) | FluxIQ framework / Automation Studio | 1383 ⚠ | Hybrid SQLite-plus-content-addressed storage for Automation Studio at very large scale: per-project typed schema, graph partitions/revisions/patches, bounded event streams, keyset APIs, browser query stores, push sync, explicit migration and cutover, and scale certification. | none |
| [module-size-governance-plan.md](./module-size-governance-plan.md) | Senior supervisor agent | 314 | Preventing unbounded file, class, and directory growth in FluxIQ Core | `module-size-governance-plan.md` |
| [ui-ux-upgrade-audit-plan.md](./ui-ux-upgrade-audit-plan.md) | FluxIQ Web and Automation Studio | 6007 ⚠ | Product-wide UI/UX audit and implementation backlog for the FluxIQ web panel (`apps/web`): global shell, authentication, the eight global operational programs, every Automation Studio surface, shared primitives, and the Playwright browser-evidence gates. | none |

## Paused

| Document | Owner | Lines | Scope | Paired downstream |
| --- | --- | --- | --- | --- |
| [automation-studio-state-object-index-plan.md](./automation-studio-state-object-index-plan.md) | Automation Studio | 1086 ⚠ | Deterministic object/index system for recordings, state snapshots, screenshots, proposals, and Flow provenance. | none |
| [flow-initialization-router-ui-plan.md](./flow-initialization-router-ui-plan.md) | Automation Studio | 1065 ⚠ | First-run Flow setup, required instructions, manual router/subflow creation, router visual editing, route testing, and readiness checks. | none |
| [flow-unification-and-scriptability-plan.md](./flow-unification-and-scriptability-plan.md) | Automation Studio | 830 ⚠ | FluxIQ Automation Studio, public domain-neutral contracts, and the web editor. This plan is not authorization for an unreviewed destructive data migration. | none |
| [llm-assisted-deterministic-automation-expansion-plan.md](./llm-assisted-deterministic-automation-expansion-plan.md) | FluxIQ framework | 3466 ⚠ | FluxIQ core product direction, Automation Studio, Flow runtime, LLM-assisted adaptation, training history, and persistence contracts. Related plans: | `llm-production-automation-plan.md` |
| [recording-proposal-generator-plan.md](./recording-proposal-generator-plan.md) | Automation Studio | 634 | Keeping recordings as raw reviewable source material rather than automatic proposals; multiple proposals per recording, grouping, deletion, regeneration. | none |

## Complete

| Document | Owner | Lines | Scope | Paired downstream |
| --- | --- | --- | --- | --- |
| [action-visual-entity-target-plan.md](./action-visual-entity-target-plan.md) | Automation Studio | 366 | FluxIQ Automation Studio action evidence contracts, state visual entity linking, editor highlighting, importer documentation, validation, and proposal/runtime use. | `action-visual-entity-target-plan.md` |
| [automation-studio-element-target-fingerprints-plan.md](./automation-studio-element-target-fingerprints-plan.md) | Automation Studio | 338 | Automation Studio recording capture, recording mappers, native/custom extension output nodes, runtime element matching, and domain-neutral persisted target contracts. | none |
| [automation-studio-strict-workspace-layout-plan.md](./automation-studio-strict-workspace-layout-plan.md) | Automation Studio | 525 | Replacing the dynamic inner-window canvas with a strict workspace layout of fixed panes, docks, and sidebars. | none |
| [codebase-audit-remediation-plan.md](./codebase-audit-remediation-plan.md) | FluxIQ framework | 1201 ⚠ | FluxIQ public framework repository | none |
| [node-state-evidence-view-plan.md](./node-state-evidence-view-plan.md) | Automation Studio | 979 ⚠ | FluxIQ Automation Studio state/evidence contracts, importer SDK presentation hints, node state inspection, and the existing addable workspace window system. | none |
| [runtime-kernel-plan.md](./runtime-kernel-plan.md) | FluxIQ framework | 1050 ⚠ | FluxIQ core runtime architecture, direct-import host runtimes, websocket runtime transport, Automation Studio execution integration, and the `F:\!FluxIQWebExtension` repository as the first validation target. | `extension-runtime-capabilities-plan.md` |
| [web-panel-ui-ux-functionality-audit-plan.md](./web-panel-ui-ux-functionality-audit-plan.md) | FluxIQ Web and Automation Studio | 1223 ⚠ | Audit and remediation of UI, UX, accessibility, performance, and functional defects across the whole FluxIQ web panel (Automation Studio views, shared workspace/render architecture, shared primitives, authentication, and all nine global programs), tracked as findings F-001 through F-055 and executed through Phases 0 through 8 with browser and scale certification. | none |

## Superseded

These no longer own current status; each names its successor in `Status
detail`. Retained for evidence. Do not plan current work from them.

| Document | Owner | Lines | Scope | Paired downstream |
| --- | --- | --- | --- | --- |
| [automation-studio-data-flow-refactor-plan.md](./automation-studio-data-flow-refactor-plan.md) | Automation Studio | 934 ⚠ | Untangling Automation Studio project refresh, proposal, and view data flow. | none |
| [automation-studio-fast-ui-cache-plan.md](./automation-studio-fast-ui-cache-plan.md) | Automation Studio | 1320 ⚠ | Fast UI cache for Automation Studio project views so refreshes read summaries instead of full documents. | none |
| [automation-studio-lag-remediation-plan.md](./automation-studio-lag-remediation-plan.md) | Automation Studio | 1087 ⚠ | Remediation of Automation Studio interaction lag on the hot path, completed 2026-08-27. | none |
| [automation-studio-live-refactor-plan.md](./automation-studio-live-refactor-plan.md) | Automation Studio | 2781 ⚠ | Automation Studio architecture and live refactor: render/runtime separation, session ownership, and browser certification. | none |
| [automation-studio-load-performance-plan.md](./automation-studio-load-performance-plan.md) | Automation Studio | 346 | Summary-first load performance for project open, pane switching, runtime debug, and Flow browsing. | none |
| [automation-studio-ui-lag-root-cause-audit.md](./automation-studio-ui-lag-root-cause-audit.md) | Automation Studio | 513 | Root-cause audit of Automation Studio UI lag; audit complete, remediation tracked elsewhere. | none |

⚠ marks documents over the 800-line compaction threshold (16 of 25 here).
Compact them the next time work touches them; do not schedule a bulk rewrite.
