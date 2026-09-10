# Working Document Index

Every working document in this repository is listed here. This index is the
entry point for any agent starting a task: read it, pick the relevant
document, then read that document's `Current State` section before anything
else.

Format, status vocabulary, ledger rules, worker briefs, and cross-repository
pairing are defined in
[Agent Working Document Protocol](./agent-working-doc-protocol.md).

The downstream web-extension index is at
`F:\!FluxIQWebExtension\docs\working\README.md`.

## Active

| Document | Owner | Lines | Scope | Paired downstream |
| --- | --- | --- | --- | --- |
| [agent-working-doc-protocol.md](./agent-working-doc-protocol.md) | Senior supervisor agent | 359 | How agents use `docs/working/` as durable memory and multi-agent coordination substrate. | `agent-working-doc-protocol.md` |
| [module-size-governance-plan.md](./module-size-governance-plan.md) | Senior supervisor agent | 292 | Owns the shared size and structure policy for both repositories: the ratchet, the `tests/` relocation, the eight-phase migration of Automation Studio's oversized files and directories, and the CodeGraph assessment. | `module-size-governance-plan.md` |
| [adaptive-flow-training-roadmap.md](./adaptive-flow-training-roadmap.md) | FluxIQ framework | 818 ⚠ | Product direction for adaptive automation that stabilises into deterministic Flows; adaptation layers, training mode, patch contract. | `llm-production-automation-plan.md` (unconfirmed) |
| [automation-studio-render-data-separation-plan.md](./automation-studio-render-data-separation-plan.md) | Automation Studio | 2624 ⚠ | Current owner of Studio render/runtime topology. Implementation and current-panel regression complete; seeded browser matrix certification outstanding. | none |
| [automation-studio-scalable-data-architecture-plan.md](./automation-studio-scalable-data-architecture-plan.md) | Automation Studio | 1232 ⚠ | Scalable data architecture through Phase 12 certification harness; external certification evidence required before release flag removal. | none |
| [automation-studio-runtime-debug-ui-cleanup.md](./automation-studio-runtime-debug-ui-cleanup.md) | Automation Studio web UI | 102 | Runtime debug UI cleanup. Implemented; live browser review pending. | none |
| [ui-ux-upgrade-audit-plan.md](./ui-ux-upgrade-audit-plan.md) | FluxIQ Web and Automation Studio | 5944 ⚠ | Deep UI/UX audit with an exhaustive implementation backlog. Largest document in either repository; compact before next use. | none |
| [web-panel-ui-ux-functionality-audit-plan.md](./web-panel-ui-ux-functionality-audit-plan.md) | FluxIQ Web and Automation Studio | 1173 ⚠ | Web panel UI/UX and functionality remediation. Disclosure-control repairs implemented; backlog ready. | none |

## Complete

| Document | Owner | Lines | Scope |
| --- | --- | --- | --- |
| [automation-studio-element-target-fingerprints-plan.md](./automation-studio-element-target-fingerprints-plan.md) | Automation Studio | 333 | Element target fingerprints in recording capture and mappers. Implemented. |

## Superseded

These carry a 2026-08-29 historical tracking notice. They retain audit and
implementation evidence but no longer own current status. Current Studio
render/runtime topology lives in
[automation-studio-render-data-separation-plan.md](./automation-studio-render-data-separation-plan.md)
and `docs/architecture/automation-studio/workspace.md`. Do not plan current
work from them.

| Document | Lines |
| --- | --- |
| [automation-studio-live-refactor-plan.md](./automation-studio-live-refactor-plan.md) | 2770 ⚠ |
| [automation-studio-fast-ui-cache-plan.md](./automation-studio-fast-ui-cache-plan.md) | 1309 ⚠ |
| [automation-studio-lag-remediation-plan.md](./automation-studio-lag-remediation-plan.md) | 1076 ⚠ |
| [automation-studio-data-flow-refactor-plan.md](./automation-studio-data-flow-refactor-plan.md) | 923 ⚠ |
| [automation-studio-ui-lag-root-cause-audit.md](./automation-studio-ui-lag-root-cause-audit.md) | 502 |
| [automation-studio-load-performance-plan.md](./automation-studio-load-performance-plan.md) | 335 |

## Unclassified

These predate the protocol and their headers have not been reviewed.
`Unclassified` means untriaged, not inactive. Each needs a status, owner, and
pairing.

| Document | Lines | Scope |
| --- | --- | --- |
| [llm-assisted-deterministic-automation-expansion-plan.md](./llm-assisted-deterministic-automation-expansion-plan.md) | 3459 ⚠ | LLM-assisted adaptation, training history, and persistence contracts. Likely overlaps the downstream LLM production plan; ownership undeclared. |
| [codebase-audit-remediation-plan.md](./codebase-audit-remediation-plan.md) | 1194 ⚠ | Framework-wide audit remediation. |
| [automation-studio-state-object-index-plan.md](./automation-studio-state-object-index-plan.md) | 1075 ⚠ | Deterministic object/index system for recordings, snapshots, screenshots, proposals, Flow provenance. |
| [flow-initialization-router-ui-plan.md](./flow-initialization-router-ui-plan.md) | 1057 ⚠ | Flow initialization and Router UI. |
| [runtime-kernel-plan.md](./runtime-kernel-plan.md) | 1045 ⚠ | Core runtime architecture, direct-import host runtimes, websocket transport. |
| [node-state-evidence-view-plan.md](./node-state-evidence-view-plan.md) | 974 ⚠ | State/evidence contracts and importer SDK. |
| [flow-unification-and-scriptability-plan.md](./flow-unification-and-scriptability-plan.md) | 823 ⚠ | Flow unification and scriptability across Studio, public contracts, and the web editor. |
| [recording-proposal-generator-plan.md](./recording-proposal-generator-plan.md) | 623 | Keeping recordings as raw reviewable source material rather than auto-proposals. |
| [automation-studio-strict-workspace-layout-plan.md](./automation-studio-strict-workspace-layout-plan.md) | 514 | Replacing the dynamic inner-window canvas with a strict workspace layout. |
| [action-visual-entity-target-plan.md](./action-visual-entity-target-plan.md) | 361 | Actions identifying the visual state entity they interacted with. **Priority triage:** a document of the same name exists downstream and neither declares which side owns the contract. |

⚠ marks documents over the 800-line compaction threshold — sixteen of the
twenty-four here. Compact them the next time work touches them; do not
schedule a bulk rewrite.
