// Which item a press by hand was on, from the answers real presses have (`./real-press-answers.ts`). Both paid runs of this
// task pressed every Save by hand on the item's own page, so their lines read "Save. Save. Save.": that answer holds no
// item sentence and the call no row. These go through the real gate, as the attempt's call chain does.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActGate, automationStudioAttemptActPageWords } from "../index.ts";
import { ITEMS, navigateAnswer, openCardAnswer, ORIGIN, pressSaveAnswer, readListAnswer, readSavedAnswer, type Item } from "./real-press-answers.ts";

type Answer = AutomationStudioLlmEvidenceToolExecutionResult;
type Call = { callId: string; toolId: string; value: JsonObject };

/** Whether a call presses Save: every Save has one frozen form, on whichever page, as a real one has. A card's press is another control. */
const isSave = (call: Call): boolean => JSON.stringify(call.value.consequences) === JSON.stringify(["modify_existing"]);

/** The attempt's gate on a record, answering each call with the answer given, and saying what a call names as the domain does. */
function attempt(record = new AutomationStudioAttemptActRecord()) {
  let next: Answer;
  let ordinal = 0;
  const gate = automationStudioAttemptActGate<Call, Answer>({
    record,
    executeTool: async () => next,
    foresee: (call) => isSave(call) ? { words: "Save", parameters: { selector: "[data-testid=\"save\"]", element: { tagName: "div", role: "button", accessibleName: "Save", testId: "save" } } } : undefined,
    wordsOf: (call) => isSave(call) ? { what: "Save" } : undefined
  });
  const send = async (value: JsonObject, answer: Answer) => {
    next = answer;
    ordinal += 1;
    return await gate({ callId: `call.${ordinal}`, toolId: "core.run_node", value });
  };
  return {
    record,
    read: (answer = readListAnswer()) => send({ node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.2" } }, consequences: [] }, answer),
    openCard: (item: Item) => send({ node: "web.output.dom-click", parameters: { target: { handle: "t622" } }, consequences: [] }, openCardAnswer(item)),
    goTo: (item: Item) => send({ node: "web.output.browser-navigate", parameters: { url: `http://127.0.0.1:52477${item.path}` }, consequences: [] }, navigateAnswer(item)),
    save: (item: Item, handle: string) => send({ node: "web.output.dom-click", parameters: { target: { handle } }, consequences: ["modify_existing"] }, pressSaveAnswer(item, handle))
  };
}

const whats = (record: AutomationStudioAttemptActRecord) => record.acts().map((act) => act.what);
const LINES = ITEMS.map((item) => `Save: ${item.title}`);
const [FIRST, SECOND, THIRD] = ITEMS as [Item, Item, Item];

describe("a press by hand on an item's own page, after a read that listed the item", () => {
  it("run-mw3itjcy: each Save names the row it was tied to by the page it was made on", async () => {
    const run = attempt();
    await run.read();
    await run.openCard(FIRST);
    await run.save(FIRST, "t889");
    await run.goTo(SECOND);
    await run.save(SECOND, "t1039");
    await run.goTo(THIRD);
    await run.save(THIRD, "t1188");
    expect(whats(run.record)).toEqual(LINES);
    expect(run.record.acts().every((act) => act.rowIdentity !== undefined)).toBe(true);
  });

  it("says the row's own first text cell, not the page's: a title can say more or less than the list did", async () => {
    const run = attempt();
    await run.read();
    await run.goTo(FIRST);
    const titled = pressSaveAnswer(FIRST, "t889");
    (titled.evidence as { read: { title: string } }).read.title = "Buy this today | Potterfind Market";
    await automationStudioAttemptActGate<Call, Answer>({ record: run.record, executeTool: async () => titled })({ callId: "c", toolId: "core.run_node", value: { node: "web.output.dom-click", parameters: { target: { handle: "t889" } }, consequences: ["modify_existing"] } });
    expect(whats(run.record)[0]).toContain(FIRST.title);
  });

  it("keeps the words out of what is persisted, and out of what a model is told in a fresh round", async () => {
    const run = attempt();
    await run.read();
    await run.goTo(FIRST);
    await run.save(FIRST, "t889");
    expect(whats(run.record)).toEqual([LINES[0]]);
    expect(JSON.stringify(run.record.data())).not.toContain("Speckled");
    expect(JSON.stringify(run.record.forModel())).not.toContain("Speckled");
  });
});

describe("a press by hand before any read that lists the item", () => {
  it("run-mw3if5xt: each Save names the page it was pressed on, and a later read of no links changes nothing", async () => {
    const run = attempt();
    await run.openCard(FIRST);
    await run.save(FIRST, "t1138");
    await run.goTo(SECOND);
    await run.save(SECOND, "t1291");
    await run.goTo(THIRD);
    await run.save(THIRD, "t1687");
    await run.read(readSavedAnswer());
    expect(whats(run.record)).toEqual(LINES);
    expect(run.record.acts().every((act) => act.state === "landed")).toBe(true);
  });

  it("a read that comes later and does list the page ties the act, and names it by the row", async () => {
    const run = attempt();
    await run.goTo(FIRST);
    await run.save(FIRST, "t889");
    expect(run.record.acts()[0]!.rowIdentity).toBeUndefined();
    await run.read();
    expect(run.record.acts()[0]!.rowIdentity).toBeDefined();
    expect(whats(run.record)).toEqual([LINES[0]]);
  });

  it("names the page the press was made on when the press moves on", async () => {
    const run = attempt();
    const moved = pressSaveAnswer(FIRST, "t889");
    (moved.evidence as { location: string }).location = `${ORIGIN}/saved/`;
    await automationStudioAttemptActGate<Call, Answer>({ record: run.record, executeTool: async () => moved, wordsOf: () => ({ what: "Save" }) })({ callId: "c", toolId: "core.run_node", value: { node: "web.output.dom-click", parameters: { target: { handle: "t889" } }, consequences: ["modify_existing"] } });
    expect(whats(run.record)).toEqual([LINES[0]]);
  });
});

describe("the order an act's item is said in", () => {
  const settled = (answer: { actedOn?: string; pageTitle?: string }, call: { row?: JsonObject; prior?: (record: AutomationStudioAttemptActRecord) => void } = {}) => {
    const record = new AutomationStudioAttemptActRecord();
    call.prior?.(record);
    record.settled({ actionId: "web.click", parameters: { selector: "#save" }, consequences: ["modify_existing"], stage: "exploration", ...(call.row ? { row: call.row } : {}) }, { effectApplied: true, words: { what: "Save", where: "" }, ...answer });
    return record.acts()[0]!.what;
  };

  it("the answer's sentence first", () => {
    expect(settled({ actedOn: "item 1/6 (£60, Speckled mug)", pageTitle: "Bowl | Market" }, { row: { title: "Jug" } })).toBe("Save: Speckled mug");
  });
  it("then the row the call came with", () => {
    expect(settled({ pageTitle: "Bowl | Market" }, { row: { title: "Jug" } })).toBe("Save: Jug");
  });
  it("then the row the press is tied to by its page", () => {
    expect(settled({ pageTitle: "Bowl | Market" }, { prior: (record) => {
      record.noteReadRows([{ title: "Jug", link: "/l/1" }, { title: "Mug", link: "/l/2" }]);
      record.notePlace({ location: "http://127.0.0.1:52477/l/1" });
    } })).toBe("Save: Jug");
  });
  it("then the page's own title", () => {
    expect(settled({ pageTitle: "Bowl | Market" })).toBe("Save: Bowl");
  });
  it("and last the control's name alone", () => {
    expect(settled({})).toBe("Save");
  });
  it("a row that fits several with different words names none of them, and the page says instead", () => {
    expect(settled({ pageTitle: "Bowl | Market" }, { prior: (record) => {
      record.noteReadRows([{ title: "Jug", link: "/l/1" }, { title: "Mug", link: "/l/1" }]);
      record.notePlace({ location: "http://127.0.0.1:52477/l/1" });
    } })).toBe("Save: Bowl");
  });
  it("forward and by hand read alike", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.noteReadRows([{ title: "Jug", link: "/l/1" }, { title: "Mug", link: "/l/2" }]);
    record.notePlace({ location: "http://127.0.0.1:52477/l/1" });
    const call = { actionId: "web.click", consequences: ["modify_existing"] };
    record.settled({ ...call, parameters: { target: { handle: "t1" } }, stage: "exploration" }, { effectApplied: true, words: { what: "Save", where: "" }, pageTitle: "Jug | Market" });
    record.settled({ ...call, parameters: { selector: "#save" }, stage: "forward", row: { title: "Mug", link: "/l/2" } }, { effectApplied: true, words: { what: "Save", where: "" } });
    expect(whats(record)).toEqual(["Save: Jug", "Save: Mug"]);
  });
});

describe("what never reaches the line", () => {
  const TOKEN = "sk0abc1DEF2ghi3JKL4mno5PQR6stu7VWX8yz";
  const line = (answer: { pageTitle?: string }, row?: JsonObject) => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled({ actionId: "web.click", parameters: { selector: "#save" }, consequences: ["modify_existing"], stage: "exploration", ...(row ? { row } : {}) }, { effectApplied: true, words: { what: "Save", where: "" }, ...answer });
    return record.acts()[0]!.what;
  };

  it("a row or a title shaped like a credential leaves the plain line", () => {
    expect(line({}, { title: `Key ${TOKEN}` })).toBe("Save");
    expect(line({ pageTitle: `Key ${TOKEN} | Market` })).toBe("Save");
  });
  it("words that only say the control's name again", () => {
    expect(line({}, { action: "Save" })).toBe("Save");
    expect(line({ pageTitle: "save | Market" })).toBe("Save");
  });
  it("a model's words: nothing it wrote is a source, so what it called the press is not said", async () => {
    const record = new AutomationStudioAttemptActRecord();
    const gate = automationStudioAttemptActGate<Call, Answer>({ record, executeTool: async () => pressSaveAnswer(FIRST, "t889"), wordsOf: () => ({ what: "Save" }) });
    await gate({ callId: "called.the.cheapest.table", toolId: "core.run_node", value: { node: "web.output.dom-click", summary: "Press Save on the cheapest table", parameters: { target: { handle: "t889" } }, consequences: ["modify_existing"] } });
    expect(whats(record)).toEqual([LINES[0]]);
  });
});

