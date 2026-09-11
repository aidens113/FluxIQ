@AGENTS.md
@F:/!AgentBrain/lessons/fluxiq/INDEX.md

Claude Code specifics, on top of `AGENTS.md`: start a task with `/resume`
and end it with `/handoff`, then `/clear`. Dispatch workers through the
`worker` agent; its definition carries the worker rules, so a brief holds
only the task. Global rules and the memory tiers load from
`~/.claude/CLAUDE.md`, installed from `F:\!AgentBrain`.
