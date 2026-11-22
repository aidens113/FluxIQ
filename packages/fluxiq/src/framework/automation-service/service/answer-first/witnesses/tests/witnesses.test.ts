import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_BEFORE_WORDS, automationStudioAnswerFirstWitnesses } from "../index.ts";

describe("acts an earlier attempt made", () => {
  const EARLIER: JsonObject = { heading: "A page", ticked: ["one"] };

  it("a seeded before reading is the before side, returned with no read, and held again under this attempt", async () => {
    const reads: string[] = [];
    const kept: JsonObject[] = [];
    const witnesses = automationStudioAnswerFirstWitnesses({ read: async (side) => {
      reads.push(side);
      return { side };
    }, earlier: { before: EARLIER }, keep: (before) => kept.push(before) });
    expect(witnesses.readings()).toEqual({ before: EARLIER });
    await expect(witnesses.beforeFirstLastingAct()).resolves.toEqual({ kind: "read", reading: EARLIER });
    await witnesses.atEnd();
    expect(reads).toEqual(["after"]);
    expect(witnesses.readings()).toEqual({ before: EARLIER, after: { side: "after" } });
    expect(kept).toEqual([EARLIER]);
  });

  it("with no earlier reading held, the judge is told the earlier attempt took it, and is shown none as it", async () => {
    const kept: JsonObject[] = [];
    const witnesses = automationStudioAnswerFirstWitnesses({ read: async (side) => ({ side }), earlier: {}, keep: (before) => kept.push(before) });
    expect(witnesses.readings()).toEqual({ before: { note: AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_BEFORE_WORDS.notHeld } });
    expect(AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_BEFORE_WORDS.notHeld).toMatch(/earlier attempt/u);
    // Its own before side, read after the carried acts, is shown beside the words and never as a reading from before them.
    await expect(witnesses.beforeFirstLastingAct()).resolves.toEqual({ kind: "read", reading: { side: "before" } });
    expect(witnesses.readings()).toEqual({ before: { note: AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_BEFORE_WORDS.takenAfter, reading: { side: "before" } } });
    expect(kept).toEqual([]);
  });

  it("with nothing carried, the before side is read and held as always, and nothing is said of an earlier attempt", async () => {
    const kept: JsonObject[] = [];
    const witnesses = automationStudioAnswerFirstWitnesses({ read: async (side) => ({ side }), keep: (before) => kept.push(before) });
    expect(witnesses.readings()).toEqual({});
    await witnesses.beforeFirstLastingAct();
    expect(witnesses.readings()).toEqual({ before: { side: "before" } });
    expect(kept).toEqual([{ side: "before" }]);
  });

  it("a keep that throws costs the reading nothing", async () => {
    const witnesses = automationStudioAnswerFirstWitnesses({ read: async (side) => ({ side }), keep: () => { throw new Error("no room"); } });
    await expect(witnesses.beforeFirstLastingAct()).resolves.toEqual({ kind: "read", reading: { side: "before" } });
    expect(witnesses.notes()).toEqual([]);
  });
});

