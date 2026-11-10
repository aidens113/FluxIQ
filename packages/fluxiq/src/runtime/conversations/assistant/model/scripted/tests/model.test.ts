// The scripted model picks a scenario by the person's latest words, walks its decisions by how many this
// message has made, and fills `$answer` values from the last tool's answer.

import { describe, expect, it } from "vitest";
import type { PanelAssistantModelTurn } from "../../../types.ts";
import { panelAssistantScriptedModel } from "../model.ts";
import type { PanelAssistantScript } from "../script.ts";

const CALLER = { userId: "user.ada", sessionId: "session.ada" };
const SCRIPT: PanelAssistantScript = {
  scenarios: [
    { when: "tidy the list", turns: [{ tool: "studio__read-list", input: {}, why: "to see it" }, { tool: "studio__change-list", input: { version: { $answer: "revision" }, edit: { nested: [{ $answer: "items.0" }] } }, why: "to change it" }] },
    { when: "say hi", turns: [{ reply: "Hi." }] }
  ],
  after: "All done.",
  otherwise: "No script for that."
};

async function next(transcript: PanelAssistantModelTurn[], script = SCRIPT): Promise<unknown> {
  const model = panelAssistantScriptedModel(async () => script);
  return (await model.decide({ instructions: "x", transcript }, { signal: new AbortController().signal, caller: CALLER })).decision;
}

describe("panelAssistantScriptedModel", () => {
  it("starts a scenario chosen by the person's latest words, in any case", async () => {
    expect(await next([{ author: "person", text: "Please TIDY THE LIST now" }])).toEqual({ tool: "studio__read-list", input: {}, why: "to see it" });
  });

  it("goes on by how many decisions this message made, filling values from the last answer", async () => {
    const transcript: PanelAssistantModelTurn[] = [
      { author: "assistant", text: "an earlier reply of the thread" },
      { author: "person", text: "tidy the list" },
      { author: "assistant", text: JSON.stringify({ tool: "studio__read-list", input: {}, why: "to see it" }) },
      { author: "tool", text: JSON.stringify({ tool: "studio__read-list", ok: true, answer: { revision: 7, items: ["a", "b"] } }) }
    ];
    expect(await next(transcript)).toEqual({ tool: "studio__change-list", input: { version: 7, edit: { nested: ["a"] } }, why: "to change it" });
  });

  it("goes on from an allowed call's answer alone, after a card, rather than asking for the call again", async () => {
    const transcript: PanelAssistantModelTurn[] = [
      { author: "person", text: "tidy the list" },
      { author: "assistant", text: "Change the list? [asked the person; they allowed it]" },
      { author: "tool", text: JSON.stringify({ tool: "studio__read-list", ok: true, allowedByPerson: true, answer: { revision: 7, items: ["a"] } }) }
    ];
    expect(await next(transcript)).toMatchObject({ tool: "studio__change-list", input: { version: 7 } });
  });

  it("replies after the last decision and when no scenario fits", async () => {
    const done: PanelAssistantModelTurn[] = [{ author: "person", text: "say hi" }, { author: "tool", text: JSON.stringify({ tool: "studio__read-list", ok: true, answer: {} }) }];
    expect(await next(done)).toEqual({ reply: "All done." });
    expect(await next([{ author: "person", text: "something else" }])).toEqual({ reply: "No script for that." });
  });

  it("fails in plain words when a script reads what the last answer does not hold", async () => {
    const transcript: PanelAssistantModelTurn[] = [
      { author: "person", text: "tidy the list" },
      { author: "assistant", text: JSON.stringify({ tool: "studio__read-list", input: {}, why: "x" }) },
      { author: "tool", text: JSON.stringify({ tool: "studio__read-list", ok: true, answer: {} }) }
    ];
    await expect(next(transcript)).rejects.toThrow(/reads “revision” from the last answer/u);
  });
});
