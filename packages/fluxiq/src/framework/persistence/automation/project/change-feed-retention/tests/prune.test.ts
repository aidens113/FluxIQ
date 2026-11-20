// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectAdministration } from "../../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectHierarchyFeed } from "../../hierarchy/index.ts";
import { compareAutomationStudioHybridRead } from "../../migration-cutover.ts";
import { AutomationStudioProjectUnitOfWork } from "../../unit-of-work.ts";
import { automationStudioChangeFeedPosition, pruneAutomationStudioChangeFeed } from "../index.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
let rootDir = "";
let pool: AutomationStudioProjectDatabasePool;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "change-feed-retention-test-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
});

afterEach(async () => {
  await pool.closeAll();
  await rm(rootDir, { recursive: true, force: true });
});

/** A project whose feed holds one row per given age, oldest first. */
async function feedWithAges(projectId: string, agesInDays: number[]): Promise<AutomationStudioProjectAdministration> {
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId });
  for (const [index, age] of agesInDays.entries()) {
    await admin.changeFeed.append({ transactionId: `tx.${index}`, entityKind: "hierarchy_entry", entityId: `entry.${index}`, operation: "create", revision: 1, changedAt: NOW - age * DAY });
  }
  return admin;
}

async function withSql<T>(projectId: string, work: (sql: Parameters<typeof pruneAutomationStudioChangeFeed>[0]) => Promise<T>): Promise<T> {
  const lease = await pool.acquire(projectId);
  try {
    return await work(lease.database);
  } finally {
    await lease.release();
  }
}

describe("change feed retention", () => {
  it("deletes rows older than the window, keeps the newest rows, and records how far it pruned", async () => {
    const admin = await feedWithAges("project.prune", [30, 20, 10, 9, 1, 0]);
    try {
      const retention = { keepMs: 7 * DAY, keepRows: 3, pruneEveryMs: 60 * 60 * 1000 };
      // Rows 1-4 are older than seven days; the newest three (4-6) are kept regardless, so 1-3 go.
      const result = await withSql("project.prune", (sql) => pruneAutomationStudioChangeFeed(sql, { now: NOW, retention, force: true }));
      expect(result).toEqual({ kind: "pruned", deleted: 3, prunedThrough: 3 });
      expect((await admin.changeFeed.listAfter(0)).map((event) => event.sequence)).toEqual([4, 5, 6]);
      // Not due again within the hour; the watermark never moves back.
      expect(await withSql("project.prune", (sql) => pruneAutomationStudioChangeFeed(sql, { now: NOW + 1_000, retention }))).toEqual({ kind: "not_due", prunedThrough: 3 });
    } finally {
      await admin.close();
    }
  });

  it("tells a reader behind the watermark to reload and where to continue, and lets a current reader page on", async () => {
    const admin = await feedWithAges("project.position", [30, 20, 10, 0]);
    try {
      await withSql("project.position", (sql) => pruneAutomationStudioChangeFeed(sql, { now: NOW, retention: { keepMs: 7 * DAY, keepRows: 1, pruneEveryMs: 0 }, force: true }));
      expect(await admin.changeFeed.position(0)).toEqual({ resync: true, prunedThrough: 3, head: 4 });
      expect(await admin.changeFeed.position(2)).toMatchObject({ resync: true });
      expect(await admin.changeFeed.position(3)).toEqual({ resync: false, prunedThrough: 3, head: 4 });
      expect((await admin.changeFeed.listAfter(3)).map((event) => event.sequence)).toEqual([4]);
    } finally {
      await admin.close();
    }
  });

  it("gives the hierarchy feed's reader the same resync instead of a silent gap", async () => {
    const admin = await feedWithAges("project.hierarchy", [30, 20, 0]);
    await withSql("project.hierarchy", (sql) => pruneAutomationStudioChangeFeed(sql, { now: NOW, retention: { keepMs: 7 * DAY, keepRows: 1, pruneEveryMs: 0 }, force: true }));
    await admin.close();
    const feed = await AutomationStudioProjectHierarchyFeed.open({ pool, projectId: "project.hierarchy" });
    try {
      expect(await feed.listUpdatesAfter({ afterSequence: 1 })).toEqual({ updates: [], nextSequence: 3, hasMore: false, resync: true });
      expect(await feed.listUpdatesAfter({ afterSequence: 3 })).toMatchObject({ updates: [], nextSequence: 3, resync: false });
    } finally {
      await feed.close();
    }
  });

  it("runs from project writes: an append and a unit-of-work mutation both record the watermark", async () => {
    const admin = await feedWithAges("project.writes", [0]);
    try {
      expect(await withSql("project.writes", (sql) => sql.get("select pruned_through_sequence from change_feed_retention"))).toEqual({ pruned_through_sequence: 0 });
    } finally {
      await admin.close();
    }
    const unit = await AutomationStudioProjectUnitOfWork.open({ pool, projectId: "project.unit" });
    try {
      await unit.runIdempotent({ mutationId: "mutation.retention", operationKind: "noop", ownerKind: "project", ownerId: "project.unit", request: {} }, async (context) => {
        await context.recordChange({ entityKind: "flow", entityId: "flow.1", operation: "create", revision: 1 });
        return null;
      });
    } finally {
      await unit.close();
    }
    expect(await withSql("project.unit", (sql) => sql.get("select pruned_through_sequence from change_feed_retention"))).toEqual({ pruned_through_sequence: 0 });
  });

  it("is not mistaken for a write by the hybrid read check", async () => {
    const admin = await feedWithAges("project.hybrid", [30, 20, 0]);
    try {
      const comparison = await withSql("project.hybrid", (sql) => compareAutomationStudioHybridRead({
        ownerKind: "flow",
        ownerId: "flow.1",
        sql,
        legacyRead: async () => ({ value: 1 }),
        // Retention deletes rows during the read; no change was written, so the read stays read-only.
        v2Read: async () => {
          await pruneAutomationStudioChangeFeed(sql, { now: NOW, retention: { keepMs: 7 * DAY, keepRows: 1, pruneEveryMs: 0 }, force: true });
          return { value: 1 };
        }
      }));
      expect(comparison.readOnly).toBe(true);
      expect(await withSql("project.hybrid", (sql) => automationStudioChangeFeedPosition(sql, 0))).toMatchObject({ resync: true, head: 3 });
    } finally {
      await admin.close();
    }
  });
});
