// The library verb's own declaration, and the bound that silently kills a build.
//
// **Why this file exists.** A tool's description may be at most 2,000
// characters, checked in three places -- `harness-options/option.ts`,
// `deepseek/provider.ts` and `evidence-loop-decision.ts` -- and nothing checks
// it while the prose is being written. Adding three sentences of guidance about
// `consequences` took this description to 2,179 characters, and the next live
// build died at its first provider request with
// `flow_bootstrap.provider_request_failed`, HTTP 400, before a single node ran
// (`run-mudkec90-f2489d35`). Nothing in the failure said "your description is
// too long". The prose here is edited whenever the model is taught something,
// so the bound is pinned where the prose is, and through the same validator the
// loop uses rather than a number copied beside it.

import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceValidTools } from "../../evidence-loop-decision.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../action-permissions/index.ts";
import { automationStudioLlmRunNodeTool } from "../run-node.ts";

/** The description is the same whatever the library holds, so one is enough. */
const tool = () => automationStudioLlmRunNodeTool({ nodeIds: ["web.output.dom-click", "builtin.logic.and"] });

describe("the run-node tool's declaration", () => {
  it("passes the validator every path to a provider runs it through", () => {
    const built = tool();
    expect(built).toBeDefined();
    // The real gate, not a number copied beside it: this is what refuses a
    // request, and a description over 2,000 characters fails a build before
    // anything runs.
    expect(automationStudioLlmEvidenceValidTools([built!])).toBe(true);
    expect(built!.description.length).toBeLessThanOrEqual(2_000);
    // Room kept under the bound (t235): it was 1,990 of 2,000, so one more
    // sentence of guidance refused every build's first request.
    expect(built!.description.length).toBeLessThanOrEqual(1_500);
  });

  it("teaches the two steps: pick a name from the catalog, and where its definition is shown", () => {
    // The catalog is names only (user, 2026-10-01); a node's parameters are
    // shown once the model has asked for them or run it (t280).
    const built = tool()!;
    expect(built.description).toContain("flowBootstrap.nodeCatalog names every node");
    expect(built.description).toContain("core.describe_nodes");
    expect(built.description).toContain("A node you run is described for you, under describedNodes in its first result.");
    const properties = built.inputSchema.properties as { parameters: { description: string } };
    expect(properties.parameters.description).toContain("its definition under describedNodes");
  });

  it("leaves the consequence classes to the schema's enum rather than repeating them in prose", () => {
    // A class added in `action-permissions/` reaches the model through the
    // enum with nobody editing this file.
    const built = tool()!;
    const consequences = (built.inputSchema.properties as { consequences: { items: { enum: string[] } } }).consequences;
    expect(consequences.items.enum).toEqual([...AUTOMATION_STUDIO_ACTION_CONSEQUENCES]);
    expect(built.description).not.toContain(AUTOMATION_STUDIO_ACTION_CONSEQUENCES.join(", "));
    expect(built.description).not.toContain("amend_draft add");
  });

  it("keeps the rules the model needs: handles not locators, lists by their detection handle", () => {
    const description = tool()!.description;
    expect(description).toContain("{\"handle\": \"<the handle the evidence printed, copied exactly>\"}");
    expect(description).toContain("Never write a locator");
    expect(description).toContain("by the handle the detection tool issued");
  });

  it("shows both answers about consequences, not only the empty one", () => {
    // The defect this guards: three sentences that all demonstrated `[]`, and
    // four live builds that declared `[]` for every press including one that
    // publishes. A model shown only the empty answer learns its shape.
    const description = tool()!.description;
    // Opening checkout is named beside the filter (t195-w18): live builds
    // declared `move_money` on the press that only opens the checkout page.
    expect(description).toContain("the press that applies a filter or opens checkout is []");
    expect(description).toContain("the press that submits the post is send_or_publish");
  });

  it("enumerates the library rather than describing it, so a node registered later is runnable", () => {
    const node = tool()!.inputSchema.properties as { node: { enum?: string[] } };
    expect(node.node.enum).toEqual(["builtin.logic.and", "web.output.dom-click"]);
  });

  it("hands a check to the person rather than inviting another try at it", () => {
    // "Run again. A failure ends nothing" read, to a build facing a robot
    // check, as "knock again" -- until the site locked it out.
    const description = tool()!.description;
    expect(description).not.toContain("A failure ends nothing");
    expect(description).toContain("A page that needs a person goes to the person: never press, type into or reload a check.");
  });

  // t252 (D1, D8): a step may be written rather than run, and a written step
  // may hold bindings where a value changes between runs or rows.
  it("offers write, optional, and says what writing a step does and when to prefer it", () => {
    const built = tool()!;
    const properties = built.inputSchema.properties as { write?: { type: string; description: string }; parameters: { description: string } };
    expect(built.inputSchema.required).toEqual(["node", "parameters", "consequences"]);
    expect(properties.write?.type).toBe("boolean");
    expect(properties.write?.description).toContain("without running it");
    expect(properties.write?.description).toContain("the test runs it");
    expect(properties.write?.description).toContain("prefer write for a lasting act on items a loop selects: the test acts on exactly the items the Flow selects");
    // On the property, not the description, which has no room under its 1,500.
    expect(built.description.length).toBeLessThanOrEqual(1_500);
    expect(automationStudioLlmEvidenceValidTools([built])).toBe(true);
  });

  it("names the binding forms in the parameters description, for a written step only", () => {
    const parameters = (tool()!.inputSchema.properties as { parameters: { description: string } }).parameters.description;
    expect(parameters).toContain("{\"$input\": \"<name>\", \"test\": <the value to test with>}");
    expect(parameters).toContain("{\"$row\": \"<field>\"}");
    expect(parameters).toContain("{\"$step\": <n>, \"output\": \"<output id>\"} for an output of the earlier step n");
    expect(parameters).toContain("write true");
    expect(parameters).toContain("concrete values only");
  });

  it("is nothing at all when the library is empty", () => {
    expect(automationStudioLlmRunNodeTool({ nodeIds: [] })).toBeUndefined();
  });
});

// F31: the call a build told where it starts opens with.
describe("the run-node tool's opening arrival", () => {
  const look = { node: "web.output.dom-capture", parameters: {}, consequences: [] };
  const arrival = { node: "web.output.navigate", parameter: "url", location: "https://start.example/" };

  it("rides on the first look as a call of this tool, the location written into the named parameter", () => {
    const tool = automationStudioLlmRunNodeTool({ nodeIds: ["web.output.dom-capture", "web.output.navigate"], initial: look, arrival });
    expect(tool?.initialObservation).toEqual({ input: look, arrival: { node: "web.output.navigate", parameters: { url: "https://start.example/" }, consequences: [] } });
    expect(automationStudioLlmEvidenceValidTools([tool!])).toBe(true);
  });

  it("is never offered for a node outside the library, nor without a first look to ride on", () => {
    expect(automationStudioLlmRunNodeTool({ nodeIds: ["web.output.dom-capture"], initial: look, arrival })?.initialObservation).toEqual({ input: look });
    expect(automationStudioLlmRunNodeTool({ nodeIds: ["web.output.navigate"], arrival })?.initialObservation).toBeUndefined();
  });
});
