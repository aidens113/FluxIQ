# Agent Token Efficiency Plan

Status: Active
Status detail: Core's obligations are done: CLAUDE.md loads AGENTS.md, the working-docs audit checks Current State length and ledger validation, and the delegation rule and return contract are mirrored. Kept Active until the paired plan closes.
Created: 2026-09-10
Last updated: 2026-09-10
Owner: Senior supervisor agent
Scope: Core's share of the plan to keep the senior supervisor agent's context small on every project: a `CLAUDE.md` that loads `AGENTS.md`, the mirrored delegation rule and worker return contract, and the `working-docs` audit extension that Core owns.
Paired document: `F:\!FluxIQWebExtension\docs\working\agent-token-efficiency-plan.md`
Related: [AGENTS.md](../../AGENTS.md), [agent working document protocol](./agent-working-doc-protocol.md), [module size governance plan](./module-size-governance-plan.md)

The design — the draft it refines, the memory tiers, the delegation rule,
the global layer under `~/.claude`, the hooks, and the phases — is owned by
the paired downstream document. This document does not restate it.

---

## Current State

**Core's obligations are done.**

- `CLAUDE.md` at the repository root imports `AGENTS.md` and the FluxIQ
  family lessons index from `F:\!AgentBrain`. Until now Claude Code loaded
  no repository instructions here at all.
- `scripts/structure-audit/rules/working-docs.mjs` now also fails, ratcheted
  per document, a `## Current State` over 150 lines (key `<file>#current-state`)
  and any `## Work Ledger` entry without a `- Validation:` bullet or whose
  validation text is hearsay (`reported success`, `worker(s) reported|said|claimed`;
  key `<file>#ledger`). Tests: `scripts/structure-audit/rules/tests/working-docs.test.mjs`,
  run by `pnpm structure:test`. No Core document violates either check
  today, so nothing was baselined; the longest `Current State` is 144 lines,
  and the first edit that pushes one past 150 fails outright rather than
  ratcheting, which is the intended behaviour for a new violation.
- `AGENTS.md` gained the `Delegation` subsection under Workflow Modes; the
  protocol gained the 40-line brief budget, the report file format, and the
  12-line worker return contract. Both are byte-identical downstream.

**Next steps**

1. None in Core. The remaining phases (brain hooks, templates, memory
   promotion, measurement) live in the paired document.

**Blockers:** none.

---

## Work Ledger

### 2026-09-10 — Paired document created

- Agent: supervisor
- Changed: this document; `docs/working/README.md` regenerated.
- Why: The downstream plan touches Core's `AGENTS.md`, protocol, and audit
  rule, so Core needs a same-named pair recording its obligations.
- Validation: `pnpm structure:check` -> passed after `pnpm structure:baseline`
  regenerated the index. Documentation only.
- Outcome: Accepted
- Follow-up: Phase 0 `CLAUDE.md`.

### 2026-09-10 — CLAUDE.md, audit extension, delegation rule

- Agent: supervisor, with worker audit-ledger on Opus 5
- Changed: `CLAUDE.md` (new); `scripts/structure-audit/rules/working-docs.mjs`
  and `rules/tests/working-docs.test.mjs` (new); `package.json`
  (`structure:test`); `AGENTS.md` (Delegation); the protocol (brief budget,
  report format, return contract); `docs/working/README.md` regenerated.
- Why: Phase 0 and Core's Phase 2 share of the paired plan. The worker's
  hearsay pattern matched the noun phrase "worker reports", a false positive
  on a downstream ledger entry, so it was tightened to `workers? (reported|said|claimed)\b`;
  a shell-escaped `\b` first landed as a backspace byte, caught by two tests.
- Validation: `pnpm structure:test` -> 11 pass, 0 fail; `pnpm structure:check`
  -> passed (110 warnings, 402 baselined); the mirrored rule file downstream
  is byte-identical (`cmp`) and its tests also pass 11 of 11.
- Outcome: Accepted
- Follow-up: none in Core.

---

## Open Questions

None here; the open questions are in the paired document.
