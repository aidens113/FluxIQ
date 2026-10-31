# Report: meritprompts-core

## Outcome
Done. Core root instruction entry points now support MeritPrompts 0.2.0 for Claude Code and Codex.

## What changed and why
- AGENTS.md adds explicit runtime pointers and updates MeritPrompts branding without changing project validation, branch, boundary or memory rules.
- CLAUDE.md retains both existing imports and adds the shared Claude runtime guide and refresh command.
- CODEX.md names the shared Codex guide, explicit FluxIQ lesson index, snapshot refresh command, configured runtime models/tools and absence of Codex hooks.
- Existing C:/Users/osrs_/MeritClaude paths remain actual filesystem references.

## Commands run and observed results
- `git diff --check` -> exit 0; only line-ending notices for the supervisor-owned working document.
- `git diff -- AGENTS.md CLAUDE.md` and CODEX.md inspection -> edits scoped to runtime instructions and branding.
- `Test-Path` for shared CODEX.md, CLAUDE.md, FluxIQ lesson index and installer -> all True.
- Node assertions -> runtime links, existing Claude imports and whitespace checks passed.

## Not verified
No package commands, full suites, interactive Claude/Codex sessions or global installer runs; supervisor owns integration and validation.

## Open questions or contradictions found
None.
