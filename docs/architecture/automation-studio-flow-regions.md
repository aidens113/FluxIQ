# Automation Studio Flow Regions

Execution regions let one canonical Flow combine ordinary deterministic nodes,
event/trigger work, and evidence-driven policy actions without creating new
top-level artifact types. Every node in a region-enabled Flow belongs to
exactly one `deterministic`, `trigger`, or `policy` region.

## Region contracts

A region declares a stable ID and name, owned node IDs, typed entry and exit
ports, an optional timeout, and optional runtime capabilities. An edge crossing
a region boundary requires a `regionHandoff` whose ports match the graph edge.
Missing ownership, duplicate ownership, invalid ports, incompatible types, and
implicit cross-region edges are validation errors.

The visual editor can create, remove, rename, classify, and configure regions,
assign selected nodes, and derive explicit handoffs from cross-region edges.
Region edits participate in the editor's unsaved-change detection and are
persisted on the canonical Flow.

## Runtime behavior

The region compiler produces one execution plan containing node ownership and
typed handoffs. Runtime traces retain node attempts and add region IDs plus
explicit boundary transitions. Policy-region attempts also retain a compact
selected/rejected/waiting explanation with the registered output and expected
confirmation IDs where applicable. Region capability requirements are checked
against the capabilities actually bound by the importer. Timeouts and abort
signals bound policy confirmation waits and the surrounding region run. A
deadline actively aborts the cooperative child signal instead of merely
returning while work continues;
failed actions may cross a declared `failed` handoff into deterministic
recovery.

Published composite snapshots freeze regions and handoffs along with nodes and
edges. A caller therefore continues to execute the pinned region layout even
if the child draft later changes. Global-to-domain calls require both a grant
declared by the Flow and that domain being bound by the active importer runtime.

## Policy and IO safety

Policy action nodes dispatch only importer-registered output IDs. An importer
input whose action binding maps it to an output is recorded as action evidence
and may confirm whether that output succeeded. It is never admitted as policy
state. State-role inputs remain non-executable observations. Confirmation
failure follows the node's failed route and can enter a declared recovery
region.

Legacy task graphs are exposed or migrated as a single policy region, while
legacy routine graphs become a deterministic region. This preserves existing
behavior while making the boundary explicit in the canonical Flow model.
