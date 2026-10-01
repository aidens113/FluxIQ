// Reading a message without the model: a job described for the page the person
// has open is built there, with the message as its instruction; a question, a
// remark, or a message with no page open is still answered in words.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../../commands/index.ts";
import { automationStudioConversationFallbackDecision, type AutomationStudioConversationDecisionContext } from "../index.ts";

const CAPABILITIES = parseAutomationStudioPanelCapabilities([
  AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability,
  { id: "run.execute", title: "Run a Flow", summary: "Run the Flow now.", group: "Running", phrases: ["run the flow", "run it"], consequences: [], arguments: [{ name: "flowId", describe: "The Flow it is about.", required: true }] }
]);
const PAGE = "https://shop.example.test/";
/** The live task `run-muq2dlhq-96bffb09` typed, which the words-only reading answered "I could not tell what you wanted done". */
const JOB = "Find every pair of wireless earbuds in the store's search results that is Brightaisle Plus eligible, rated 4.0 or higher and priced under $50, going through every page of results.";

function decide(message: string, pageUrl: string | null = PAGE) {
  const context: AutomationStudioConversationDecisionContext = { projectId: "project.home", capabilities: CAPABILITIES, flows: [], onScreen: pageUrl ? { pageUrl } : {}, message };
  return automationStudioConversationFallbackDecision(message, context);
}

describe("a described job read without the model", () => {
  it("is built from the page the person has open, with the message as what it should do", () => {
    expect(decide(JOB)).toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.createHere", arguments: { instruction: JOB } } });
  });

  it("is answered in words when no page is open, since there is nowhere to build it from", () => {
    const noPage = decide(JOB, null);
    expect(noPage.kind).toBe("reply");
  });

  it("is answered in words when it is a question or a remark rather than a job", () => {
    expect(decide("Could you find the cheapest wireless earbuds on this site for me?").kind).toBe("reply");
    expect(decide("thank you so much").kind).toBe("reply");
  });

  it("leaves a message that names a capability to that capability", () => {
    expect(decide("run the flow")).not.toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.createHere" } });
  });
});
