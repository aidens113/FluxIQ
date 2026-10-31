# P8 native structural cleanup

Outcome: Done. The six native-owned findings in the lead's first downstream audit are addressed in source. Source is frozen again for lead verification. No downstream check, test, typecheck, build, audit, browser session, provider/API call or git operation was run by this worker.

The authoritative audit recorded contract-spread findings in capture.ts, run.ts and retries/tests/reacquire.test.ts; run.ts at 823 lines against the 800-line limit; and packed statements in the retry and host tests. The seventh E2E import finding belongs to the lead and was not edited here.

## Exact changes

| Downstream path | Change |
| --- | --- |
| domain/src/runtime/llm-evidence/capture.ts | Build the gateway command, scoped capture parameters and requested provenance scope through explicit typed present<T> fields. Optional values remain absent when undefined; false/zero are not truthiness-filtered. Only the original entirely absent scope selects merged/top defaults. The existing session, hidden marker, timeout, resource and provenance behavior is retained. |
| domain/src/runtime/llm-evidence/node-run/retries/scoped-look.ts | New approved cohesive helper, webNodeScopedReacquire. It owns the previously added identity prior-scope preparation and corresponding finder construction, receives the ordinary page-read callback, and does not import the run coordinator. The moved scope construction uses explicit typed fields. |
| domain/src/runtime/llm-evidence/node-run/retries/index.ts | Export the new scoped-look helper. |
| domain/src/runtime/llm-evidence/node-run/run.ts | Replace the new finder/preparation block with the scoped-look helper and remove the moved identityBeforePage responsibility and unused URL-path import. This removes the growth responsible for the 823-line failure through an actual module split. |
| domain/src/runtime/llm-evidence/node-run/retries/tests/reacquire.test.ts | Name the existing typed saved element before its permitted same-object copy/override, retaining every fixture field; unpack each of the three flagged callback lines. Assertions and expected outcomes are unchanged. |
| domain/src/runtime/tests/host-runtime-reacquire.test.ts | Unpack the flagged late-response callback into one statement per line. Assertions and timing operations are unchanged. |

The helper preserves the existing admission gate before requesting scoped prior evidence; canonical-first scope aliases; unsupported/absent/unreadable distinctions; prior top reuse; actual child capture; run.looked; abort propagation; and the same final finder input. Its injected reader is the existing readablePage callback with the same request and options. No source hook, matching/classifier behavior, stable interface, action/failure data, oracle, schema, rule, limit or baseline changed.

Validation was deliberately not run: the fix brief forbids downstream checks while the sibling Core SDK build is active and source has not reached its final freeze. The lead must observe the focused checks and final audit after this freeze; no passing audit or measured post-edit line count is claimed here.

Outcome: Done
Changed: the six exact downstream paths listed above; this report only in Core
Validation: not run (brief forbids checks during the concurrent SDK build)
Not verified: type compatibility, focused test outcomes, final structure audit or browser behavior
Report: C:/Users/osrs_/FluxStuff/fxwork/t828/!FluxIQ/docs/working/framework-heavy-lifting-plan/reports/codex-1031/p8-identity/native-fix.md
Notes: Source frozen. Only the reported native structural findings were changed. Lead owns all acceptance checks.
