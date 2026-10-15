// A part's output bound to a port its step's node does not declare (t639):
// refused with the ports the node does declare, in a whole candidate, as is
// one bound to a success or failure route port; a declared port stands.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioFlowCandidateSubmissionController, automationStudioInterfaceOutputPort } from "../index.ts";
import { refusalTestRegistry, refusalTestSubmission } from "./refusal-domain-fixture.ts";

/** A Flow whose router-run subflow calls one part that hands back `binding`. */
function script(binding: string): string {
  return [
    "flow: Find the titles",
    "step first: run reader",
    "  call: reader",
    "  author: $input.author = Ada Hart",
    "end",
    "end",
    "part reader: read the titles",
    "  input: author",
    `  output: titles = ${binding}`,
    "  step rows: read the rows",
    "    node: web.dom.extract_list",
    "    extractList: extraction.1",
    "    extractList.minItems: 0",
    "end"
  ].join("\n");
}

const submit = (binding: string) => new AutomationStudioFlowCandidateSubmissionController(refusalTestSubmission()).submit({ flow: script(binding) });

describe("a whole candidate's part output", () => {
  it("is refused when bound to a port its step's node does not declare, naming the ports it does", async () => {
    const refused = await submit("$step.rows.address");
    if (refused.ok) throw new Error("expected a refusal");
    expect(refused.check.issueCodes).toEqual(["candidate.part_output_unknown_port"]);
    const said = String(((refused.check.feedback?.issues as JsonObject[] | undefined)?.[0])?.message);
    expect(said).toContain('The output "titles" of the part "reader" is bound to "address" of one of its steps');
    expect(said).toContain('declares no output by that name: it declares only success, failed');
    expect(said).toContain("records");
    expect(said).toContain("drop the output");
  });

  it("is refused when bound to its step's success or failure port, a route that hands on no value", async () => {
    for (const [port, role] of [["success", "success"], ["failed", "failure"]] as const) {
      const refused = await submit(`$step.rows.${port}`);
      if (refused.ok) throw new Error(`expected a refusal for ${port}`);
      expect(refused.check.issueCodes, port).toEqual(["candidate.part_output_not_a_value"]);
      const said = String(((refused.check.feedback?.issues as JsonObject[] | undefined)?.[0])?.message);
      expect(said).toContain(`The output "titles" of the part "reader" is bound to the ${role} port "${port}" of one of its steps`);
      expect(said).toContain("hands on no value");
      expect(said).toContain("drop the output");
    }
  });

  it("stands when bound to a port the node declares", async () => {
    const kept = await submit("$step.rows.records");
    expect(kept.ok, JSON.stringify(kept)).toBe(true);
  });
});

describe("automationStudioInterfaceOutputPort", () => {
  const nodes = { registry: refusalTestRegistry() };
  const subflow = { nodes: [
    { key: "n1", definitionId: "web.output.dom-click" },
    { key: "n2", definitionId: "builtin.control.call-subflow", parameters: { subflowId: "p", inputs: {}, outputs: { total: "total" } } },
    { key: "n3", definitionId: "an.unregistered.node" }
  ] } as unknown as Parameters<typeof automationStudioInterfaceOutputPort>[0];
  const read = (path: string) => automationStudioInterfaceOutputPort(subflow, { $state: { path } }, nodes);

  it("reads a route, an undeclared port, a call's own output and an unknown node's port", () => {
    expect(read("$node.n1.success")).toEqual({ kind: "route", port: "success", role: "success" });
    expect(read("$node.n1.address")).toMatchObject({ kind: "unknown", port: "address", definitionId: "web.output.dom-click", declared: expect.arrayContaining(["success", "failed"]) });
    expect(read("$node.n2.total")).toEqual({ kind: "value", port: "total" });
    expect(read("$node.n2.address")).toMatchObject({ kind: "unknown", declared: expect.arrayContaining(["total"]) });
    expect(read("$node.n3.address")).toEqual({ kind: "value", port: "address" });
    expect(read("$node.n9.total")).toBeUndefined();
  });
});
