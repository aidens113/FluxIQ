# Immutable decision evidence

The decision window projects declared view members into an immutable history and
one `core.current_view` tail. Raw execution evidence remains whole for guarded
execution and recall. The projection does not rank, cap or truncate members.

From its first appearance, each present declared historical member contains
`{"core.view_reference":{"callId":"original-call","group":"group-name"}}`.
The reference always names its own original call. Undeclared fields, key order
and other result metadata remain intact. Appending evidence does not rewrite an
earlier historical entry.

The current-view tail contains `groups`, with each group's `group`, source
`callId`, optional `holder`, and complete declared `value`. Top-level members
form `top`; held members form `holder:<name>`. Groups advance independently:
a later page-only result retains the previous held rows. Empty arrays and null
are present replacement values; absent members are not fabricated. If a top
member contains an independently declared holder, its nested members remain
references and the held group carries their full latest payload once.

`core.recall_result` reads remembered original held members, without dispatching
an observation or granting execution authority. Its restored payload uses an
independent tool-qualified group and does not replace current client groups.
Clients with no declared view keys retain their whole historical results.

Route situations have a separate append-only screened projection. The first
situation carries `state`; later situations identify `baseSituation` and contain
only `updates` and `removed` keys. Model-facing deltas are computed after
screening, while full execution state and existing route equality remain intact.

Historical tool and route entries precede Core's passing notes, then the changing
current-view/current-Flow, history, draft and budget tails. Stable provider schemas
remain before evidence; actual offer changes can still change that earlier prefix.
Owning request tests capture the provider's serialized body and measure common
prefixes in UTF8 bytes, including non-ASCII text and JSON escaping. This proves
request stability, not provider cache-hit rates or live model performance.

## What the prompt cache reads

A provider's cache matches a prefix, so what a decision costs turns on what the next
request sends again byte for byte. One place names the entries that change
between one call and the next (`runtime/llm/evidence-moves/evidence-that-moves.ts`),
and a new Core entry that is rewritten, replaced or taken away belongs there:

- written afresh for every decision: `core.current_view`, `core.current_flow`,
  `core.evidence_history`, `core.flow_draft`, `core.budget`, and the list of calls
  `core.run_nodes` may run again;
- Core's passing notes, which a newer one or a later call takes away and whose call
  ids renumber: `core.decision_check`, `core.no_progress`, `core.completion_check`,
  `core.amendment_check`, `core.request_check`, `core.repeat_check`, `core.loop_check`,
  `core.search_check`, `core.refusal_run`, `core.rerun_result`, `core.stall_recovery`,
  `core.rerun_check`. The window puts them after every result, in the order they
  arose, rather than where they arose (`runtime/llm/context-window.ts`).

**Anthropic's markers** (`runtime/models/providers/anthropic/cache-content.ts`). A
request carries at most four: the system prompt, the end of the head, the last entry
before the first that changes, and one 19 entries before that. A marker looks back
at most 20 blocks for an earlier request's, itself included, so a request that added
up to 38 entries still reads what the last one wrote. No marker sits on an entry that
changes, and there is no automatic marker: it would land after the changing tail and
pay the write premium on bytes never read back. Only the panel's chat keeps one, since
its last block is what the next turn sends again. Markers change nothing that is sent.
DeepSeek reads the same request and caches its longest shared prefix itself.

**The head stays the same for a loop's length.** Nothing grows it:

- No node definition is in the head. A definition is on the entry of the call that
  first described it; one an earlier round described is on `core.described_nodes`, the
  window's first entry, fixed for its length; anything else rides after the window on
  `core.newly_described_nodes` (`runtime/llm/provider-task/described-nodes.ts`). A look
  Core takes for itself (`core.attempt_look.N`) describes nothing.
- The tools and the decision schema stay as they were through the wrap-up, in every
  loop: the budget entry says that no tool runs, and a call made anyway is answered
  without running (`runtime/llm/loop-budget.ts`). Amending stays in the schema when it
  is not on offer, and is refused if asked. The schema is words the model reads, not
  something the provider holds it to.

What still changes the head, each once: completion first being offered, on a loop with
no opening call; looks withdrawn after an ignored redirect; `core.run_nodes` first
offered; a new stage's `promptVersion`; and the draft's guide below first appearing,
on a loop that opens with no draft to show.

**What the model reads of its draft.** The whole list of steps on every decision, in
`core.flow_draft` after the marker, as ever. Its long constant guidance goes in the
head once, under `evidenceLoop.flowDraftGuide`, in the same words; the entry keeps
only what is said conditionally (`runtime/llm/provider-task/draft-guide.ts`). The
loop's own entry is unchanged: only the wire differs.

The draft is not sent only when it changes, because it changes on most calls. It
lists every step, so its text changed on 40 of the 51 decisions of
`run-mw37vz9n-a77a02c2`, 18 of 24 of `run-mvwx2cob-3454e2ce` and 17 of 18 of
`run-mw0jw263-0251c104`. Measured over those requests by a cache simulation, keeping
a copy per change costs more than leaving it uncached ($0.36, $1.03 and $0.12 more:
every copy stays in every later request), and keeping one copy and moving it, or
parking it among the results once it has stood still, changes the bill by at most $0.04.

The step log records `cacheWriteInputTokens` beside the hits and misses. `pricing.ts`
holds the official rates; a hit on Sonnet 5.5 or Opus 5.5 is 0.05x input.
