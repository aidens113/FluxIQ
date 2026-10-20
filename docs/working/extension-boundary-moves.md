# Extension Boundary Moves

Status: Active
Status detail: Three downstream lanes (G, H, S) are moving generic gateway-client, tooling, accounting, prompt and single-source code from the web extension into Core; dispatched 2026-10-19, nothing merged yet.
Created: 2026-10-19
Last updated: 2026-10-19
Owner: Senior supervisor agent
Scope: Core's side of the downstream extension/Core boundary audit's move plan: what Core gains (gateway client protocol, build-cache engine and task rules, run accounting and build lifecycle, generic prompt rules, single sources for activity wording, record-set reading and dedupe/sort, capture and request policy, secret screening) and the compatibility notes for each. The findings, phases and ranked list stay downstream.
Paired document: `!FluxIQWebExtension/docs/working/extension-core-boundary-audit.md` (findings and move plan); execution hub `!FluxIQWebExtension/docs/working/trace-offline-trials-plan.md` (lane table and briefs)
Related: [code structure](../architecture/code-structure.md), [trace-offline-trials-plan.md](./trace-offline-trials-plan.md)

---

## Current State

**Approved (user, 2026-10-19):** implement the downstream audit's six-phase move plan with subagents, including the
tooling policy: Core owns the build-cache engine and the shared task rules, downstream imports them, and any copy
left behind gets a mechanical drift check.

**Lanes (paired branches in both repositories, worktrees under `C:/Users/osrs_/FluxStuff/fxwork/<id>/`):**

| Lane | Branch | Core side |
| --- | --- | --- |
| G | `task/t726-gateway-client-into-core` | `client-gateway-websocket` gains reconnect with backoff, heartbeat, session-scoped queue, command reconciliation, lease epoch fencing and one session-picking rule; tests with a fake socket |
| H | `task/t727-guards-and-tooling` | `scripts/structure-audit*` gains any rule kind the downstream provider-call guard needs; `scripts/build-cache` and `scripts/task` expose the engine and shared rules as importable modules, CLI unchanged |
| S | `task/t728-single-sources-telemetry` | Core publishes run accounting and the build lifecycle; one Core source for activity headline/pacer/wording, `where`/number reading, dedupe/sort; generic rules from the web system instructions into Core's prompt (contract pins updated deliberately); capture and `requestsEnabled` policy; the card-number screen in the secret screen |

**Compatibility watch:** the gateway wire protocol (lane G) must stay synchronized with downstream protocol types,
routing and capabilities; prompt text moved by lane S changes contract pins and goes through the prompt contract gate;
lane H keeps `pnpm task` flags, ids, branch names and JSON output unchanged.

**Merge order:** each lane finishes downstream first, then here under Core's own gates. Lane H's tooling change lands
last. The reset redesign (t724) touches neither lane's files.

**Merged (2026-10-19):** lane G (t726: the client half of the gateway protocol in `client-gateway-websocket`; the
connection queues until `session_ready`) and lane H (t727: build-cache engine, task rules and the web-build seam
exported for downstream import; a `restricted-references` structure rule kind). Lane S (t728) is committed on its
branch, merged with `dev`, and finishing follow-ups before it merges. A later downstream fix (t735) restores four
small git and path helpers as local copies so `sync-core` can update a Core that predates the imported tooling; a
drift test fails the downstream build if they ever differ from Core's.

**Next:** merge lane S; record the Core-side checks in the ledger below.

**Blocked:** nothing needs the user.

## Work Ledger

### 2026-10-19 — Paired document opened; lanes dispatched
- Agent: supervisor
- Changed: this document
- Why: the downstream move plan was approved and three lanes edit Core.
- Validation: not validated; dispatch only.
- Outcome: Partial
- Follow-up: integrate lanes G, H, S.

## Open Questions

None requiring user input.
