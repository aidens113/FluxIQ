# Agent Token Efficiency Plan

Status: Active
Status detail: Core's obligations are done: CLAUDE.md loads AGENTS.md, the working-docs audit checks Current State length and ledger validation, and the delegation rule and return contract are mirrored. Kept Active until the paired plan closes.
Created: 2026-09-10
Last updated: 2026-10-30
Owner: Senior supervisor agent
Scope: Core's share of the plan to keep the senior supervisor agent's context small on every project: a `CLAUDE.md` that loads `AGENTS.md`, the mirrored delegation rule and worker return contract, and the `working-docs` audit extension that Core owns.
Paired document: `../!FluxIQWebExtension/docs/working/agent-token-efficiency-plan.md`
Related: [AGENTS.md](../../AGENTS.md), [agent working document protocol](./agent-working-doc-protocol.md), [module size governance plan](./module-size-governance-plan.md)

The design — the draft it refines, the memory tiers, the delegation rule,
the global layer under `~/.claude`, the hooks, and the phases — is owned by
the paired downstream document. This document does not restate it.

---

## Current State

**2026-10-30: MeritPrompts 0.2.0 project integration is refreshed.**

- Shared runtime rules, hooks and lessons live at
  `C:/Users/osrs_/MeritClaude`; `F:/!AgentBrain` is historical.
- Root `AGENTS.md` now directs Claude Code to `CLAUDE.md` and Codex to
  `CODEX.md`. Project rules override global policy, including `pnpm task`,
  validation, repository boundaries and promotion gates.
- `CLAUDE.md` retains project and FluxIQ family lesson imports; global
  `~/.claude/settings.json` owns hooks for both project repositories.
- `CODEX.md` links the shared Codex guide and the FluxIQ family lesson
  index, requiring explicit reads of relevant lessons. It preserves working
  documents and local memory, and makes no claim to install Claude hooks
  or agent/model aliases into Codex.
- The existing working-document checks and protocol remain unchanged.
  Task t815 owns the paired project update; worker `meritprompts-core`
  changed only the root instruction files and its report.
- Both global drift checks, the project structure audit and supervisor
  instruction-path/import assertions passed. All 357 preserved memory/config
  files are unchanged; all eight configured Claude hook entries resolve.
  No application code changed.

**Next:** no runtime integration work remains. Measurement remains owned by
the downstream plan.

**Blockers:** none.

---

## Work Ledger

### 2026-10-30 ? MeritPrompts project runtime integration (t815)

- Agent: senior supervisor; Core instruction files by worker meritprompts-core.
- Changed: root AGENTS.md, CLAUDE.md, new CODEX.md, this document and its generated index; Core worker report.
- Why: update both existing projects to the shared Claude Code/Codex policy without replacing project rules or second-brain memory.
- Validation: `node C:/Users/osrs_/MeritClaude/install.mjs --check` and `--codex --check` -> both passed. Worker diff independently reviewed. `node scripts/structure-audit.mjs --json` -> exit 0, no failures in each repository. Supervisor Node assertions -> both runtime routes/imports/lesson paths passed; 357 preservation hashes unchanged; Claude settings byte-identical; eight hook entries resolve. `git diff --check` -> passed. An audit probe before worktree dependency installation completed could not resolve TypeScript; rerun after setup.
- Outcome: Accepted; instruction integration validated.
- Follow-up: no application tests or interactive runtime sessions needed for these instruction-only edits; phase 4 measurement remains paused.

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

## Worker Briefs

### Brief: meritprompts-core
- Repository: FluxIQ Core, C:/Users/osrs_/FluxStuff/fxwork/t815/!FluxIQ
- Task: Refresh existing project integration with MeritPrompts 0.2.0 for both runtimes.
- Required reads: this document Current State; root AGENTS.md and CLAUDE.md; C:/Users/osrs_/MeritClaude/CODEX.md and templates/CODEX.md; Repository Boundary in AGENTS.md.
- Owns (may edit): root AGENTS.md, CLAUDE.md, new CODEX.md, and your report below.
- Must not touch: other files, global configuration, source, lessons, memory, shared docs, git state. Never commit or push.
- Requirements: add a short runtime entry section in AGENTS.md linking CODEX.md for Codex and CLAUDE.md for Claude; shared policy comes from global install and project rules override it. Replace MeritClaude branding in prose with MeritPrompts while retaining actual C:/Users/osrs_/MeritClaude paths.
- Requirements: CLAUDE.md keeps @AGENTS.md and the current FluxIQ family lesson import, names the new global runtime setup. CODEX.md explicitly links C:/Users/osrs_/MeritClaude/CODEX.md and lessons/fluxiq/INDEX.md; read relevant family lesson files explicitly, since @ imports do not load in Codex. State global installation command and configured Codex models/tools, no Claude model aliases or hooks claimed for Codex.
- Requirements: preserve all project-specific validation, branch, safety and memory rules. Do not copy global hooks into either repo.
- Definition of done: inspect diff, git diff --check, check referenced source and lesson paths exist. No full suites. Report exactly what was checked.
- Report to: docs/working/agent-token-efficiency-plan/reports/meritprompts-core.md

## Open Questions

None here; the open questions are in the paired document.
