# Wrapper request forwarding discovery

Outcome: Done
Changed: `docs/working/runtime-ownership-refactor/reports/wrapper-request-forwarding-plan.md` only
Validation: Not run; this was a read-only source trace. No tests or builds run.
Not verified: Runtime behavior was not exercised; conclusions below are source findings, not execution evidence. No provider, browser, panel, paid run, or user data was accessed.

## Actual call graph

The project brief’s installed loop is assembled in `runtime/service/project-build/brief-ports.ts:284-310`:

```text
harness.executeTool
  -> project.cancellation.tool(harness.executeTool)
  -> flow-bootstrap/action-permissions.executeTool
  -> flow-bootstrap/person-needed.executeTool
  -> route-state.recording(personNeeded.executeTool)
  -> written(routing.recording(...), togglesWritten)
  -> brief loop.executeTool
```

A normal loop request is forwarded unchanged by `written` (`brief-ports.ts:570`) and `route-state/build-routing.ts:222`; the routing wrapper inspects the result and route state but passes the same `call` object to its delegate. `person-needed-tool-calls.ts:184` likewise forwards the normal call object unchanged. It can additionally produce a fresh look request at line 163 after an intervention; that is a newly constructed request (`<callId>.look`, cloned initial-observation input, optional signal), and currently does not inherit the source call’s private companion. This generated descendant needs an explicit adversarial case and companion inheritance if B’s parent/series policy treats the post-intervention look as a child.

The permissions wrapper has two actual forwarded request copies: non-reset path `action-permissions.ts:378-379` (`held`, then `{ ...held, permission }`) and reset path line 438 (`{ ...call, value, permission }`). Neither copy calls `inheritAutomationStudioBuildToolRequest`. This is the concrete break: the subsequent cancellation wrapper at `flow-bootstrap-commands/cancellation.ts:75-81` copies its input to add the composed signal and does call inheritance, but cannot recover a companion already dropped by permissions.

The cancellation copy is followed by `harness-options/registry.ts:246-267`, which creates the loop `executeTool`, adds build scope fields in a fresh request at 250-261, inherits from the input, and registers that Core-created function as `frame`; the recalled variant is registered `recall`. `registry.ts:213-222` also creates the selected-option request with the default permission and inherits its companion. In `harness-options/binding.ts:709-728`, `executionFor` creates the final selected implementation request, inherits, then invokes the callback using the original callback/receiver pair returned by `automationStudioLlmBindingFieldOrigin`. The stable producer report says this continues through the actual private registry/binding request copies and cancellation signal to B’s observed installed callback; the raw callback and its original receiver/argument tuple are pinned there. No equality of public fields substitutes for the private companion.

The StartCheck arrival path is a separate real Core-produced call entering the same chain: `brief-ports.ts:325` passes `(call) => built.loop.executeTool(call)` to `AutomationStudioSiteResetStartCheck`; `site-reset/start-check.ts:274-276` invokes that callback with the StartCheck instance as receiver under `runAsAutomationStudioCoreMove`. The generated arrival request is passed as an actual argument. The lambda itself does not copy the request; `built.loop.executeTool` then uses the chain above. `readStartState` is a separate producer callback and is outside the requested ordinary raw-tool endpoint.

## Missing private forwarding

1. `flow-bootstrap/action-permissions.ts:378-379`: inherit `call -> held`, then `held -> the permission-enriched request` (or inherit the original call directly into the final request while ensuring no intermediate copied request is later treated as a descendant).
2. `flow-bootstrap/action-permissions.ts:438`: inherit `call -> { ...call, value, permission }`.
3. `parking/person-needed-tool-calls.ts:163`: the generated fresh-look request has no inheritance from its triggering call. Treat as a child only through the actual observed execution relationship; do not infer it from the `.look` suffix or call status.

Other request forwarding/copy edges observed in this path already preserve the companion: cancellation `call -> placed`; registry loop `input -> placed`; registry selected-option `input -> placed`; binding `input -> placed`. Routing, `written`, normal person-needed forwarding, and the StartCheck lambda pass the same request object.

## Wrapper identity / ownership proposal

Keep the wrapper factory registry private to `build-execution/tools`; do not infer trust from names, status, tool IDs, result flags, or public request equality. Preserve current harness registrations (`registry.executeTool` as `frame`, recall adapter as `recall`, description implementations as `pure`, selected implementation wrapper and run-node describing wrapper as `frame`). Add exact `frame` membership at each Core-owned delegating wrapper factory in this actual path: permission wrapper, person-needed wrapper, route-state recording wrapper, `written`, cancellation wrapper, and the project-build StartCheck callback lambda. A frame tag only admits traversal when the observer sees a real descendant at its actual invocation; it must not itself bless the raw callback or make an injected callback pure/frame. Keep raw callbacks unsupported by default, with the existing actual-origin/receiver and completion evidence checks.

File ownership should remain disjoint by responsibility: `flow-bootstrap/action-permissions.ts` owns permission request inheritance and wrapper identity; `parking/person-needed-tool-calls.ts` owns generated-look inheritance and person-needed wrapper identity; `route-state/build-routing.ts` owns routing wrapper identity; `service/flow-bootstrap-commands/cancellation.ts` owns cancellation wrapper identity; `service/project-build/brief-ports.ts` owns `written` and StartCheck lambda identity; `llm/harness-options/{registry,binding}.ts` and `build-execution/tools/**` remain the stable private API/terminal callback owner from `build-tool-producer-implementation.md`. Keep tests with each subject under its owning `tests/` directory.

## Narrow adversarial producer tests

- Use the actual project brief assembly with a controlled raw binding callback and private observer; assert the ordinary call reaches the same installed callback with the original receiver/arguments and retains its companion through each wrapper.
- Exercise both permission paths (site-reset absent/present) with fresh spread requests; assert original observed parent/series survives permission enrichment and the real raw callback is still subject to B’s normal completion/unknown fencing.
- Assert a deliberately cloned lookalike, changed function/receiver, and copied request without `inheritAutomationStudioBuildToolRequest` remain unsupported even when public fields match.
- Trigger the person-needed fresh look; assert the chosen parent semantics explicitly (inherited actual parent if a descendant, otherwise a distinct supported producer path), and that `.look` identity/result flags alone do not grant closure.
- For every newly registered Core wrapper, assert actual forwarded descendants close only after observation, while an injected raw callback and a same-shaped unrelated callback remain unsupported. Include the StartCheck arrival to verify its call enters the same real registry/binding chain.

All validation above is source inspection only; the test list is proposed, not run.
