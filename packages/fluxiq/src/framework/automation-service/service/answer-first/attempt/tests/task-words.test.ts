// What the chat asks a task by and what an attempt saves it under are one name, or a repeat in the
// chat makes a new Flow and its saved steps never run.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstTaskKey } from "../../task-key/index.ts";
import { automationStudioAnswerFirstTaskWords } from "../task-words.ts";

const WORDS = "Save the three cheapest dining tables, then list my saved items.";
const WHERE = "https://shop.example.test/start";
const GOAL = { scopeKind: "flow", tags: ["generation"], body: WORDS };
const TEXT = `Evidence-guided generation goal\n${WORDS}`;

describe("the words a task is known by", () => {
  it("are the person's own where the Flow holds a generation goal, whatever else is active", () => {
    expect(automationStudioAnswerFirstTaskWords({ instructionText: TEXT, activeInstructions: [GOAL] })).toBe(WORDS);
    expect(automationStudioAnswerFirstTaskWords({ instructionText: `A rule\nBe careful.\n${TEXT}`, activeInstructions: [{ scopeKind: "project", tags: ["safety"], body: "Be careful." }, GOAL] })).toBe(WORDS);
  });

  it("make the key the chat looks a task up by, from what the person typed", () => {
    const saved = automationStudioAnswerFirstTaskKey({ instructionText: automationStudioAnswerFirstTaskWords({ instructionText: TEXT, activeInstructions: [GOAL] }), startLocation: WHERE });
    expect(saved).toBe(automationStudioAnswerFirstTaskKey({ instructionText: `  ${WORDS} `, startLocation: "https://shop.example.test/saved/" }));
    expect(saved).not.toBe(automationStudioAnswerFirstTaskKey({ instructionText: TEXT, startLocation: WHERE }));
  });

  it("are the whole text with no one goal to name it, as a Flow's own instructions are", () => {
    expect(automationStudioAnswerFirstTaskWords({ instructionText: TEXT })).toBe(TEXT);
    expect(automationStudioAnswerFirstTaskWords({ instructionText: TEXT, activeInstructions: [{ scopeKind: "flow", tags: [], body: WORDS }] })).toBe(TEXT);
    expect(automationStudioAnswerFirstTaskWords({ instructionText: TEXT, activeInstructions: [GOAL, { ...GOAL, body: "Another." }] })).toBe(TEXT);
    expect(automationStudioAnswerFirstTaskWords({ instructionText: TEXT, activeInstructions: [{ ...GOAL, scopeKind: "project" }] })).toBe(TEXT);
  });
});
