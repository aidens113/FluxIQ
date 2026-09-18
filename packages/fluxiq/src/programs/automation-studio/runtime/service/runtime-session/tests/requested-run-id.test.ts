import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { automationStudioRequestedRunId } from "../requested-run-id.ts";

const ID = "3f0c8a52-6d1e-4b7a-9c2f-1a2b3c4d5e6f";
const nothingStored = { getRuntimeSession: async () => null };

describe("automationStudioRequestedRunId", () => {
  it("returns nothing when the caller named no run, so Core names it as before", async () => {
    await expect(automationStudioRequestedRunId(nothingStored, { projectId: "project.a" })).resolves.toBeUndefined();
  });

  it("accepts a fresh UUID in a project that holds no run under it", async () => {
    await expect(automationStudioRequestedRunId(nothingStored, { projectId: "project.a", newRunId: ID })).resolves.toBe(ID);
  });

  it("refuses an id the project already holds, and says so before anything is written", async () => {
    const refused = vi.fn();
    const stored = { getRuntimeSession: async () => ({ runId: ID } as AutomationStudioRuntimeSession), refused };
    await expect(automationStudioRequestedRunId(stored, { projectId: "project.a", newRunId: ID })).rejects.toThrow(/already exists/u);
    expect(refused).toHaveBeenCalledOnce();
  });

  it("refuses a new id beside an existing session, outside a project, or in any form but a UUID", async () => {
    for (const [input, message] of [
      [{ projectId: "project.a", runId: ID, newRunId: ID }, /not both/u],
      [{ projectId: null, newRunId: ID }, /needs a project/u],
      [{ projectId: "project.a", newRunId: "run-1" }, /lowercase UUID/u],
      [{ projectId: "project.a", newRunId: ID.toUpperCase() }, /lowercase UUID/u],
      [{ projectId: "project.a", newRunId: 7 }, /lowercase UUID/u],
    ] as const) {
      const refused = vi.fn();
      await expect(automationStudioRequestedRunId({ ...nothingStored, refused }, input)).rejects.toThrow(message);
      expect(refused).toHaveBeenCalledOnce();
    }
  });
});
