# E root source changes, awaiting D2 freeze

Updated generic decision and recall instructions to immutable original-call view references, independent current-view/recall groups and screened route baseline/deltas. No client fixture text added. Historical supersededBy remains legacy public constant only.

Existing real-service request-prefix tests now capture actual serialized outbound provider bodies, compare UTF8 Buffer prefixes and account for JSON string escaping. Declared-view case requires all prior historical bytes immutable from their first appearance, one full current-view group, and non-ASCII input. Network/keys remain unit stubs; no paid or live model calls. No output-schema behavior changed.

Initial local stdin script lost literal non-ASCII through PowerShell codepage; source now uses explicit Unicode escapes to guarantee actual multibyte runtime text. Root has not run checks while D2 source is active.

Architecture contract documented in docs/architecture/automation-studio/evidence-window.md. Owning selectors are evidence-loop/tests/request-prefix.test.ts plus existing evidence-recall/tests and context-window/tests. Full acceptance waits actual loop integration/source freeze.
