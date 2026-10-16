// How one part compares across two plans (t595, t671), with what changed in
// words: on Lab `run-mvan7giv` a part's lasting act was rewritten and the
// amendment's answer said only "its parts changed".
import { describe, expect, it } from "vitest";
import type { AutomationStudioProjectTaskSpec } from "../../contracts/index.ts";
import { automationStudioProjectSupervisorPartChange as change } from "../index.ts";

const spec = (text: string, facts: string[], acts: string[] = [], sourceId = "instruction.1"): AutomationStudioProjectTaskSpec => ({
  parts: [{ id: "p1", quote: { sourceId, text }, goalFacts: facts, lastingActs: acts } as AutomationStudioProjectTaskSpec["parts"][number]],
  notAsked: [],
  digest: "d".repeat(64)
});
const FIND = "Find the three newest titles by Ada Hart";

describe("one part compared across two plans", () => {
  it("is the same, or reworded when its words moved by a word or two at their ends", () => {
    expect(change(spec(FIND, ["three titles are found"]), spec(FIND, ["  Three titles  are found "]), "p1")).toEqual({ change: "same" });
    expect(change(spec(`In Bookhall, ${FIND}.`, ["three titles are found"]), spec(FIND, ["three titles are found"]), "p1")).toEqual({ change: "reworded" });
  });

  it("says what changed: its facts, its lasting acts, its source, its words, or that it is new or gone", () => {
    expect(change(spec(FIND, ["the titles are shown"]), spec(FIND, ["three titles are found"]), "p1")).toEqual({ change: "facts", what: "its facts changed" });
    expect(change(spec(FIND, [], ["modify_existing"]), spec(FIND, [], ["create_new"]), "p1")).toEqual({ change: "acts", what: "its lasting acts changed, from create_new to modify_existing" });
    expect(change(spec(FIND, [], [], "instruction.2"), spec(FIND, []), "p1")).toEqual({ change: "changed", what: "it quotes another instruction" });
    expect(change(spec("Find the newest titles", []), spec(FIND, []), "p1")).toMatchObject({ change: "changed" });
    expect(change(spec(FIND, []), { ...spec(FIND, []), parts: [] }, "p1")).toEqual({ change: "changed", what: "it is a new part" });
  });
});
