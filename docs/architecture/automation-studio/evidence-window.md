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

Historical tool and route entries precede changing current-view/current-Flow,
history, draft and budget tails. Stable provider schemas remain before evidence;
actual offer changes can still change that earlier prefix. Owning request tests
capture the provider's serialized body and measure common prefixes in UTF8 bytes,
including non-ASCII text and JSON escaping. This proves request stability, not
provider cache-hit rates or live model performance.
