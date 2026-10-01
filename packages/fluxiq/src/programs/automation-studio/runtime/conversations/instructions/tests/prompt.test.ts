// What the chat model is told about a job the person describes for the page
// they have open: that it is a request to build one there, said only when the
// capability that does it is offered and a page is on screen.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../../commands/index.ts";
import { automationStudioConversationInstructions, type AutomationStudioConversationDecisionContext } from "../index.ts";

const CREATE_HERE = parseAutomationStudioPanelCapabilities([AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability]);
const RUN_ONLY = parseAutomationStudioPanelCapabilities([{ id: "run.execute", title: "Run a Flow", summary: "Run the Flow now.", group: "Running", phrases: ["run it"], consequences: [], arguments: [] }]);
const DESCRIBED_JOB = "A job they describe for this site";

function instructions(overrides: Partial<AutomationStudioConversationDecisionContext>): string {
  return automationStudioConversationInstructions({ projectId: "project.home", capabilities: CREATE_HERE, flows: [], onScreen: { pageUrl: "https://shop.example.test/" }, ...overrides }, { transcriptWithheld: false });
}

describe("the chat model's instructions about a described job", () => {
  it("say that a job described for the open site is a request to build it there, with the message as its instruction", () => {
    const text = instructions({});
    expect(text).toContain(`${DESCRIBED_JOB} -- something to find, list, collect, fill in or buy on it -- that no Flow above already does is a request to make a new automation from this page: choose flow.createHere and pass their whole message, in their own words, as its instruction.`);
  });

  it("say nothing of it when no page is open", () => {
    expect(instructions({ onScreen: {} })).not.toContain(DESCRIBED_JOB);
  });

  it("say nothing of it when the capability is not offered", () => {
    expect(instructions({ capabilities: RUN_ONLY })).not.toContain(DESCRIBED_JOB);
  });
});
