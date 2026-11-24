import { describe, expect, it } from "vitest";
import { AutomationStudioAnswerFirstTaskMemoryStoreError, automationStudioAnswerFirstTaskMemoryIo } from "../index.ts";

describe("the task memory store boundary", () => {
  it("types a driver system or SQLite failure by its code and keeps it as the cause", async () => {
    for (const code of ["EBUSY", "EIO", "EACCES", "SQLITE_BUSY", "ERR_SQLITE_ERROR"]) {
      const driver = Object.assign(new Error("anything"), { code });
      const failure = await automationStudioAnswerFirstTaskMemoryIo(async () => { throw driver; }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AutomationStudioAnswerFirstTaskMemoryStoreError);
      expect((failure as Error).cause).toBe(driver);
    }
  });

  it("passes any other error through, whatever its message says", async () => {
    const bug = new TypeError("EBUSY disk locked");
    await expect(automationStudioAnswerFirstTaskMemoryIo(async () => { throw bug; })).rejects.toBe(bug);
    const coded = Object.assign(new Error("x"), { code: "program_state.invalid" });
    await expect(automationStudioAnswerFirstTaskMemoryIo(async () => { throw coded; })).rejects.toBe(coded);
  });
});