describe("a record read back from disk", () => {
  it("says the plain line for what it did before the restart, until a read of the same rows names it again", async () => {
    const run = attempt();
    await run.read();
    await run.goTo(FIRST);
    await run.save(FIRST, "t889");
    const restored = new AutomationStudioAttemptActRecord({ seed: run.record.data() });
    expect(whats(restored)).toEqual(["Save"]);
    restored.noteReadRows(((readListAnswer().evidence as { read: { extracted: JsonObject[] } }).read.extracted));
    expect(whats(restored)).toEqual([LINES[0]]);
  });
});

describe("a page's title as the words that name it", () => {
  it.each([
    ["the page's name before the bar", "Speckled mug, 300ml | Potterfind Market", "Speckled mug, 300ml"],
    ["a listing's own dash kept before the bar", "Oak table - seats four | Potterfind", "Oak table - seats four"],
    ["the site's name after a dash", "Oak table - seats four - Potterfind", "Oak table - seats four"],
    ["a title with no mark, whole", "Speckled mug", "Speckled mug"],
    ["only a number", "12 | Potterfind", undefined],
    ["nothing", undefined, undefined]
  ])("reads %s", (_name, title, expected) => {
    expect(automationStudioAttemptActPageWords(title)).toBe(expected);
  });
});
