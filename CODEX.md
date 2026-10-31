# FluxIQ Core: Codex specifics

Read [AGENTS.md](AGENTS.md) for project rules and validation commands, then the
[MeritPrompts Codex runtime guide](C:/Users/osrs_/MeritClaude/CODEX.md).

Install or refresh global shared policy, the Codex adapter and global lesson index
with `node C:/Users/osrs_/MeritClaude/install.mjs --codex --apply` before starting
a new session. The snapshot lives in `$CODEX_HOME/AGENTS.md` (default
`~/.codex/AGENTS.md`); an existing `AGENTS.override.md` takes precedence.

Read the [FluxIQ family lesson index](C:/Users/osrs_/MeritClaude/lessons/fluxiq/INDEX.md)
and open the relevant lesson files explicitly. Claude's `@file` imports do not
load them in Codex. Keep project handoffs and working documents in `docs/working/`
and preserve runtime-provided local memory.

Use the configured Codex model and tools exposed by the current runtime. Claude
model aliases and agent definitions apply only to Claude Code; MeritPrompts installs
no enforcement hooks or usage telemetry into Codex. Project branch, validation and
push rules in `AGENTS.md` still apply.

Follow the routing table in the shared MeritPrompts Codex guide linked above.
GPT-6.1 Sol Max is the ceiling; never use Astra for any role, fallback or
review, and never escalate to Ultra. Use the guide's role defaults and
availability rules; keep the model table in MeritPrompts rather than copying
it here. Set the exact supported model and effort explicitly in worker briefs
and dispatch controls. Instructions do not change the running lead's model.
