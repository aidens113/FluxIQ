import { describe, expect, it } from "vitest";
import { activityActionOf, activityActionVerb } from "../../../../../../ui/index.ts";
import { automationStudioActivityAction } from "../index.ts";

// The wording recognizes verbs through the chat's action kinds, and a card
// reads a step's verb back from the sentence the wording said. These hold the
// two together: every sentence opens with the word the card reads it by.
const IDS = [
  "web.output.navigate", "web.output.back", "web.output.dom-click", "web.output.fill", "web.output.clear", "web.output.select",
  "web.output.check", "web.output.upload", "web.output.extract", "web.output.detect", "web.output.inspect", "web.output.scroll",
  "web.output.wait", "web.output.assert", "web.output.download", "web.output.keypress", "web.output.dialog", "web.output.tab"
];

describe("automationStudioActivityAction and the chat's action kinds", () => {
  it.each(IDS)("says %s in a sentence a card reads back as the same kind", (id) => {
    const title = automationStudioActivityAction({ id });
    expect(title).toBeDefined();
    const word = (id.split(".").at(-1) ?? "").split("-").at(-1) ?? "";
    const expected = activityActionVerb(word)?.kind;
    const card = activityActionOf({ phase: "running", step: { nodeId: "n1" }, detail: { kind: "step", title: title!, status: "started", ref: "n1" } });
    expect(card?.kind).toBe(expected);
  });

  it("passes over a verb it has no sentence for, as it does an unknown word", () => {
    expect(automationStudioActivityAction({ id: "web.output.search" })).toBeUndefined();
    expect(automationStudioActivityAction({ id: "web.output.list-extract" })).toBe("Reading from the page");
  });

  it("reads the words of the shared table", () => {
    expect(automationStudioActivityAction({ id: "web.output.nav" })).toBe("Opening a page");
  });
});
