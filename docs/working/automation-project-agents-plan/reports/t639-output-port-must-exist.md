# t639 output-port-must-exist: worker report

## Outcome

Done. Core now refuses an interface output that is bound to a port the step's node does not declare. The refusal applies to the subflow brief path and to the whole-candidate path, and names the ports the node does declare.

## What changed and why

- **New: `flow-bootstrap/candidate/interface-output-port.ts`**, `automationStudioInterfaceOutputPort`, exported from the `candidate/index.ts` barrel. This is the one reader of what a part's interface output reads (`$node.<key>.<port>`). It returns one of:
  - `value`: a declared port, a call node's own `parameters.outputs` name, or a port of a node the registry does not know;
  - `route`: a success or failure role, keeping t594's earlier semantics;
  - `unknown`: the definition is known and the port is not declared, so it names `declared`.
  - It lives in `candidate/` because `subflow-candidate` already imports `candidate`. Putting it in `subflow-candidate` would have created a module cycle.
- **`subflow-candidate/route-outputs.ts`** now uses that reader.
  - `subflow.output_not_a_value` is unchanged.
  - New `subflow.output_unknown_port` at `flow.output.<id>`. Its message: "...bound to "<port>" of one of this part's steps, and its node "<id>" declares no output by that name: it declares only <ports>...". It ends with t581's way out ("end the brief blocked and name the output, so the plan can change").
- **The whole-candidate path had the same hole.** `authoring/assemble.ts` `partInterface` checks only that a `$step.` binding resolves to a step, and `automationStudioFlowBootstrapWrittenPlanBindingIssues` checks only node parameters, not interface outputs.
  - Fixed in **`candidate/submission.ts`** with a private `partOutputPortIssues`. It adds `candidate.part_output_unknown_port` at `plan.subflows.<i>` to the binding issues, refused under `candidate.loop_or_binding_refused`.
  - A whole candidate has no brief to end, so its way out is "drop the output, and have the step that needs the value read it where it is made".
  - The check runs for `submit` and for `submitComposed`.
- In a subflow brief, the scope check runs before the inner controller. The callable target therefore gets only the `subflow.` code. A further part the target calls would get the `candidate.` code.

## Commands run and observed results

- `npx vitest run .../flow-bootstrap/subflow-candidate .../flow-bootstrap/candidate` (in `packages/fluxiq`):
  - first run: 2 failed out of 224. My tests used the wrong node ids; the fixture registers `web.output.dom-click`.
  - after fixing the tests: `Test Files 31 passed (31)`, `Tests 224 passed (224)`.
- `npx tsc --noEmit -p tsconfig.json` (in `packages/fluxiq`): exit 0, no output.
- `node scripts/structure-audit.mjs`: `structure-audit: passed (375 warning(s), 1156 baselined)`. The only warning on a nearby file is the existing 420-line advisory on `scoped-submission.ts`, which I did not edit.

## Tests added

- `subflow-candidate/tests/scoped-submission.test.ts`:
  - `count = $step.press.address` on a click is refused `subflow.output_unknown_port`, the message names "success, failed", and it carries the way out;
  - `$step.rows.records` is accepted.
- `candidate/tests/interface-output-port.test.ts`:
  - a whole candidate whose part output reads `$step.rows.address` is refused `candidate.part_output_unknown_port`, naming success, failed and records, and saying "drop the output";
  - `$step.rows.records` is accepted;
  - unit cases for the reader: route, unknown port, a call's own output, an unknown output on a call, an unregistered node, and a missing node.

## Not verified

- No live run (none was asked for).
- No full suite.
- `assemble.ts` is not owned, so it was not changed.

## Open questions or contradictions found

- In the whole-candidate path, a part output bound to a success or failure port is still accepted. t594's `output_not_a_value` exists only on the subflow path. I left it out of scope; it is a one-line extension of `partOutputPortIssues` if wanted.
- The existing header of `route-outputs.ts` names the A8 launch 7 site in a code comment. That predates this task, and none of the model-facing words do.

## Follow-up: route ports in a whole candidate

The gap named in the open questions above is now closed. A whole candidate's part output bound to a success or failure port is refused.

- **What changed:** in `candidate/submission.ts`, `partOutputPortIssues` now also refuses a reader result of `route`.
  - It uses its own code, `candidate.part_output_not_a_value`, at `plan.subflows.<i>`, beside `candidate.part_output_unknown_port`.
  - The words follow t594's: "...bound to the <role> port "<port>" of one of its steps. That port says only whether the step worked/failed, and hands on no value...".
  - Both codes now share one way-out sentence ("drop the output, and have the step that needs the value read it where it is made").
- **Test:** in `candidate/tests/interface-output-port.test.ts`, `$step.rows.success` and `$step.rows.failed` are each refused `candidate.part_output_not_a_value`. Each message names the role and the port, says "hands on no value", and carries "drop the output".
- **Commands:**
  - `npx vitest run .../flow-bootstrap/subflow-candidate .../flow-bootstrap/candidate`: `Test Files 31 passed (31)`, `Tests 225 passed (225)`.
  - `npx tsc --noEmit -p tsconfig.json` (packages/fluxiq): exit 0.
  - `node scripts/structure-audit.mjs`: `structure-audit: passed (375 warning(s), 1156 baselined)`, with no warning on the touched files.
- **Not verified:** no live run and no full suite.

## Follow-up: words for the new codes (after Core dev was merged in)

After Core dev was merged in, t608's guard test failed: `plan/tests/issue-feedback-words.test.ts` ("each keep Core's sentence through the issue feedback"). It failed because `subflow.output_unknown_port` was raised with no listed words, so the issue feedback dropped Core's sentence.

- **What changed:** in `flow-bootstrap/plan/issue-feedback.ts`, I added `subflow.output_unknown_port`, `candidate.part_output_unknown_port` and `candidate.part_output_not_a_value` to `AUTHORED_CODES`, after `subflow.output_not_a_value`, with a generic comment. The issue feedback now passes Core's own refusal message through unchanged for each of the three codes.
  - The guard collects only `flow_script.*` and `subflow.*` codes, so the two `candidate.` codes are not tested by it.
  - They are listed anyway, so their sentences survive if they ever pass through the feedback. `candidate/submission.ts` `bindingRefusal` already passes `issue.message` through.
- **Commands:**
  - `npx vitest run runtime/flow-bootstrap runtime/project-agents runtime/service/project-build runtime/service/subflow-trial` (packages/fluxiq): `Test Files 227 passed | 1 skipped (228)`, `Tests 2578 passed | 2 skipped (2580)`. The guard test is among them and passes.
  - `npx tsc --noEmit -p tsconfig.json`: exit 0.
  - `node scripts/structure-audit.mjs`: `structure-audit: passed (375 warning(s), 1156 baselined)`. The count is unchanged; `issue-feedback.ts` carries its existing 400-line advisory warning (now 507 lines).
- **Not verified:** no live run and no full suite.
