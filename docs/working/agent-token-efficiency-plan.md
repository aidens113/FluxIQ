# Agent Token Efficiency Plan

Status: Active
Status detail: Owned by the downstream repository; this document records only Core's obligations under that plan, none of which have started.
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

**Nothing started in Core.** The paired plan was authored today. Core's
obligations, in the order the plan's phases reach them:

1. **Phase 0.** Add a `CLAUDE.md` at the repository root containing
   `@AGENTS.md` and at most eight Claude-specific lines. Claude Code does not
   read `AGENTS.md` on its own, so today a supervisor session here loads the
   role, boundary, and validation rules only if the model chooses to open
   the file.
2. **Phase 2, Core first.** Extend `scripts/structure-audit/rules/working-docs.mjs`
   to fail a ledger entry with no `- Validation:` line or one containing
   "reported success" or "worker reported", and to fail a `Current State`
   over 150 lines, both ratcheted. Mirror the file downstream byte for byte,
   then run `pnpm structure:baseline` in both repositories.
3. **Phase 2, mirrored.** Add the "Delegation" subsection to `AGENTS.md`
   and the worker return contract and report template to the protocol, in
   the same work unit as the downstream copies.

**Next steps**

1. Phase 0 `CLAUDE.md`, together with the downstream one.

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

---

## Open Questions

None here; the open questions are in the paired document.
