// What the domain says a call would be, read before it is sent (t870): a by-hand press by a handle
// says nothing else the record can know it by. It only adds to what is refused. A lending library.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActSeed, type AutomationStudioAttemptActCall } from "../index.ts";

const WORDS = { what: "Renewed", where: "On the account" };
const ADDRESS = "#renew-card";
const CARD_ELEMENT = { tag: "button", label: "Renew card" };
const ATLAS = { title: "Atlas of Rivers", due: "2026-11-20" };
const BIRDS = { title: "Birds of the Coast", due: "2026-11-21" };
const CLOCKS = { title: "Clockmaking", due: "2026-11-22" };

const pressed = (over: Partial<AutomationStudioAttemptActCall> = {}): AutomationStudioAttemptActCall => ({ actionId: "press", parameters: { selector: ADDRESS, element: CARD_ELEMENT }, consequences: ["modify_existing"], stage: "exploration", ...over });
/** A press by a handle the record has not met, with what the domain says of it. */
const byHandle = (foreseen: AutomationStudioAttemptActCall["foreseen"], handle = "t77"): AutomationStudioAttemptActCall => ({ actionId: "press", parameters: { target: { handle } }, consequences: ["modify_existing"], stage: "exploration", ...(foreseen ? { foreseen } : {}) });
const landed = (record: AutomationStudioAttemptActRecord, call: AutomationStudioAttemptActCall = pressed(), actedOn?: string) => record.settled(call, { effectApplied: true, words: WORDS, ...(actedOn ? { actedOn } : {}) });
const withRows = (rows: readonly JsonObject[] = [ATLAS, BIRDS, CLOCKS]) => {
  const record = new AutomationStudioAttemptActRecord();
  record.noteReadRows([...rows]);
  return record;
};
/** Atlas pressed on its row, as a run's For Each hands it on: the same row in another shape than the read's. */
const atlasPressed = (record: AutomationStudioAttemptActRecord) => landed(record, { actionId: "press", parameters: { control: "Renew" }, consequences: ["modify_existing"], stage: "run", row: { book: ATLAS.title, until: ATLAS.due } });

describe("an act on no row", () => {
  it("refuses the same address the call would run with, and the same whole fingerprint", () => {
    const record = new AutomationStudioAttemptActRecord();
    landed(record);
    expect(record.admit(byHandle(undefined)).kind).toBe("run");
    expect(record.admit(byHandle({ parameters: { selector: ADDRESS, element: { tag: "a", label: "Another name" } } })).kind).toBe("already_done");
    expect(record.admit(byHandle({ parameters: { selector: "#elsewhere", element: CARD_ELEMENT } })).kind).toBe("already_done");
  });

  it("admits another control, and the same control with other inputs", () => {
    const record = new AutomationStudioAttemptActRecord();
    landed(record);
    expect(record.admit(byHandle({ parameters: { selector: "#elsewhere", element: { tag: "button", label: "Close" } } })).kind).toBe("run");
    expect(record.admit(byHandle({ parameters: { selector: ADDRESS, element: CARD_ELEMENT, text: "A note" } })).kind).toBe("run");
  });

  it("admits the same control on another page, where both pages are known: two items each have their own", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.notePlace({ url: "https://library.example/item/1" });
    landed(record);
    expect(record.admit(byHandle({ parameters: pressed().parameters })).kind).toBe("already_done");
    record.notePlace({ location: "https://library.example/item/2" });
    expect(record.admit(byHandle({ parameters: pressed().parameters })).kind).toBe("run");
  });

  it("holds it the same where a page is not known", () => {
    const record = new AutomationStudioAttemptActRecord();
    landed(record);
    record.notePlace({ url: "https://library.example/item/2" });
    expect(record.admit(byHandle({ parameters: pressed().parameters })).kind).toBe("already_done");
  });

  it("holds a repeat that may have landed to a look, by the frozen form too", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(pressed(), { effectApplied: false, uncertain: true, words: WORDS });
    const again = byHandle({ parameters: pressed().parameters });
    expect(record.admit(again).kind).toBe("look_first");
    record.looked();
    expect(record.admit(again).kind).toBe("run");
  });

  it("a request's count still has room, by a new handle as by the old", () => {
    const record = new AutomationStudioAttemptActRecord({ asked: () => 3 });
    landed(record);
    expect(record.admit(byHandle({ parameters: pressed().parameters })).kind).toBe("run");
  });
});

