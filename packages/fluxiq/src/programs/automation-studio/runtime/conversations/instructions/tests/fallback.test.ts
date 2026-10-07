// Reading a message without the model: a job described for the page the person
// has open is built there, with the message as its instruction; a question, a
// remark, or a message with no page open is still answered in words.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_COMMANDS, AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../../commands/index.ts";
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

  // Lane D's live task (`social-network-feed-confirm-requests`) starts "Go through ...". With every
  // Core command offered, the one-word phrase "go" (and "run it", which is `run` once filler is
  // dropped) was found inside a forty-word job, scored 0.76, and ran an unrelated Flow (or, with no
  // Flows, answered "nothing to use for Run a Flow") instead of building what was described.
  it("is built even when a short phrase of another capability turns up inside it", () => {
    const flows = [{ flowId: "flow.kettle-1", name: "Kettle price checker" }];
    for (const job of [
      "Go through my friend requests and confirm everyone I have at least five mutual friends with, and leave every other request as it is. Then give me a table of every request the list now shows as accepted.",
      "Run through every page of the results and give me the prices of the usb hubs in a table with columns title and price."
    ]) {
      expect(decideWith(job, ALL_COMMANDS, flows)).toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.createHere", arguments: { instruction: job } } });
      expect(decideWith(job, ALL_COMMANDS, [])).toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.createHere" } });
    }
  });

  it("still runs a Flow when the phrase is most of what was said", () => {
    const flows = [{ flowId: "flow.kettle-1", name: "Kettle price checker" }];
    for (const said of ["run it", "go", "please run the kettle price checker now", "go ahead and run it"]) {
      expect(decideWith(said, ALL_COMMANDS, flows), said).not.toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.createHere" } });
    }
    expect(decideWith("run the kettle price checker", ALL_COMMANDS, flows)).toMatchObject({ kind: "invoke", invocation: { capabilityId: "run.execute" } });
  });
});

const ALL_COMMANDS = parseAutomationStudioPanelCapabilities([...AUTOMATION_STUDIO_CONVERSATION_COMMANDS.values()].map((command) => command.capability));

function decideWith(message: string, capabilities: typeof CAPABILITIES, flows: { flowId: string; name: string }[]) {
  const context = { projectId: "project.home", capabilities, flows, onScreen: { pageUrl: PAGE }, message } as unknown as AutomationStudioConversationDecisionContext;
  return automationStudioConversationFallbackDecision(message, context);
}
