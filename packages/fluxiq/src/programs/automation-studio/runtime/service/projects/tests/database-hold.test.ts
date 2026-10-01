// One service operation holds its project's database open for its own
// duration, and no longer: every lease taken inside it reuses the open
// database, and the pool closes it again when the operation ends.

import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../storage/index.ts";
import { withAutomationStudioProjectDatabaseHeld } from "../database-hold.ts";

const PROJECT = "project.held";
let rootDir = "";
let pool: AutomationStudioProjectDatabasePool;
const listed = { readProjectIndex: async () => ({ categories: [], projects: [{ id: PROJECT } as never] }) };

describe("an operation that holds its project database", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-database-hold-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("opens the database once for every lease inside it, and closes it when it ends", async () => {
    const databases = await withAutomationStudioProjectDatabaseHeld({ pool, projects: listed }, PROJECT, async () => {
      const seen = [];
      for (let index = 0; index < 3; index += 1) {
        const lease = await pool.acquire(PROJECT);
        seen.push(lease.database);
        await lease.release();
        expect(pool.stats().openProjects).toBe(1);
      }
      return seen;
    });
    expect(new Set(databases).size).toBe(1);
    expect(pool.stats().openProjects).toBe(0);
  });

  it("closes the database even when the operation fails", async () => {
    await expect(withAutomationStudioProjectDatabaseHeld({ pool, projects: listed }, PROJECT, async () => {
      expect(pool.stats().openProjects).toBe(1);
      throw new Error("the run failed");
    })).rejects.toThrow("the run failed");
    expect(pool.stats().openProjects).toBe(0);
  });

  it("creates nothing for a project the catalogue does not list, and runs the operation unheld", async () => {
    const unlisted = { readProjectIndex: async () => ({ categories: [], projects: [] }) };
    const result = await withAutomationStudioProjectDatabaseHeld({ pool, projects: unlisted }, "project.unknown", async () => pool.stats().openProjects);
    expect(result).toBe(0);
    expect(existsSync(path.join(rootDir, "projects", "project.unknown"))).toBe(false);
  });

  it("leaves a closing pool alone, so the operation's own acquire is refused where it always was", async () => {
    await pool.closeAll();
    const acquire = vi.spyOn(pool, "acquire");
    await expect(withAutomationStudioProjectDatabaseHeld({ pool, projects: listed }, PROJECT, async () => "ran")).resolves.toBe("ran");
    expect(acquire).not.toHaveBeenCalled();
  });

  it("holds nothing without a pool or a project", async () => {
    await expect(withAutomationStudioProjectDatabaseHeld({ pool: undefined, projects: listed }, PROJECT, async () => "ran")).resolves.toBe("ran");
    await expect(withAutomationStudioProjectDatabaseHeld({ pool, projects: listed }, null, async () => pool.stats().openProjects)).resolves.toBe(0);
  });
});
