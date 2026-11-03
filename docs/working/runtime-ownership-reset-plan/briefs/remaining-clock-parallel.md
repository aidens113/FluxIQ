Role: Heavy worker; model gpt-6.1-sol; effort max.
Goal: Execute remaining-adapter-manifest Groups4/5/6 in parallel with callback_guards.
Owned source: engine/automation/composite/{boundary,child-bounds,execution}.ts; resume.ts; node-execution/failure.ts; lifecycle-run/dispatch/dispatch.ts; outside-graph/retries.ts; step-loop/{incident-repair,ask-or-park}.ts. Paths under packages/fluxiq/src/.
Own their immediate tests and ALL Group8 nested-port/method reads inside those exact files. Callback worker must not write these files.
Must not touch shared execution-admission/kernel helpers, runtime/execution-observation, graph-run, recovery/run.ts, other callback groups, SQL, Flow contracts, git/shared docs/indexes.
Read: remaining-adapter-manifest.md Groups4/5/6 and overlapping Group8 requirements; exact owned source/tests; Current State.
Stable seam: observedExecutionProperty(observation|undefined, originalReceiver,key) from runtime/execution-observation; automationObservedClock(observation|undefined,input:{now?:()=>number},receiver):()=>number from engine execution-admission/kernel. Other owner freezes any helper additions before you consume them.
Keep original current/delegated caller context; resume must enter an existing kernel or use actual admitted caller before executable clock reads. No fabricated frame/registry/completion owner.
Preserve original receiver/tuple, clocks/deadlines/abort behavior, parked-resume no-repeat, first-run unobserved getters, all retry/source-rebind rules, repair/learning/parking outcome semantics.
Diagnostic clock failure must retain original action error/fault and unknown fence; use safe pinned original timestamp or actual prior timestamp, never replacement delegate or fabricated completion.
Guard actual method selection after awaited predecessors, including retained command/control/parking port objects. Validate on each use, not once before an await. No proxies or replacement owners.
Write bounded own/inherited/replaced getter/native tests before fixes as manifest specifies; negatives persist pending/reopen/no second send, positives exact private receiver and arguments.
Source release now; other source writers own disjoint files. Ask Root before any outside edit. Coordinate helper needs with callback_guards; do not modify its helper files yourself.
Run focused owner tests only; no whole package check/build/audit or composed/runtime benchmark.
Report: docs/working/runtime-ownership-reset-plan/reports/remaining-clock-parallel.md with exact path manifest, red/green and limits.
No git/shared-plan edits/agents. End return contract.