describe("an act on a row", () => {
  it("refuses a press whose words fit that row, whatever shape it was acted on in", () => {
    const record = withRows();
    atlasPressed(record);
    expect(record.admit(byHandle({ words: `Renew ${ATLAS.title}` })).kind).toBe("already_done");
  });

  it("reads the row's words out of the fingerprint it would run with, at any depth", () => {
    const record = withRows();
    atlasPressed(record);
    expect(record.admit(byHandle({ words: "Renew", parameters: { selector: "li:nth-of-type(1) > button", element: { label: "Renew", context: { within: { words: `${ATLAS.title} due soon` } } } } })).kind).toBe("already_done");
    expect(record.admit(byHandle({ words: "Renew", parameters: { selector: "li:nth-of-type(2) > button", element: { label: "Renew", context: { within: { words: `${BIRDS.title} due soon` } } } } })).kind).toBe("run");
  });

  it("admits a press whose words fit another row, though it shares the address and the fingerprint", () => {
    const record = withRows();
    const frozen = { selector: ".renew", element: { label: "Renew" } };
    landed(record, { actionId: "press", parameters: frozen, consequences: ["modify_existing"], stage: "exploration", row: ATLAS });
    expect(record.admit(byHandle({ words: `Renew ${BIRDS.title}`, parameters: frozen })).kind).toBe("run");
  });

  it("admits a row's other control, whose words differ", () => {
    const record = withRows();
    landed(record, { actionId: "press", parameters: { selector: "#a", element: { label: "Renew" } }, consequences: ["modify_existing"], stage: "exploration", row: ATLAS });
    expect(record.admit(byHandle({ words: `Report ${ATLAS.title}`, parameters: { selector: "#b", element: { label: "Report" } } })).kind).toBe("run");
    expect(record.admit(byHandle({ words: `Renew ${ATLAS.title}`, parameters: { selector: "#c", element: { label: "Renew" } } })).kind).toBe("already_done");
  });

  it("admits a control with no row's words, though its whole fingerprint is the acted one's: every row's control has it", () => {
    const record = withRows();
    const element = { label: "Renew" };
    landed(record, { actionId: "press", parameters: { element }, consequences: ["modify_existing"], stage: "exploration", row: ATLAS });
    expect(record.admit(byHandle({ words: "Renew", parameters: { element } })).kind).toBe("run");
  });

  it("refuses a control with no row's words at the very address the act ran with", () => {
    const record = withRows();
    landed(record, { actionId: "press", parameters: { selector: "#loan-atlas .renew", element: { label: "Renew" } }, consequences: ["modify_existing"], stage: "exploration", row: ATLAS });
    expect(record.admit(byHandle({ words: "Renew", parameters: { selector: "#loan-atlas .renew", element: { label: "Other" } } })).kind).toBe("already_done");
  });

  it("words every row holds name no row: a column repeating the control's name does not refuse every other", () => {
    const rows = [{ ...ATLAS, action: "Renew" }, { ...BIRDS, action: "Renew" }, { ...CLOCKS, action: "Renew" }];
    const record = withRows(rows);
    landed(record, { actionId: "press", parameters: { control: "Renew" }, consequences: ["modify_existing"], stage: "exploration", row: rows[0]! });
    expect(record.admit(byHandle({ words: "Renew" })).kind).toBe("run");
    expect(record.admit(byHandle({ words: `Renew ${ATLAS.title}` })).kind).toBe("already_done");
  });

  it("words that fit one row in two shapes are still that row", () => {
    const record = withRows([ATLAS]);
    landed(record, { actionId: "press", parameters: { control: "Renew" }, consequences: ["modify_existing"], stage: "run", row: { book: ATLAS.title } });
    expect(record.admit(byHandle({ words: ATLAS.title })).kind).toBe("already_done");
  });

  it("on the row's own page, only where its key or control's words also agree", () => {
    const record = withRows([{ ...ATLAS, link: "/loan/1" }, BIRDS]);
    record.notePlace({ url: "https://library.example/loan/1" });
    landed(record, pressed());
    expect(record.rowDone({ ...ATLAS, link: "/loan/1" })).toBe(true);
    expect(record.admit(byHandle({ words: "Press here", parameters: { selector: "#new-spot", element: CARD_ELEMENT } })).kind).toBe("already_done");
    expect(record.admit(byHandle({ words: "Another", parameters: { selector: "#other", element: { label: "Another" } } })).kind).toBe("run");
  });

  it("a call that carries its row says for itself what it is on", () => {
    const record = withRows();
    atlasPressed(record);
    const pass = { actionId: "press", parameters: { control: "Renew" }, consequences: ["modify_existing"], stage: "forward" as const, row: BIRDS, foreseen: { words: `Renew ${ATLAS.title}` } };
    expect(record.admit(pass).kind).toBe("run");
  });
});