describe("automationStudioAnswerFirstWitnesses", () => {
  it("associates only actual settlements between successful reads and refreshes the after when another act occurs", async () => {
    const calls: string[] = [];
    const witnesses = automationStudioAnswerFirstWitnesses({ read: async (side) => {
      calls.push(side);
      return { side, at: calls.length };
    } });
    const first = { callId: "actual.call.1", actId: "actual.act.1" };
    const second = { callId: "actual.call.2", actId: "actual.act.2" };
    await witnesses.beforeFirstLastingAct();
    witnesses.settled?.(first);
    await witnesses.atEnd();
    expect(witnesses.readings().association).toEqual({ version: 1, before: [first], after: [first] });
    witnesses.settled?.(second);
    expect(witnesses.readings()).not.toHaveProperty("after");
    expect(witnesses.readings().association?.after).toEqual([]);
    await witnesses.atEnd();
    expect(witnesses.readings().association).toEqual({ version: 1, before: [first, second], after: [first, second] });
    expect(calls).toEqual(["before", "after", "after"]);
  });

  it("reads the current end freshly when composition requests a new check, even without a call-gate settlement", async () => {
    let version = 1;
    const witnesses = automationStudioAnswerFirstWitnesses({ read: async () => ({ version }) });
    await witnesses.atEnd();
    version = 2;
    await witnesses.atEnd(true);
    expect(witnesses.readings().after).toEqual({ version: 2 });
  });

  it("holds distinct Core snapshots when a host reuses the same mutable object for both sides", async () => {
    const shared = { checked: false };
    const witnesses = automationStudioAnswerFirstWitnesses({ read: async (side) => {
      shared.checked = side === "after";
      return shared;
    } });
    await witnesses.beforeFirstLastingAct();
    await witnesses.atEnd();
    expect(witnesses.readings().before).toEqual({ checked: false });
    expect(witnesses.readings().after).toEqual({ checked: true });
    shared.checked = false;
    expect(witnesses.readings().after).toEqual({ checked: true });
  });

  it("does not manufacture a before association for an unread or carried-missing side, or for a reused call id", async () => {
    for (const earlier of [undefined, {}]) {
      const witnesses = automationStudioAnswerFirstWitnesses({ read: async (side) => side === "before" ? undefined : { current: true }, ...(earlier === undefined ? {} : { earlier }) });
      const ref = { callId: "actual.call", actId: "actual.act" };
      await witnesses.beforeFirstLastingAct();
      witnesses.settled?.(ref);
      await witnesses.atEnd();
      expect(witnesses.readings().association).toEqual({ version: 1, before: [], after: [ref] });
      witnesses.settled?.({ ...ref, actId: "another.act" });
      await witnesses.atEnd();
      expect(witnesses.readings().association).toEqual({ version: 1, before: [], after: [] });
    }
  });

  it("cannot label a read taken while a new act settled as the current after", async () => {
    let release = (): void => undefined;
    let reading = (): void => undefined;
    const started = new Promise<void>((resolve) => { reading = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    let afters = 0;
    const witnesses = automationStudioAnswerFirstWitnesses({ read: async (side) => {
      if (side === "before") return { original: true };
      afters += 1;
      if (afters === 1) {
        reading();
        await held;
      }
      return { afters };
    } });
    await witnesses.beforeFirstLastingAct();
    witnesses.settled?.({ callId: "one", actId: "act.one" });
    const pending = witnesses.atEnd();
    await started;
    witnesses.settled?.({ callId: "two", actId: "act.two" });
    release();
    await pending;
    expect(afters).toBe(2);
    expect(witnesses.readings().association?.after).toEqual([{ callId: "one", actId: "act.one" }, { callId: "two", actId: "act.two" }]);
  });

  it("reads each side once however often it is asked, even at the same moment", async () => {
    const reads: string[] = [];
    const witnesses = automationStudioAnswerFirstWitnesses({
      read: async (side) => {
        reads.push(side);
        return { side };
      }
    });
    const [first, second] = await Promise.all([witnesses.beforeFirstLastingAct(), witnesses.beforeFirstLastingAct()]);
    await witnesses.beforeFirstLastingAct();
    await witnesses.atEnd();
    await witnesses.atEnd();
    expect(first).toEqual({ kind: "read", reading: { side: "before" } });
    expect(second).toBe(first);
    expect(reads).toEqual(["before", "after"]);
    expect(witnesses.readings()).toEqual({ before: { side: "before" }, after: { side: "after" } });
    expect(witnesses.notes()).toEqual([]);
  });

  it("notes a read that fails and one that gives nothing, throws nothing, and never reads them again", async () => {
    let calls = 0;
    const witnesses = automationStudioAnswerFirstWitnesses({
      read: async (side) => {
        calls += 1;
        if (side === "before") throw new RangeError("secret words");
        return undefined;
      }
    });
    const unreadBefore = { kind: "unread", note: { side: "before", code: "answer_first.witness_unread", errorName: "RangeError" } };
    await expect(witnesses.beforeFirstLastingAct()).resolves.toEqual(unreadBefore);
    await expect(witnesses.beforeFirstLastingAct()).resolves.toEqual(unreadBefore);
    await expect(witnesses.atEnd()).resolves.toMatchObject({ kind: "unread" });
    expect(calls).toBe(2);
    expect(witnesses.notes()).toEqual([{ side: "before", code: "answer_first.witness_unread", errorName: "RangeError" }, { side: "after", code: "answer_first.witness_unread" }]);
    expect(JSON.stringify(witnesses.notes())).not.toContain("secret");
    expect(witnesses.readings()).toEqual({});
  });
});
