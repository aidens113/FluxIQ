import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatRecordingSummary } from "../../ports/index.ts";
import { attachableRecordings } from "../attachable-recordings.ts";

const rec = (id: string, over: Partial<ChatRecordingSummary> = {}): ChatRecordingSummary => ({
  id, description: `shows ${id}`, status: "completed", projectId: "p1", startedAt: Number(id.replace(/\D/g, "")) || 1, endedAt: 99, ...over
});

test("only this project's finished, described recordings are offered, newest first", () => {
  const items = [
    rec("r1"), rec("r3"), rec("r2"),
    rec("r4", { projectId: "p2" }),
    rec("r5", { status: "recording", endedAt: undefined }),
    rec("r6", { description: undefined }),
    rec("r7", { description: "   " })
  ];
  assert.deepEqual(attachableRecordings(items, "p1").map((item) => item.id), ["r3", "r2", "r1"]);
  assert.equal(attachableRecordings(items, "p1")[0]?.label, "shows r3");
});

test("at most ten are offered", () => {
  const items = Array.from({ length: 14 }, (_, index) => rec(`r${index + 1}`));
  const offered = attachableRecordings(items, "p1");
  assert.equal(offered.length, 10);
  assert.equal(offered[0]?.id, "r14");
});

test("nothing finished gives an empty list", () => {
  assert.deepEqual(attachableRecordings([], "p1"), []);
});
