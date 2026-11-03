// A callable part that hands on one value it read (t646): bound to the
// single-value read's `value` data port, the output is a value and stands;
// bound to a port the read does not declare it is still refused (t639), now
// naming `value` among the ports it does declare; bound to its success port it
// is still a route (t594).
import { describe, expect, it } from "vitest";
import { refusalTestRegistry } from "../../candidate/tests/refusal-domain-fixture.ts";
import { automationStudioSubflowRouteOutputs } from "../route-outputs.ts";

const READ_ID = "web.output.dom-extract";

function target(path: string): Parameters<typeof automationStudioSubflowRouteOutputs>[0] {
  return {
    nodes: [
      { key: "s1", definitionId: "web.output.dom-click", parameters: {} },
      { key: "read", definitionId: READ_ID, parameters: { target: { handle: "t12" }, extract: { mode: "text" } } }
    ],
    interface: { outputs: [{ id: "reference", metadata: { binding: { $state: { path } } } }] }
  } as unknown as Parameters<typeof automationStudioSubflowRouteOutputs>[0];
}

const issues = (path: string) => automationStudioSubflowRouteOutputs(target(path), { registry: refusalTestRegistry() });

describe("a part's output read off the single-value read", () => {
  it("is a value when bound to the read's value port", () => {
    expect(issues("$node.read.value")).toEqual([]);
  });

  it("is still refused when bound to a port the read does not declare, which names value among those it does", () => {
    const [refused, ...rest] = issues("$node.read.text");
    expect(rest).toEqual([]);
    expect(refused?.code).toBe("subflow.output_unknown_port");
    expect(refused?.message).toContain(`its node "${READ_ID}" declares no output by that name: it declares only success, failed, value`);
  });

  it("is still a route when bound to the read's success port", () => {
    expect(issues("$node.read.success").map((issue) => issue.code)).toEqual(["subflow.output_not_a_value"]);
  });
});
