// A lasting act on the persisted record before it is sent (t870, plan D6; `../record.ts`,
// `begun`), and what an answer then makes of it: the same as if it had never begun.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, type AutomationStudioAttemptActCall, type AutomationStudioAttemptActRecordData } from "../index.ts";

const WORDS = { what: "Renewed a loan", where: "On the loans page" };
const FROZEN = { selector: ".renew", element: { text: "Renew" } };
const call = (over: Partial<AutomationStudioAttemptActCall> = {}): AutomationStudioAttemptActCall => ({ actionId: "library.press", parameters: { target: { handle: "t7" } }, consequences: ["modify_existing"], stage: "exploration", ...over });
const landed = { effectApplied: true, words: WORDS, ranWith: { parameters: FROZEN } };

function writing() {
  const written: AutomationStudioAttemptActRecordData[] = [];
  return { written, persist: async (data: AutomationStudioAttemptActRecordData) => { written.push(data); } };
}

describe("begun", () => {
  it("resolves only after the write, which holds the act as may have landed", async () => {
    let release: () => void = () => undefined;
    const written: AutomationStudioAttemptActRecordData[] = [];
    const record = new AutomationStudioAttemptActRecord({
      persist: async (data) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        written.push(data);
      }
    });
    let resolved = false;
    const begun = record.begun(call(), WORDS).then((said) => {
      resolved = true;
      return said;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(resolved).toBe(false);
    release();
    await expect(begun).resolves.toBe("on_record");
    expect(written[0]!.acts).toEqual([expect.objectContaining({ state: "may_have_landed", what: WORDS.what, stage: "exploration" })]);
  });

  it("writes nothing for a call that declares nothing lasting", async () => {
    const { written, persist } = writing();
    const record = new AutomationStudioAttemptActRecord({ persist });
    await expect(record.begun(call({ consequences: [] }), WORDS)).resolves.toBe("not_lasting");
    await expect(record.begun(call({ consequences: ["none"] }), WORDS)).resolves.toBe("not_lasting");
    await record.flushed();
    expect(written).toEqual([]);
    expect(record.data().acts).toEqual([]);
  });

  it("takes an instructed act a call claims as lasting, whatever it declared", async () => {
    const record = new AutomationStudioAttemptActRecord();
    await expect(record.begun(call({ consequences: [], instructedAct: "part.1" }), WORDS)).resolves.toBe("on_record");
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
  });

  it("says a write that failed, puts the record back, and keeps the failure for flushed", async () => {
    const record = new AutomationStudioAttemptActRecord({ persist: async () => { throw new Error("disk full"); } });
    await expect(record.begun(call(), WORDS)).resolves.toBe("not_written");
    expect(record.data().acts).toEqual([]);
    expect(record.admit(call())).toEqual({ kind: "run" });
    await expect(record.flushed()).rejects.toThrow("disk full");
  });

  it("holds a repeat to a look while its answer is out", async () => {
    const record = new AutomationStudioAttemptActRecord();
    await record.begun(call(), WORDS);
    expect(record.admit(call()).kind).toBe("look_first");
    expect(record.carried({ actionId: "library.press", parameters: { target: { handle: "t7" } } })).toMatchObject({ state: "may_have_landed" });
  });
});

describe("what an answer makes of a begun act", () => {
  /** The same call through a record that began it and one that did not. */
  async function both(outcome: Parameters<AutomationStudioAttemptActRecord["settled"]>[1], over: Partial<AutomationStudioAttemptActCall> = {}, set: (record: AutomationStudioAttemptActRecord) => void = () => undefined) {
    const plain = new AutomationStudioAttemptActRecord({ now: () => 9 });
    const begun = new AutomationStudioAttemptActRecord({ now: () => 9 });
    set(plain);
    set(begun);
    const once = call(over);
    plain.settled(once, outcome);
    await begun.begun(once, { what: "Other words", where: "Another place" });
    begun.settled(once, outcome);
    return { plain: plain.data(), begun: begun.data() };
  }

  it("landed: what it would have been, its id by the frozen form and its words by the answer", async () => {
    const { plain, begun } = await both(landed);
    expect(begun).toEqual(plain);
    expect(begun.acts[0]).toMatchObject({ state: "landed", what: WORDS.what });
  });

  it("uncertain: what it would have been", async () => {
    const { plain, begun } = await both({ effectApplied: false, uncertain: true, words: WORDS });
    expect(begun).toEqual(plain);
    expect(begun.acts[0]?.state).toBe("may_have_landed");
  });

  it("certainly nothing: nothing, as if it had never begun", async () => {
    const { plain, begun } = await both({ effectApplied: false, words: WORDS });
    expect(begun).toEqual(plain);
    expect(begun.acts).toEqual([]);
  });

  it("names the row the answer's sentence names, which was not known when it began", async () => {
    const row = (title: string): JsonObject => ({ title });
    const { plain, begun } = await both({ ...landed, actedOn: "This acted on item 2/2 (Old Roads) only." }, {}, (record) => record.noteReadRows([row("The Long Winter"), row("Old Roads")]));
    expect(begun).toEqual(plain);
    expect(begun.acts[0]?.rowIdentity).toBeDefined();
  });

  it("writes what it settled to, the last write holding it as landed", async () => {
    const { written, persist } = writing();
    const record = new AutomationStudioAttemptActRecord({ persist });
    const once = call();
    await record.begun(once, WORDS);
    record.settled(once, landed);
    await record.flushed();
    expect(written.map((data) => data.acts.map((act) => act.state))).toEqual([["may_have_landed"], ["landed"]]);
  });

  it("writes that it came off the record, for an act that certainly did not happen", async () => {
    const { written, persist } = writing();
    const record = new AutomationStudioAttemptActRecord({ persist });
    const once = call();
    await record.begun(once, WORDS);
    record.settled(once, { effectApplied: false, words: WORDS });
    await record.flushed();
    expect(written.at(-1)!.acts).toEqual([]);
  });

  it("withdrawn: a declared read comes back off as if never begun", async () => {
    const { written, persist } = writing();
    const record = new AutomationStudioAttemptActRecord({ persist });
    const once = call();
    await record.begun(once, WORDS);
    record.withdrawn(once);
    await record.flushed();
    expect(record.data().acts).toEqual([]);
    expect(written.at(-1)!.acts).toEqual([]);
  });

  it("is put back as it stood when the act was already held: a retry after a look that did nothing is held to another look", async () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call(), { effectApplied: false, uncertain: true, words: WORDS });
    record.looked();
    expect(record.admit(call()).kind).toBe("run");
    const retry = call();
    await record.begun(retry, WORDS);
    expect(record.acts()[0]?.state).toBe("may_have_landed");
    record.settled(retry, { effectApplied: false, words: WORDS });
    expect(record.acts()).toHaveLength(1);
    expect(record.admit(call()).kind).toBe("look_first");
  });

  it("counts a landing once for an act asked for several times, and holds a begun one to a look meanwhile", async () => {
    const record = new AutomationStudioAttemptActRecord({ asked: () => 3 });
    for (let landing = 1; landing <= 3; landing += 1) {
      expect(record.admit(call()).kind).toBe("run");
      const once = call();
      await record.begun(once, WORDS);
      expect(record.admit(call()).kind).toBe("look_first");
      record.settled(once, landed);
    }
    expect(record.admit(call()).kind).toBe("already_done");
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed", what: `${WORDS.what} (3 times)` })]);
  });

  it("makes an undeclared press declared while its answer is out, so a process that dies then is held to a look", async () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call({ consequences: [] }), landed);
    await record.begun(call(), WORDS);
    const fresh = new AutomationStudioAttemptActRecord({ seed: record.data() });
    expect(fresh.admit(call()).kind).toBe("look_first");
    expect(fresh.acts()).toEqual([expect.objectContaining({ state: "may_have_landed", classes: ["modify_existing"] })]);
  });

  it("only the answer to that very call replaces what it began", async () => {
    const record = new AutomationStudioAttemptActRecord();
    await record.begun(call(), WORDS);
    record.settled(call(), { effectApplied: false, words: WORDS });
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
  });
});

