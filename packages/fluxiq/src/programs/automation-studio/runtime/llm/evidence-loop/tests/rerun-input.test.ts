// A rerun carries only what changes in the step's argument (t211): the reply
// that asks for it stays short and shallow, which is where the unreadable
// replies of lane C's live runs came from (`../rerun-input.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceRerunInput } from "../rerun-input.ts";
import { automationStudioLlmEvidenceRerunRequest } from "../rerun-request.ts";

// The shape of the list read whose reruns came back unreadable: a node, its
// columns, its conditions and its paging, three and four levels deep.
const listRead = (): JsonObject => ({
  node: "web.output.dom-extract_list",
  parameters: {
    rows: { selector: "ul.results > li" },
    columns: [{ name: "title", selector: "h3" }, { name: "price", selector: ".price" }],
    where: [{ column: "title", contains: "earbuds" }],
    paging: { next: { selector: "a[rel=next]" }, maxPages: 5 }
  },
  consequences: []
});

describe("the argument a rerun runs with", () => {
  it("is the step's argument with only the keys the rerun changed", () => {
    const previous = listRead();
    const input = automationStudioLlmEvidenceRerunInput(previous, { parameters: { paging: { maxPages: 10 } } });

    expect(input).toEqual({ ...listRead(), parameters: { ...listRead().parameters as JsonObject, paging: { next: { selector: "a[rel=next]" }, maxPages: 10 } } });
    // The step's own argument is not touched.
    expect(previous).toEqual(listRead());
  });

  it("replaces a list whole, and removes a key given as null", () => {
    const input = automationStudioLlmEvidenceRerunInput(listRead(), { parameters: { where: [{ column: "price", below: 50 }], paging: null } });

    expect((input.parameters as JsonObject).where).toEqual([{ column: "price", below: 50 }]);
    expect(input.parameters).not.toHaveProperty("paging");
    expect((input.parameters as JsonObject).columns).toEqual((listRead().parameters as JsonObject).columns);
  });

  it("is exactly the whole argument when the rerun still sends one", () => {
    const whole = { ...listRead(), parameters: { ...listRead().parameters as JsonObject, rows: { selector: "ol > li" } } };
    expect(automationStudioLlmEvidenceRerunInput(listRead(), whole)).toEqual(whole);
  });

  it("is what the loop runs: the rerun call carries the merged argument through the step's tool", () => {
    const step: AutomationStudioFlowDraftStep = { position: 3, id: "d3", iteration: 3, actionId: "web.output.dom-extract_list", toolId: "core.run_node", input: listRead(), effect: "observe", disposition: "kept" };

    const resolved = automationStudioLlmEvidenceRerunRequest([{ step: 3, change: "rerun", input: { parameters: { rows: { selector: "ol > li" } } } }], [step], new Set(["core.run_node"]));

    expect(resolved.request).toEqual({
      step: 3, toolId: "core.run_node", callId: "rerun.3",
      input: { ...listRead(), parameters: { ...listRead().parameters as JsonObject, rows: { selector: "ol > li" } } }
    });
  });

  it("is what the model is told to write: only the keys that change", () => {
    const input = (AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties as Record<string, { description: string }>).input!;
    expect(input.description).toContain("JSON merge patch over the argument the step ran with");
    expect(input.description).toContain("Only the keys that change");
    expect(input.description).toContain("null removes a key");
  });
});
