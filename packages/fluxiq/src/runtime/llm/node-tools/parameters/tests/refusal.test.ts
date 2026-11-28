// A call whose parameters cannot be the node's is refused before it is sent (t1096).

import type { JsonValue } from "../../../../../core/index.ts";
import { describe, expect, it, vi } from "vitest";
import { automationStudioActionPermissionDenied } from "../../../../action-permission-requests/index.ts";
import type { AutomationStudioHarnessOptionImplementation } from "../../../harness-options/index.ts";
import { automationStudioLlmRunNodeDescribingFailures } from "../../describing-failures.ts";
import type { AutomationStudioLlmNodeDescriptions } from "../../node-descriptions.ts";
import { AUTOMATION_STUDIO_LLM_NODE_PARAMETERS_REFUSED_CODE, automationStudioLlmNodeParametersRefusal } from "../refusal.ts";

const NODE = "test.output.next-page";
const definition = {
  id: NODE,
  parameters: [
    { id: "nextPage", type: "object" as const, required: true as const, description: "The list and, optionally, its control.", example: { list: "list.1" } },
    { id: "wait", type: "number" as const, defaultValue: 1 }
  ]
};

function library(answer: unknown = { ok: true }) {
  const described = new Set<string>();
  const memory = {
    ids: () => [...described], has: (id: string) => described.has(id),
    definition: (id: string) => (id === NODE ? definition : undefined),
    describe: (ids: readonly string[]) => {
      const added = ids.filter((id) => id === NODE && !described.has(id));
      added.forEach((id) => described.add(id));
      return { described: added, alreadyDescribed: [], unknown: [] };
    }
  } as unknown as AutomationStudioLlmNodeDescriptions;
  const implementation = vi.fn<AutomationStudioHarnessOptionImplementation>(async () => answer as Awaited<ReturnType<AutomationStudioHarnessOptionImplementation>>);
  const call = automationStudioLlmRunNodeDescribingFailures(implementation, memory);
  const run = (node: string, parameters: unknown, callId = "step8") => call({
    projectId: "p.1", flowId: "f.1", callId, optionId: "core.run_node", value: { node, parameters: parameters as JsonValue, consequences: [] }, permission: automationStudioActionPermissionDenied
  });
  return { implementation, run };
}

describe("a call refused before it is sent", () => {
  it("sends nothing when a required parameter is missing, and names it with the shape the node needs", async () => {
    const { implementation, run } = library();
    // The call a live build made: the list named directly, where the node declares `nextPage`.
    const refused = await run(NODE, { list: "list.abc" }) as { evidence: Record<string, unknown>; effectApplied: boolean; resultCode: string };
    expect(implementation).not.toHaveBeenCalled();
    expect(refused.effectApplied).toBe(false);
    expect(refused.resultCode).toBe(AUTOMATION_STUDIO_LLM_NODE_PARAMETERS_REFUSED_CODE);
    expect(refused.evidence).toMatchObject({ ok: false, missingParameters: ["nextPage"], undeclaredParameters: ["list"], declaredParameters: ["nextPage", "wait"], describedNodes: [NODE] });
    expect(refused.evidence.instruction).toMatch(/needs nextPage/u);
    expect(refused.evidence.shapes).toEqual([{ id: "nextPage", type: "object", required: true, description: "The list and, optionally, its control.", example: { list: "list.1" } }]);
  });

  it("refuses an undeclared parameter alone, but lets target, bindings and declared defaults through", async () => {
    const { implementation, run } = library();
    expect(((await run(NODE, { nextPage: { list: "l" }, selector: "#x" })) as { evidence: Record<string, unknown> }).evidence.undeclaredParameters).toEqual(["selector"]);
    expect(implementation).not.toHaveBeenCalled();
    await run(NODE, { nextPage: { $input: "list", test: "l" }, target: { handle: "t1" } });
    expect(implementation).toHaveBeenCalledTimes(1);
  });

  it("does not check a node with no definition, or parameters that are not an object", async () => {
    const { implementation, run } = library();
    await run("web.unknown", { anything: 1 });
    await run(NODE, undefined, "c2").catch(() => undefined);
    expect(implementation.mock.calls.map(([input]) => input.value.node)).toContain("web.unknown");
    expect(automationStudioLlmNodeParametersRefusal(definition, "not an object")).toBeUndefined();
    expect(automationStudioLlmNodeParametersRefusal({ id: "x", parameters: [] }, {})).toBeUndefined();
  });
});