describe("carried, counted", () => {
  it("lets a run's next press through while the count has room, and not otherwise", () => {
    const record = new AutomationStudioAttemptActRecord({ asked: () => 2 });
    const ask = { actionId: "library.press", parameters: FROZEN };
    record.settled(call({ parameters: FROZEN }), landed);
    expect(record.carried({ ...ask, counted: true })).toBeUndefined();
    expect(record.carried(ask)).toBeDefined();
    record.settled(call({ parameters: FROZEN }), landed);
    expect(record.carried({ ...ask, counted: true })).toBeDefined();
  });

  it("never lets through one that may have landed, room or not", () => {
    const record = new AutomationStudioAttemptActRecord({ asked: () => 2 });
    record.settled(call({ parameters: FROZEN }), { effectApplied: false, uncertain: true, words: WORDS });
    expect(record.carried({ actionId: "library.press", parameters: FROZEN, counted: true })).toMatchObject({ state: "may_have_landed" });
  });
});

describe("doubted", () => {
  const step = "node:press";

  it("turns what a step just landed into may have, for a judgement made after its answer", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call({ parameters: FROZEN, stage: "run" }), { effectApplied: true, words: WORDS, step });
    record.doubted(step);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    expect(record.admit(call({ parameters: FROZEN })).kind).toBe("look_first");
    record.looked();
    expect(record.admit(call({ parameters: FROZEN })).kind).toBe("run");
  });

  it("gives a count back: only a landing that happened uses it up", () => {
    const record = new AutomationStudioAttemptActRecord({ asked: () => 2 });
    record.settled(call({ parameters: FROZEN }), { effectApplied: true, words: WORDS, step });
    record.settled(call({ parameters: FROZEN }), { effectApplied: true, words: WORDS, step });
    record.doubted(step);
    expect(record.data().acts[0]?.landings).toBe(1);
  });

  it("touches nothing for a step that landed nothing", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(call({ parameters: FROZEN }), { effectApplied: true, words: WORDS });
    record.doubted(step);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed" })]);
  });
});