describe("what an act keeps of it", () => {
  it("a press that dies before its answer is known by the frozen form and the words' row, on a seed for the next attempt", async () => {
    const before = withRows();
    await before.begun(byHandle({ words: `Renew ${ATLAS.title}`, parameters: { selector: "#loan-atlas .renew", element: { label: "Renew" } } }), WORDS);
    const seed = automationStudioAttemptActSeed({ status: "stopped_by_person", data: before.data() })!;
    const fresh = new AutomationStudioAttemptActRecord({ seed });
    expect(fresh.rowDone(ATLAS)).toBe(true);
    expect(fresh.rowDone(BIRDS)).toBe(false);
    // Another attempt's handle may be any control: the seed drops it, and the frozen form stands.
    expect(fresh.admit(byHandle(undefined)).kind).toBe("run");
    expect(fresh.admit(byHandle({ parameters: { selector: "#loan-atlas .renew", element: { label: "Renew" } } }, "t3")).kind).toBe("look_first");
  });

  it("an answer that says nothing of what it ran with leaves the frozen form on the act, and a retry by a new handle settles the same one", () => {
    const record = new AutomationStudioAttemptActRecord();
    const parameters = pressed().parameters;
    record.settled(byHandle({ parameters }), { effectApplied: false, uncertain: true, words: WORDS });
    expect(record.admit(pressed()).kind).toBe("look_first");
    record.looked();
    record.settled(byHandle({ parameters }, "t78"), { effectApplied: true, words: WORDS });
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed" })]);
    expect(record.admit(pressed()).kind).toBe("already_done");
  });

  it("holds no words of it in the clear", async () => {
    const record = withRows();
    await record.begun(byHandle({ words: "Renew the secret shelf", parameters: { selector: "#x", element: { label: "The hidden word" } } }), {});
    const kept = JSON.stringify(record.data());
    expect(kept).not.toContain("secret shelf");
    expect(kept).not.toContain("hidden word");
    expect(kept).not.toContain("#x");
  });

  it("changes nothing for a call it says nothing of", () => {
    const plain = withRows();
    const said = withRows();
    atlasPressed(plain);
    atlasPressed(said);
    expect(said.admit(byHandle({})).kind).toBe(plain.admit(byHandle(undefined)).kind);
  });
});

describe("what it still gets wrong", () => {
  it("known limit, too much: two rows whose words cannot be told apart. The one not pressed is held done by hand too, so a judge's no does not bring it back by this press", () => {
    const second = { title: ATLAS.title, due: "2026-12-01" };
    const record = withRows([ATLAS, second, BIRDS]);
    landed(record, { actionId: "press", parameters: { control: "Renew" }, consequences: ["modify_existing"], stage: "run", row: ATLAS });
    expect(record.admit(byHandle({ words: `Renew ${ATLAS.title}` })).kind).toBe("already_done");
  });

  it("known limit, too much: the same whole fingerprint for another item on one address, where nothing else tells them apart", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.notePlace({ url: "https://library.example/shelf" });
    landed(record, pressed({ parameters: { element: CARD_ELEMENT } }));
    expect(record.admit(byHandle({ parameters: { element: CARD_ELEMENT } })).kind).toBe("already_done");
  });

  it("known limit, too little: a control whose words changed with the press and whose address counts places reads as another control", () => {
    const record = new AutomationStudioAttemptActRecord();
    const address = "li:nth-of-type(1) > button";
    landed(record, pressed({ parameters: { selector: address, element: { label: "Renew card" } } }));
    expect(record.admit(byHandle({ parameters: { selector: address, element: { label: "Card renewed" } } })).kind).toBe("run");
  });

  it("known limit, too little: a row's values written otherwise than the words say", () => {
    const record = withRows();
    atlasPressed(record);
    expect(record.admit(byHandle({ words: "Renew the rivers book" })).kind).toBe("run");
  });
});
