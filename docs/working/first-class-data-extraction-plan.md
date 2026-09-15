# First-Class Data Extraction Plan (Core share)

Status: Active
Status detail: Planning; the Core investigation is running and the downstream document owns the plan and its sequencing.
Created: 2026-09-15
Last updated: 2026-09-15
Owner: Senior supervisor agent
Scope: Core's share of making structured data extraction a fundamental FluxIQ capability: domain-neutral dataset contracts (records with a schema), per-run persistence, table preview, CSV/JSON export, iteration over records by later nodes, the web-panel UI for them, and the recording-proposal seam through which a domain proposes extract nodes.
Paired document: `F:\!FluxIQWebExtension\docs\working\first-class-data-extraction-plan.md`
Related: [package boundaries](../architecture/package-boundaries.md), [code structure](../architecture/code-structure.md), downstream reports under `F:\!FluxIQWebExtension\docs\working\first-class-data-extraction-plan\reports\`

---

## Current State

**Phase, as of 2026-09-15: planning.** The user decided that structured data
extraction is a fundamental part of FluxIQ, including Core. The downstream
document owns the plan, phases, and sequencing; this document owns the state of
the domain-neutral contracts Core will provide.

**What is true today:** Core persists a domain's action results inside run
attempts, and the web domain's `web.dom.extract_list` returns its records there,
but Core has no dataset concept, no preview, no export, and no iteration over
records, and recordings never propose extract nodes.

**In flight:** read-only worker `ex-b-core` is mapping run output persistence,
state and variable concepts, iteration nodes, the recording proposal pipeline,
import/export and storage, and web-panel surfaces, and recommending the minimal
generic design. Its report is
[reports/ex-b-core.md](./first-class-data-extraction-plan/reports/ex-b-core.md).

**Next steps:** record the Core contracts and phases here once the downstream
plan is written; no Core code changes until then.

**Blockers:** none.

---

## Worker Briefs

The Core brief `ex-b-core` is recorded in the downstream document's Worker
Briefs section.

## Work Ledger

### 2026-09-15 — Paired plan created; Core investigation dispatched
- Agent: downstream supervisor; worker `ex-b-core`
- Changed: this document
- Why: the downstream plan crosses into Core for domain-neutral datasets
- Validation: not validated; planning document only, no Core code changed
- Outcome: Partial
- Follow-up: record Core contracts from the downstream plan

## Open Questions

- None yet.
