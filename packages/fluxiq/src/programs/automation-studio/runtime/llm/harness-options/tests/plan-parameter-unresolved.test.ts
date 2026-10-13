// An unresolved handle is refused at the parameter that holds it, in a sentence
// naming that parameter and the token (t514).
//
// Social gate run `run-mv6v2jh4-69244ffb` (step 0083) was refused
// `bootstrap.handle_unresolved` at `plan.subflows.0.nodes.8.parameters`, with
// the fixed sentence every domain refusal carries. It named neither the key
// (`expectedState`) nor the token (`absent`), and the model re-sent the script
// unchanged until the build ended.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES as CODES, resolveAutomationStudioFlowBootstrapPlanParameters } from "../plan-parameter-resolution.ts";

function plan(): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
    subflows: [{
      key: "main",
      name: "Main",
      role: "primary",
      nodes: [{ key: "wait", definitionId: "domain.demo.wait", definitionVersion: "1.0.0", parameters: { target: { handle: "t846" }, expectedState: { handle: "absent" } }, outputActionId: "demo.wait" }],
      edges: []
    }]
  };
}

describe("a handle the domain left unresolved", () => {
  it("is refused at the parameter holding it, naming the parameter and the token", async () => {
    // The domain resolves the target it issued and leaves the word alone, as the web domain did.
    const result = await resolveAutomationStudioFlowBootstrapPlanParameters({
      plan: plan(),
      projectId: "project.demo",
      flowId: "flow.demo",
      binding: { resolvePlanNodeParameters: ({ parameters }) => ({ status: "resolved", parameters: { ...parameters, target: { selector: "#composer" } } }) },
      handlesIssued: true
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([expect.objectContaining({ code: CODES.unresolved, path: "plan.subflows.0.nodes.0.parameters.expectedState" })]);
    expect(result.issues[0]?.message).toContain("expectedState");
    expect(result.issues[0]?.message).toContain("absent");
  });
});
