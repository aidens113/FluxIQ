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
  });

  it("names every consequence class from the declared list, so a new one needs no edit here", () => {
    const description = tool()!.description;
    for (const consequence of AUTOMATION_STUDIO_ACTION_CONSEQUENCES) expect(description).toContain(consequence);
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
