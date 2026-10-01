// A capability whose required instruction is the person's own words takes it
// from their message when nothing else supplied it, and still asks when the
// message only named the capability. The vocabulary is Core's own create-here
// descriptor, parsed through the reader the endpoint uses.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../../commands/index.ts";
import {
  automationStudioConversationFallbackDecision,
  automationStudioConversationInvocationDecision,
  type AutomationStudioConversationDecisionContext
} from "../index.ts";

const CAPABILITIES = parseAutomationStudioPanelCapabilities([AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability]);
const PAGE = "https://shop.example.test/search?q=earbuds";
const INSTRUCTION = "Find every pair of wireless earbuds under $50 in the search results, with columns name, price and url.";

function context(message: string | undefined): AutomationStudioConversationDecisionContext {
  return { projectId: "project.home", capabilities: CAPABILITIES, flows: [], onScreen: { pageUrl: PAGE }, ...(message === undefined ? {} : { message }) };
}

describe("a required instruction taken from the person's message", () => {
  it("is the whole message when the model named the capability and left the instruction out", () => {
    const decision = automationStudioConversationInvocationDecision("flow.createHere", {}, context(INSTRUCTION), null);
    expect(decision).toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.createHere", arguments: { instruction: INSTRUCTION } } });
  });

  it("never replaces an instruction the model did supply", () => {
    const decision = automationStudioConversationInvocationDecision("flow.createHere", { instruction: "List the earbuds." }, context(INSTRUCTION), null);
    expect(decision).toMatchObject({ kind: "invoke", invocation: { arguments: { instruction: "List the earbuds." } } });
  });

  it("is still asked for when the message only names the capability", () => {
    for (const message of ["automate this page", "Create an automation here", "make a flow for this page please"]) {
      const decision = automationStudioConversationInvocationDecision("flow.createHere", {}, context(message), null);
      expect(decision.kind, message).toBe("clarify");
    }
  });

  it("is still asked for when no message was given to the decision", () => {
    expect(automationStudioConversationInvocationDecision("flow.createHere", {}, context(undefined), null).kind).toBe("clarify");
  });

  it("lets the words-only reading build from a message that names the capability and says what to do", () => {
    const message = "Create a flow that lists the name and price of the first three earbuds";
    const decision = automationStudioConversationFallbackDecision(message, context(message));
    expect(decision).toMatchObject({ kind: "invoke", invocation: { capabilityId: "flow.createHere", arguments: { instruction: message } } });
  });
});
