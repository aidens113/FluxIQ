import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstWitnesses } from "../index.ts";

describe("automationStudioAnswerFirstWitnesses", () => {
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
