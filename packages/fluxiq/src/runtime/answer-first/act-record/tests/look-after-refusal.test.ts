// A look opens an act that may have landed only after a call was refused for it and told to look
// (t870). A round's own opening look runs before any decision, so one before the refusal opens
// nothing. A forward run leaves the row out whatever was looked at. A lending library.

import { describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActSeed, parseAutomationStudioAttemptActRecordData, type AutomationStudioAttemptActCall, type AutomationStudioAttemptActRecordData } from "../index.ts";

const WORDS = { what: "Renewed", where: "On the account" };
const ATLAS = { title: "Atlas of Rivers", due: "2026-11-20" };
const press = (over: Partial<AutomationStudioAttemptActCall> = {}): AutomationStudioAttemptActCall => ({ actionId: "press", parameters: { selector: "#renew", element: { label: "Renew card" } }, consequences: ["modify_existing"], stage: "exploration", ...over });
const inDoubt = (record = new AutomationStudioAttemptActRecord(), call = press()) => {
  record.settled(call, { effectApplied: false, uncertain: true, words: WORDS });
  return record;
};
const readBack = (data: AutomationStudioAttemptActRecordData) => {
  const read = parseAutomationStudioAttemptActRecordData(JSON.parse(JSON.stringify(data)));
  if (!read.ok) throw new Error(read.issues.join(", "));
  return new AutomationStudioAttemptActRecord({ seed: read.data });
};

describe("a look before the refusal", () => {
  it("opens nothing, however many ran", () => {
    const record = inDoubt();
    record.looked();
    record.looked();
    expect(record.admit(press()).kind).toBe("look_first");
    expect(record.forModel()).toMatchObject({ acts: [{ state: "may_have_landed", lookedSince: false }] });
  });
});

describe("a look after the refusal", () => {
  it("opens that act, and says so", () => {
    const record = inDoubt();
    expect(record.admit(press()).kind).toBe("look_first");
    expect(record.admit(press()).kind).toBe("look_first");
    record.looked();
    expect(record.admit(press()).kind).toBe("run");
    expect(record.forModel()).toMatchObject({ acts: [{ lookedSince: true }] });
  });

  it("opens only the acts a call was refused for", () => {
    const record = inDoubt();
    const other = press({ parameters: { selector: "#return", element: { label: "Return" } } });
    inDoubt(record, other);
    expect(record.admit(press()).kind).toBe("look_first");
    record.looked();
    expect(record.admit(press()).kind).toBe("run");
    expect(record.admit(other).kind).toBe("look_first");
  });
});

describe("what puts the hold back", () => {
  it("a retry that may have landed again: its first press is refused anew, and a look before that opens nothing", () => {
    const record = inDoubt();
    expect(record.admit(press()).kind).toBe("look_first");
    record.looked();
    inDoubt(record);
    record.looked();
    expect(record.admit(press()).kind).toBe("look_first");
    record.looked();
    expect(record.admit(press()).kind).toBe("run");
  });

  it("a retry that answered it did nothing: told already, so one more look opens it", () => {
    const record = inDoubt();
    expect(record.admit(press()).kind).toBe("look_first");
    record.looked();
    record.settled(press(), { effectApplied: false, words: WORDS });
    expect(record.admit(press()).kind).toBe("look_first");
    record.looked();
    expect(record.admit(press()).kind).toBe("run");
  });

  it("a landing the engine then doubts: refused anew", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(press(), { effectApplied: true, words: WORDS, step: "node:n1" });
    record.doubted("node:n1");
    record.looked();
    expect(record.admit(press()).kind).toBe("look_first");
    record.looked();
    expect(record.admit(press()).kind).toBe("run");
  });
});

describe("a process that died", () => {
  it("a press begun and never answered is refused at its first press whatever looks came before, on a seed as on a carried-on record", async () => {
    const written: AutomationStudioAttemptActRecordData[] = [];
    const dying = new AutomationStudioAttemptActRecord({ persist: async (data) => { written.push(data); } });
    await dying.begun(press(), WORDS);
    const data = written.at(-1)!;
    for (const fresh of [readBack(data), new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data })! })]) {
      fresh.looked();
      expect(fresh.admit(press()).kind).toBe("look_first");
      fresh.looked();
      expect(fresh.admit(press()).kind).toBe("run");
    }
  });

  it("a restart between the refusal and the look loses the refusal on purpose: the next model is refused itself, and its round's opening look opens nothing", () => {
    const record = inDoubt();
    expect(record.admit(press()).kind).toBe("look_first");
    const fresh = readBack(record.data());
    expect(fresh.data()).toEqual(record.data());
    fresh.looked();
    expect(fresh.admit(press()).kind).toBe("look_first");
    fresh.looked();
    expect(fresh.admit(press()).kind).toBe("run");
  });

  it("a look that did open it stands across a restart of the same attempt, and not into a new one", () => {
    const record = inDoubt();
    record.admit(press());
    record.looked();
    expect(readBack(record.data()).admit(press()).kind).toBe("run");
    const seed = automationStudioAttemptActSeed({ data: record.data() })!;
    expect(new AutomationStudioAttemptActRecord({ seed }).admit(press()).kind).toBe("look_first");
  });
});

describe("a forward run", () => {
  it("leaves a held row out, before a look, after one and after a refusal", () => {
    const record = inDoubt(new AutomationStudioAttemptActRecord(), press({ row: ATLAS }));
    expect(record.rowDone(ATLAS)).toBe(true);
    record.looked();
    expect(record.rowDone(ATLAS)).toBe(true);
    record.admit(press({ row: ATLAS }));
    record.looked();
    expect(record.rowDone(ATLAS)).toBe(true);
  });
});
