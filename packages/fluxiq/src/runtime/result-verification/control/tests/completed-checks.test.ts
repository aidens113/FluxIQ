import { describe, expect, it } from "vitest";
import { CompletedVerificationChecks } from "../index.ts";

describe("completed verification receipts", () => {
  it("retains original receipts in completion order and excludes a late answer", async () => {
    const checks = new CompletedVerificationChecks<object>();
    const first = Object.freeze({ callId: "first", details: { original: true } });
    const second = Object.freeze({ callId: "second" });
    let complete!: (value: object) => void;
    const pending = new Promise<object>(resolve => { complete = resolve; });
    const late = pending.then(checks.record);
    checks.record(first);
    checks.record(second);
    const finished = checks.finish();
    expect(finished).toEqual([first, second]);
    expect(finished[0]).toBe(first);
    expect(finished[1]).toBe(second);
    complete(Object.freeze({ callId: "late" }));
    await late;
    finished.pop();
    const again = checks.finish();
    expect(again).toEqual([first, second]);
    expect(again).not.toBe(finished);
  });
});
