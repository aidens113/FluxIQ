// The Background Tasks inputs accept what their handlers read and refuse a wrong one plainly.
import { describe, expect, it } from "vitest";
import { backgroundTaskDetailInput, backgroundTasksSnapshotInput } from "../index.ts";

describe("background task inputs", () => {
  it("snapshot takes nothing", () => {
    expect(backgroundTasksSnapshotInput.parse(undefined)).toEqual({});
  });

  it("detail needs a task and accepts paging and a status", () => {
    expect(backgroundTaskDetailInput.parse({ taskId: "task-one" })).toEqual({ taskId: "task-one" });
    expect(backgroundTaskDetailInput.parse({ taskId: "t", limit: 10, offset: 0, status: "failed" })).toMatchObject({ limit: 10, status: "failed" });
    expect(backgroundTaskDetailInput.read({})).toEqual({ ok: false, error: expect.stringContaining("taskId:") });
    expect(backgroundTaskDetailInput.read({ taskId: "t", limit: 500 }).ok).toBe(false);
    expect(backgroundTaskDetailInput.read({ taskId: "t", status: "bogus" }).ok).toBe(false);
  });

  it("describes every detail field", () => {
    for (const field of Object.values(backgroundTaskDetailInput.jsonSchema().properties as Record<string, { description?: string }>)) expect(field.description).toBeTruthy();
  });
});
