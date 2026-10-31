@AGENTS.md
@C:/Users/osrs_/MeritClaude/lessons/fluxiq/INDEX.md

Claude Code specifics, on top of `AGENTS.md`: start a task with `/resume`
and end it with `/handoff`, then `/clear`. Dispatch through the tiered
agents (`worker-light`, `worker`, `worker-heavy`, `supervisor`); their
definitions carry the worker rules, so a brief holds only the task. Global
rules and the memory tiers load from `~/.claude/CLAUDE.md`, installed from
MeritPrompts (`C:/Users/osrs_/MeritClaude`).

Read [MeritPrompts Claude runtime guidance](C:/Users/osrs_/MeritClaude/CLAUDE.md)
for model routing and hooks. Refresh the global instructions, agents, skills and
hooks with `node C:/Users/osrs_/MeritClaude/install.mjs --apply`; hooks remain
installed globally in `~/.claude/settings.json`.
