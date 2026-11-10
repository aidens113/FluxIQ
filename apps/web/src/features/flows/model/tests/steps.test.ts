import { describe, expect, it } from "vitest";
import type { FlowOutline, OutlineStep } from "../../wire";
import { appendPoint, lastingBadges, mayWords, stepViews, wordPieces } from "..";

const step = (number: string, kind: string, words: string, extra: Partial<OutlineStep> = {}): OutlineStep => ({
  number, nodeIds: number ? [`node-${number}`] : [], kind, words, lasting: [], children: [], arms: [], ...extra
});

const outline: FlowOutline = {
  interface: { needs: [{ id: "query", name: "Query", type: "text", required: true }], gives: [{ id: "listings", name: "Listings", type: "a list of a record", required: true }] },
  steps: [
    step("1", "act", "Open the shop"),
    step("2", "act", "Type {query} into “Search”"),
    step("3", "loop", "For each of results, up to {count}:", {
      children: [step("3.1", "branch", "Only if “Ships to” is {query}:", { arms: [{ words: "Otherwise:", steps: [step("3.2", "data", "Keep title and price", { lasting: ["delete"] })] }] })]
    }),
    step("4", "call", "Run Flow ▸ Sort and keep cheapest", { link: { kind: "flow", id: "flow-sort" }, lasting: ["send_or_publish"] }),
    step("5", "call", "Run Flow ▸ Close the banner", { link: { kind: "subflow", id: "sub-1" } }),
    step("6", "jump", "Go back to step 2"),
    step("7", "give-back", "Give back listings"),
    step("", "handlers", "If something goes wrong:", { children: [step("8", "call", "Run Flow ▸ Retry", { link: { kind: "fluxnode", id: "retry" }, lasting: ["move_money"] })] })
  ],
  issues: []
};

describe("stepViews", () => {
  const views = stepViews(outline, { projectId: "p 1", changedSteps: ["2"] });

  it("turns {inputs} into chips and knows which name an input of the Flow", () => {
    expect(views[1]?.words).toEqual([
      { kind: "text", text: "Type " },
      { kind: "input", name: "query", known: true },
      { kind: "text", text: " into “Search”" }
    ]);
    expect(views[2]?.words.find((piece) => piece.kind === "input")).toEqual({ kind: "input", name: "count", known: false });
  });

  it("links a Run Flow step to a Flow of the project, and names the others without a link", () => {
    expect(views[3]?.link).toEqual({ name: "Sort and keep cheapest", href: "/flows/flow-sort?project=p%201" });
    expect(views[3]?.words).toEqual([{ kind: "text", text: "Run Flow ▸" }]);
    expect(views[3]?.plainWords).toBe("Run Flow ▸ Sort and keep cheapest");
    expect(views[4]?.link).toEqual({ name: "Close the banner" });
    expect(views[7]?.children[0]?.link).toEqual({ name: "Retry" });
  });

  it("shows lasting badges, nested children and arms", () => {
    expect(views[3]?.badges).toEqual(["sends"]);
    expect(views[2]?.children[0]?.arms[0]?.steps[0]?.badges).toEqual(["deletes"]);
    expect(views[7]?.children[0]?.badges).toEqual(["pays"]);
  });

  it("lets a person change a step that stands for a node, and not a jump, an ending or a heading", () => {
    expect(views.map((view) => view.editable)).toEqual([true, true, true, true, true, false, false, false]);
    expect(views[5]?.jump).toBe(true);
  });

  it("marks the steps someone else changed", () => {
    expect(views.filter((view) => view.changed).map((view) => view.number)).toEqual(["2"]);
  });

  it("gives every step a distinct key", () => {
    const keys: string[] = [];
    const walk = (list: typeof views) => list.forEach((view) => {
      keys.push(view.key);
      walk(view.children);
      view.arms.forEach((arm) => walk(arm.steps));
    });
    walk(views);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("the small readers", () => {
  it("wordPieces keeps words without chips whole", () => {
    expect(wordPieces("Press “Buy”", [])).toEqual([{ kind: "text", text: "Press “Buy”" }]);
    expect(wordPieces("{a}{b}", ["a"])).toEqual([{ kind: "input", name: "a", known: true }, { kind: "input", name: "b", known: false }]);
  });

  it("lastingBadges keeps one order and reads an unknown class as a change", () => {
    expect(lastingBadges(["create_new", "delete", "send_or_publish"])).toEqual(["sends", "deletes", "creates"]);
    expect(lastingBadges(["something_new"])).toEqual(["changes"]);
    expect(lastingBadges([])).toEqual([]);
  });

  it("appendPoint adds before the ending, or first in an empty Flow", () => {
    expect(appendPoint(outline)).toBe("5");
    expect(appendPoint({ ...outline, steps: [step("1", "empty", "Nothing here yet")] })).toBeUndefined();
  });

  it("mayWords names every lasting act in the Flow and the sites", () => {
    expect(mayWords(outline, ["market.example"])).toBe("May send, delete and pay · on market.example");
    expect(mayWords({ ...outline, steps: [step("1", "act", "Read the list")] }, [])).toBe("Only reads and looks; changes nothing that lasts");
  });
});
