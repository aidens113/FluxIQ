// What the chat model is told about a job the person describes for the page
// they have open: that it is a request to build one there, said only when the
// capability that does it is offered and a page is on screen.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE, AUTOMATION_STUDIO_CONVERSATION_EXPLORE, AUTOMATION_STUDIO_CONVERSATION_IMPROVE } from "../../commands/index.ts";
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

describe("unfinished creation versus improving applied steps", () => {
  it("uses existing explore with the saved goal for continuation, and keeps real improvements separate", () => {
    const capabilities = parseAutomationStudioPanelCapabilities([AUTOMATION_STUDIO_CONVERSATION_EXPLORE.capability, AUTOMATION_STUDIO_CONVERSATION_IMPROVE.capability]);
    const text = instructions({ capabilities, flows: [{ flowId: "flow.kettles", name: "Kettles" }] });
    expect(text).toContain("continue or finish an unfinished creation");
    expect(text).toContain("choose flow.explore for that Flow and omit instruction to use its saved goal");
    expect(text).toContain("A genuinely changed goal goes in instruction");
    expect(text).toContain("Changing a Flow with applied steps uses flow.improve");
    expect(text).toContain("A Flow's name alone does not prove it already does the requested job");
    expect(AUTOMATION_STUDIO_CONVERSATION_EXPLORE.capability.phrases).toContain("continue building it");
  });

  it("does not recommend capabilities the client did not offer", () => {
    const text = instructions({ capabilities: RUN_ONLY });
    expect(text).not.toContain("choose flow.explore");
    expect(text).not.toContain("uses flow.improve");
  });
});
