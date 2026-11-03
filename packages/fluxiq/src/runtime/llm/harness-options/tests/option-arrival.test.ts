// F31: an option's opening arrival is the same option going to where the Flow
// starts, so only an option whose calls declare their own effect may carry one.
import { describe, expect, it } from "vitest";
import { automationStudioHarnessOptionIssues, type AutomationStudioHarnessOption } from "../option.ts";

const option = (over: Partial<AutomationStudioHarnessOption>): AutomationStudioHarnessOption => ({
  toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true,
  availability: { kind: "domain", domainId: "web" }, safety: { sideEffect: "mutate" }, ...over
});
const arrival = { node: "web.output.navigate", parameters: { url: "https://start.example/" }, consequences: [] };

describe("an option's opening arrival", () => {
  it("is accepted on an option whose calls declare their own effect", () => {
    expect(automationStudioHarnessOptionIssues(option({ initialObservation: { input: {}, arrival } }))).toEqual([]);
  });

  it("is refused on an option that only looks, and when it is not an object", () => {
    const looking = option({ effect: "observe", perCallEffect: false, safety: { sideEffect: "observe" }, initialObservation: { input: {}, arrival } });
    expect(automationStudioHarnessOptionIssues(looking)).toContain("harness_option.initial_observation_invalid");
    const malformed = option({ initialObservation: { input: {}, arrival: "go" as unknown as typeof arrival } });
    expect(automationStudioHarnessOptionIssues(malformed)).toContain("harness_option.initial_observation_invalid");
  });
});
