import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectRuntimeStreamStore } from "../../../../storage/index.ts";
import { withConfiguredRuntimeStreamStore } from "../index.ts";

let tempRoot: string;
let pool: AutomationStudioProjectDatabasePool;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-configured-stream-store-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir: tempRoot });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await pool.closeAll();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("the configured typed runtime store", () => {
  it.each([
    { case: "no database pool", access: () => ({ pool: undefined, root: tempRoot }) },
    { case: "no storage root", access: () => ({ pool, root: undefined }) }
  ])("answers null, and runs nothing, with $case", async ({ access }) => {
    const operation = vi.fn(async () => "ran");

    await expect(withConfiguredRuntimeStreamStore(access(), "project.none", operation)).resolves.toBeNull();
    expect(operation).not.toHaveBeenCalled();
  });

  it("hands the operation's own answer back, null included, and closes the store", async () => {
    const close = vi.spyOn(AutomationStudioProjectRuntimeStreamStore.prototype, "close");

    await expect(withConfiguredRuntimeStreamStore({ pool, root: tempRoot }, "project.reads", async (store) => await store.getRunDetail("run.absent"))).resolves.toBeNull();
    await expect(withConfiguredRuntimeStreamStore({ pool, root: tempRoot }, "project.reads", async () => "answered")).resolves.toBe("answered");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("fails when the store cannot be opened, rather than answering null", async () => {
    vi.spyOn(AutomationStudioProjectRuntimeStreamStore, "open").mockRejectedValueOnce(new Error("database is locked"));
    const operation = vi.fn(async () => "ran");

    await expect(withConfiguredRuntimeStreamStore({ pool, root: tempRoot }, "project.reads", operation)).rejects.toThrow("database is locked");
    expect(operation).not.toHaveBeenCalled();
  });

  it("fails, and still closes the store, when the operation fails", async () => {
    const close = vi.spyOn(AutomationStudioProjectRuntimeStreamStore.prototype, "close");

    await expect(withConfiguredRuntimeStreamStore({ pool, root: tempRoot }, "project.reads", async () => { throw new Error("disk I/O error"); })).rejects.toThrow("disk I/O error");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
