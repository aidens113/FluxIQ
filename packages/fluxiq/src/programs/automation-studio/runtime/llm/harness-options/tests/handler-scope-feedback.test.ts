import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../bootstrap-completion.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const NEWLINE = String.fromCharCode(10);

// A scoped handler must name an explicit step label. Its compiler explanation
// must reach the next model request before the candidate can be trialled.
describe("trusted handler-scope completion feedback", () => {
  it("explains an unresolved authored handler label and accepts an explicit matching label", async () => {
    const lines = [
      "flow: Read the notices",
      "step: read notices",
      "  node: web.dom.extract_list",
      "  extractList.item: li.notice",
      "  extractList.fields.title: .title",
      "on before for read notices: a session notice",
      "  when: exists t10",
      "  step: close the notice",
      "    node: web.dom.click",
      "    target: t11",
      "    consequences: none",
      "  then: carry on",
      "end"
    ];
    const script = lines.join(NEWLINE);
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { flow: script }, projectId: "project.1", flowId: "flow.1", registry, resolution
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("expected an unresolved handler scope");
    const feedback = verdict.check.feedback;
    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_plan_invalid");
    expect(feedback.issues).toEqual([{
      code: "flow_script.handler_invalid", path: "flow.line.6", step: "a session notice", line: 6,
      message: "The handler at line 6 is for \"read notices\", which labels no step of the block it is written in."
    }]);
    expect(feedback.previous).toBe(script);

    const corrected = [...lines];
    corrected[1] = "step notices: read notices";
    corrected[5] = "on before for notices: a session notice";
    const resolvedHandles: string[] = [];
    const accepted = await checkAutomationStudioFlowBootstrapCompletion({
      result: { flow: corrected.join(NEWLINE) }, projectId: "project.1", flowId: "flow.1", registry, resolution,
      binding: { resolvePlanNodeParameters: ({ parameters }) => {
        const target = parameters.target;
        const handle = target && typeof target === "object" && !Array.isArray(target) ? target.handle : undefined;
        if (handle !== "t10" && handle !== "t11") return { status: "unchanged" as const };
        resolvedHandles.push(handle);
        return { status: "resolved" as const, parameters: { selector: handle === "t10" ? "#session-notice" : "#dismiss-notice" } };
      } }
    });
    expect(accepted.ok, accepted.ok ? undefined : JSON.stringify(accepted.check)).toBe(true);
    expect(resolvedHandles.sort()).toEqual(["t10", "t10", "t11"]);
  });

});
