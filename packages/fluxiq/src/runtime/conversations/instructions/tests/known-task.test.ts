// The exact words of a task with a saved Flow start it with no model call (task speed S6). Pinned:
// each condition the header of `../known-task.ts` names is a miss on its own, a match starts
// `flow.createHere` with the person's words as written, and the lookup is asked with those words.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../../framework/automation-service/panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../../commands/index.ts";
import { automationStudioConversationKnownTaskReading } from "../known-task.ts";
import type { AutomationStudioConversationDecisionContext } from "../invocation.ts";

const WORDS = "Save every dining table under $200 to my saved list.";
const RUN = parseAutomationStudioPanelCapabilities([{ id: "run.execute", title: "Run a Flow", summary: "Run the Flow now.", phrases: ["run the flow"], consequences: ["create_new"], arguments: [{ name: "projectId", required: true }, { name: "flowId", required: true }] }]);

function context(change: Partial<AutomationStudioConversationDecisionContext> = {}): AutomationStudioConversationDecisionContext {
  return { projectId: "project.1", capabilities: [...RUN, AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability], flows: [], onScreen: { pageUrl: "http://127.0.0.1:4100/classifieds" }, message: WORDS, waitingAsks: [], waitingAsksWithheld: false, ...change };
}

/** A task memory holding exactly one task's words. */
function memory(known = WORDS) {
  const asked: string[] = [];
  const lookup = async (words: string) => {
    asked.push(words);
    return words === known;
  };
  return { asked, lookup };
}

describe("a known task's exact words", () => {
  it("start the task with no model call, the words passed as written", async () => {
    const { asked, lookup } = memory();
    const read = await automationStudioConversationKnownTaskReading({ message: WORDS, context: context(), knownTask: lookup });
    expect(read).toEqual({
      interpretation: {
        source: "known_task", modelProblem: null, attempts: 0,
        decision: { kind: "invoke", say: null, invocation: expect.objectContaining({ capabilityId: "flow.createHere", arguments: expect.objectContaining({ instruction: WORDS }), asksFirst: false, confidence: 1 }) }
      }
    });
    expect(asked).toEqual([WORDS]);
  });

  it("leave anything that is not a known task to the model", async () => {
    // A request for something else, a paraphrase, the same words on a task never saved: none is swallowed.
    for (const message of ["run my kettle flow", "save the dining tables under 200 dollars", "what can you do?"]) {
      const read = await automationStudioConversationKnownTaskReading({ message, context: context({ message }), knownTask: memory().lookup });
      expect(read, message).toEqual({ miss: "not_known" });
    }
  });

  it("names each condition that sends the words to the model instead", async () => {
    const lookup = memory().lookup;
    const cases: Array<[string, Parameters<typeof automationStudioConversationKnownTaskReading>[0], string]> = [
      ["no lookup given", { message: WORDS, context: context(), knownTask: undefined }, "no_lookup"],
      ["no words", { message: "   ", context: context({ message: "   " }), knownTask: lookup }, "no_words"],
      ["the command is not offered", { message: WORDS, context: context({ capabilities: RUN }), knownTask: lookup }, "command_not_offered"],
      ["an ask is waiting", { message: WORDS, context: context({ waitingAsks: [{ askId: "ask.1", kind: "confirm", question: "Do it again?", options: [], about: null }] }), knownTask: lookup }, "ask_waiting"],
      ["the asks could not be read", { message: WORDS, context: context({ waitingAsksWithheld: true }), knownTask: lookup }, "asks_unreadable"],
      ["a recording is attached", { message: WORDS, context: context({ onScreen: { pageUrl: "http://127.0.0.1:4100/classifieds", recordingId: "recording.1" } }), knownTask: lookup }, "recording_attached"],
      ["the lookup failed", { message: WORDS, context: context(), knownTask: async () => { throw new Error("memory unreadable"); } }, "lookup_failed"]
    ];
    for (const [why, input, miss] of cases) expect(await automationStudioConversationKnownTaskReading(input), why).toEqual({ miss });
  });

  it("asks nothing of the memory when an earlier condition already sends the words to the model", async () => {
    const { asked, lookup } = memory();
    await automationStudioConversationKnownTaskReading({ message: WORDS, context: context({ waitingAsksWithheld: true }), knownTask: lookup });
    expect(asked).toEqual([]);
  });
});
