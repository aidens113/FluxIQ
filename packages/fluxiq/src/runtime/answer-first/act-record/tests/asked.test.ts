// The act record's count of an act the person asked for several times (`../record.ts`, header):
// up to that many landings run, the next is refused, a row is one per row, an uncertain landing is
// held to a look, and the count survives the file it is written to.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActMarkDoneInAchieved, automationStudioAttemptActSeed, parseAutomationStudioAttemptActRecordData, type AutomationStudioAttemptActCall } from "../index.ts";

const call = (over: Partial<AutomationStudioAttemptActCall> = {}): AutomationStudioAttemptActCall => ({ actionId: "domain.add", parameters: { target: { handle: "h1" } }, consequences: ["modify_existing"], stage: "exploration", ...over });
const landed = { effectApplied: true, words: { what: "Added one", where: "On the page" } };
const uncertain = { effectApplied: false, uncertain: true, words: { what: "Added one", where: "On the page" } };
const askedFor = (count: number | undefined) => new AutomationStudioAttemptActRecord({ asked: () => count });
const row: JsonObject = { title: "Pencils" };

describe("an act asked for several times", () => {
  it("runs up to that many landings and refuses the next", () => {
    const record = askedFor(3);
    for (let landing = 1; landing <= 3; landing += 1) {
      expect(record.admit(call()).kind).toBe("run");
      record.settled(call(), landed);
    }
    expect(record.admit(call()).kind).toBe("already_done");
    expect(record.acts()).toHaveLength(1);
    expect(record.acts()[0]?.what).toContain("3 times");
  });

  it("with no count stays at one, and so does a count of one", () => {
    for (const record of [askedFor(undefined), askedFor(1)]) {
      record.settled(call(), landed);
      expect(record.admit(call()).kind).toBe("already_done");
      expect(record.acts()[0]?.what).not.toContain("times");
    }
  });

  it("reads the count once, at the first landing: a later answer does not raise it", () => {
    let count = 2;
    const record = new AutomationStudioAttemptActRecord({ asked: () => count });
    record.settled(call(), landed);
    count = 10;
    record.settled(call(), landed);
    expect(record.admit(call()).kind).toBe("already_done");
  });

  it("ignores an answer that is no whole count", () => {
    for (const bad of [Number.NaN, 2.5, -3, 0]) {
      const record = askedFor(bad);
      record.settled(call(), landed);
      expect(record.admit(call()).kind).toBe("already_done");
    }
  });

  it("is one per row, whatever is asked", () => {
    const record = askedFor(3);
    record.settled(call({ row }), landed);
    expect(record.admit(call({ row })).kind).toBe("already_done");
    expect(record.admit(call({ row: { title: "Rulers" } })).kind).toBe("run");
    expect(record.rowDone(row)).toBe(true);
  });

  it("holds an uncertain landing to a look, and only a landing the answer says happened uses up the count", () => {
    const record = askedFor(2);
    record.settled(call(), landed);
    record.settled(call(), uncertain);
    expect(record.admit(call()).kind).toBe("look_first");
    expect(record.acts()[0]?.state).toBe("may_have_landed");
    record.looked();
    expect(record.admit(call()).kind).toBe("run");
    record.settled(call(), landed);
    expect(record.admit(call()).kind).toBe("already_done");
    expect(record.acts()[0]?.state).toBe("landed");
  });

  it("a step is done only when the count is reached, so a forward run sends it until then", () => {
    const record = askedFor(2);
    const step = { actionId: "domain.add", parameters: { target: { handle: "h1" } } };
    record.settled(call(), landed);
    expect(record.stepDone(step)).toBe(false);
    record.settled(call(), landed);
    expect(record.stepDone(step)).toBe(true);
  });

  it("a seeded record keeps the count and what landed", () => {
    const record = askedFor(3);
    record.settled(call(), landed);
    const read = parseAutomationStudioAttemptActRecordData(JSON.parse(JSON.stringify(record.data())));
    expect(read.ok).toBe(true);
    const seeded = new AutomationStudioAttemptActRecord(read.ok ? { seed: read.data } : {});
    seeded.settled(call(), landed);
    expect(seeded.admit(call()).kind).toBe("run");
    seeded.settled(call(), landed);
    expect(seeded.admit(call()).kind).toBe("already_done");
  });

  // The same words again (run-mw4eb5r3-a20f3542): one press after a quantity was chosen landed the whole count, so the
  // record held 1 landing of 2 asked. The attempt ended achieved; a new attempt carries the act; nothing may press it again.
  const NAPKINS = { actionId: "domain.add", parameters: { target: { handle: "h1" } } };
  const seeded = (count: number, ended: "achieved" | "unfinished", landings: number) => {
    const first = askedFor(count);
    for (let landing = 0; landing < landings; landing += 1) first.settled(call(), landed);
    const data = ended === "achieved" ? automationStudioAttemptActMarkDoneInAchieved(first.data()) : first.data();
    return new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data })!, asked: () => count });
  };

  it("a count act carried from an achieved attempt has no room: the run gate, a press by hand and a step all hold it done", () => {
    const next = seeded(2, "achieved", 1);
    expect(next.carried({ ...NAPKINS, counted: true })).toBeDefined();
    expect(next.admit(call()).kind).toBe("already_done");
    expect(next.stepDone(NAPKINS)).toBe(true);
    expect(next.acts()[0]?.what).toContain("Already done earlier");
  });

  it("a count act carried from an unfinished attempt keeps its room: the same words run the rest, then it is done", () => {
    const next = seeded(3, "unfinished", 1);
    expect(next.carried({ ...NAPKINS, counted: true })).toBeUndefined();
    for (let landing = 0; landing < 2; landing += 1) {
      expect(next.admit(call()).kind).toBe("run");
      next.settled(call(), landed);
    }
    expect(next.admit(call()).kind).toBe("already_done");
  });

  it("the mark survives a union and the file, and goes when the attempt does the act itself", () => {
    const data = automationStudioAttemptActMarkDoneInAchieved(askedFor(2).data());
    expect(data.acts).toHaveLength(0);
    const first = askedFor(2);
    first.settled(call(), landed);
    const marked = automationStudioAttemptActMarkDoneInAchieved(first.data());
    expect(parseAutomationStudioAttemptActRecordData(JSON.parse(JSON.stringify(marked))).ok).toBe(true);
    const seed = automationStudioAttemptActSeed({ data: first.data(), earlier: marked })!;
    expect(seed.acts[0]?.doneInAchieved).toBe(true);
  });

  it("a row-bound act and a non-count act are held done as before, marked or not", () => {
    for (const ended of ["achieved", "unfinished"] as const) {
      const byRow = askedFor(3);
      byRow.settled(call({ row }), landed);
      const rowSeed = automationStudioAttemptActSeed({ data: ended === "achieved" ? automationStudioAttemptActMarkDoneInAchieved(byRow.data()) : byRow.data() })!;
      expect(new AutomationStudioAttemptActRecord({ seed: rowSeed }).admit(call({ row })).kind).toBe("already_done");
      const plain = askedFor(undefined);
      plain.settled(call(), landed);
      const plainSeed = automationStudioAttemptActSeed({ data: ended === "achieved" ? automationStudioAttemptActMarkDoneInAchieved(plain.data()) : plain.data() })!;
      expect(new AutomationStudioAttemptActRecord({ seed: plainSeed }).admit(call()).kind).toBe("already_done");
    }
  });

  it("the record's file refuses a count that is no count", () => {
    const record = askedFor(3);
    record.settled(call(), landed);
    const data = JSON.parse(JSON.stringify(record.data())) as { acts: { asked: number }[] };
    data.acts[0]!.asked = 1;
    expect(parseAutomationStudioAttemptActRecordData(data).ok).toBe(false);
  });
});
