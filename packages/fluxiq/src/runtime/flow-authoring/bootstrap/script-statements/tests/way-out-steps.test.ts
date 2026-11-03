import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../../framework/automation-service/nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, parseAutomationStudioFlowScript } from "../../authoring/index.ts";
import { AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID, resolveAutomationStudioFlowBootstrapPlanParameters, type AutomationStudioResolvedControlIntent } from "../../../../llm/harness-options/index.ts";
import { automationStudioFlowScriptWayOutIssues } from "../index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const OPEN = ["flow: Do it", "step: open the page", "  node: web.browser.navigate", "  url: https://shop.test/"];
const press = (words: string | undefined, extra: string[] = [], consequences = "none") => ["step notice: answer the notice if it shows", "  node: web.dom.click", "  selector: .notice", ...(words === undefined ? [] : [`  element.visibleText: ${words}`]), `  consequences: ${consequences}`, ...extra];
const handled = (when = "exists t1", words = "a control") => [
  ...OPEN, "step rows: read the rows", "  node: web.dom.extract_list", "  extractList: {\"item\": \".row\", \"fields\": {\"name\": \".name\"}}",
  "on before for rows: an interruption", `  when: ${when}`, "  step: answer it", "    node: web.dom.click", "    selector: .notice", `    element.accessibleName: ${words}`, "    consequences: none", "  then: carry on", "end"
];

async function checked(lines: string[], intent?: AutomationStudioResolvedControlIntent) {
  const flow = lines.join("\n");
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow }, registry, resolution });
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
  const resolved = await resolveAutomationStudioFlowBootstrapPlanParameters({ plan: accepted.plan, projectId: "project.test", flowId: "flow.test", handlesIssued: true,
    binding: { resolvePlanNodeParameters: ({ nodeDefinitionId, parameters }) => {
      if (nodeDefinitionId === AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID) return { status: "resolved", parameters: { selector: "#fact" } };
      if (nodeDefinitionId !== "web.output.dom-click") return { status: "unchanged" };
      return { status: "resolved", parameters, ...(intent && nodeDefinitionId === "web.output.dom-click" ? { controlIntent: intent } : {}) };
    } }, permissionFor: () => async () => ({ permitted: true }) });
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));
  const input = { script: parseAutomationStudioFlowScript(flow).script, plan: resolved.plan, locator: accepted.locator, controlIntents: resolved.controlIntents };
  return { input, issues: automationStudioFlowScriptWayOutIssues(input) };
}

describe("trusted per-node interruption semantics", () => {
  it("refuses host acceptance on the exact optional consequence line, using display words only in feedback", async () => {
    const { issues } = await checked([...OPEN, ...press("a control", ["  optional: yes"])], { intent: "accept" });
    expect(issues).toEqual([expect.objectContaining({ code: "flow_script.way_out_accepts", path: "flow.line.9" })]);
    expect(issues[0]!.message).toContain("The step at line 5 is optional");
    expect(issues[0]!.message).toContain('"a control"');
    expect(issues[0]!.message).toContain("the permission check still applies");
    expect(issues[0]!.message).not.toMatch(/cookie|web|selector|allowed|permission is granted/iu);
  });

  it("never hides known acceptance behind missing, lengthy, misleading or non-English display words", async () => {
    for (const words of [undefined, "Close", "Accept all", "X", "続ける", "a control ".repeat(12)]) {
      expect((await checked([...OPEN, ...press(words, ["  optional: yes"])], { intent: "accept" })).issues).toHaveLength(1);
    }
  });

  it("passes only the host's response-only acceptance or another host intent, without an English fallback when absent", async () => {
    for (const intent of [undefined, { intent: "accept", responseOnly: true }, { intent: "dismiss" }, { intent: "neutral" }, { intent: "navigate" }] as const) {
      expect((await checked([...OPEN, ...press("Buy now and subscribe", ["  optional: yes"])], intent)).issues).toEqual([]);
    }
  });

  it("retains optional discovery and explicitly empty consequences gating", async () => {
    for (const lines of [[...OPEN, ...press("a control")], [...OPEN, ...press("a control", ["  optional: no"])], [...OPEN, ...press("a control", ["  optional: yes"], "create_new")]]) {
      expect((await checked(lines, { intent: "accept" })).issues).toEqual([]);
    }
    const { input } = await checked([...OPEN, ...press("a control", ["  optional: yes"])], { intent: "accept" });
    for (const subflow of input.plan.subflows) for (const node of subflow.nodes) delete node.consequences;
    expect(automationStudioFlowScriptWayOutIssues(input)).toEqual([]);
  });

  it("keeps handler line placement and does not let a model's consent fact exempt known host acceptance", async () => {
    for (const fact of ['dialog consent "Your choices"', 'dialog consent "Your choices" absent', "exists t1"]) {
      const { issues } = await checked(handled(fact), { intent: "accept" });
      expect(issues).toEqual([expect.objectContaining({ code: "flow_script.way_out_accepts", path: "flow.line.14" })]);
      expect(issues[0]!.message).toContain("The step at line 10 is in the handler at line 8");
    }
    expect((await checked(handled(), { intent: "accept", responseOnly: true })).issues).toEqual([]);
  });

  it("does not trust forged node JSON or an arbitrary sidecar map", async () => {
    const { input } = await checked([...OPEN, ...press("a control", ["  optional: yes"])], { intent: "accept" });
    const node = input.plan.subflows.flatMap((subflow) => subflow.nodes).find((entry) => entry.definitionId === "web.output.dom-click")!;
    node.parameters = { ...node.parameters, controlIntent: { intent: "accept", responseOnly: true }, element: { intent: "dismiss" } };
    expect(automationStudioFlowScriptWayOutIssues(input)).toHaveLength(1);
    const forged = new Map([...input.controlIntents!.keys()].map((key) => [key, { intent: "accept" as const }]));
    expect(automationStudioFlowScriptWayOutIssues({ ...input, controlIntents: forged })).toEqual([]);
    expect(automationStudioFlowScriptWayOutIssues({ ...input, controlIntents: undefined })).toEqual([]);
  });
});
