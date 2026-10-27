@AGENTS.md
@C:/Users/osrs_/MeritClaude/lessons/fluxiq/INDEX.md

Claude Code specifics, on top of `AGENTS.md`: start a task with `/resume`
and end it with `/handoff`, then `/clear`. Dispatch through the tiered
agents (`worker-light`, `worker`, `worker-heavy`, `supervisor`); their
definitions carry the worker rules, so a brief holds only the task. Global
rules and the memory tiers load from `~/.claude/CLAUDE.md`, installed from
MeritClaude (`C:/Users/osrs_/MeritClaude`).
