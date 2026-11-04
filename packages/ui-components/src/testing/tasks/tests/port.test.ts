// The fake tasks port answers as a real adapter does: a failure is a failed result, not a
// throw; what a press changes shows in the next read; and its results port reads the same attempts.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeTasksMemory, createFakeTasksPort, fakeTasks } from "../../index.ts";

const NOW = new Date(2027, 0, 15, 15, 30).getTime();
const PROJECT = "project-1";

function port() {
  return createFakeTasksPort({ tasks: Object.values(fakeTasks(NOW)) });
}

test("the list is newest first, searchable and paged", async () => {
  const fake = port();
  const all = await fake.list({ projectId: PROJECT, limit: 100 });
  assert.equal(all.ok && all.value.tasks.length, 9);
  assert.equal(all.ok && all.value.tasks[0]!.title, "Collect the new job posts every morning");
  const page = await fake.list({ projectId: PROJECT, limit: 4 });
  assert.equal(page.ok && page.value.tasks.length, 4);
  const next = page.ok ? page.value.nextCursor : null;
  assert.notEqual(next, null);
  const rest = await fake.list({ projectId: PROJECT, limit: 100, cursor: next! });
  assert.equal(rest.ok && rest.value.tasks.length, 5);
  assert.equal(rest.ok && rest.value.nextCursor, null);
  const found = await fake.list({ projectId: PROJECT, limit: 100, text: "HEADLINES" });
  assert.equal(found.ok && found.value.tasks.length, 1);
});

test("a failure is a failed result once, and a missing task is a failed read", async () => {
  const fake = port();
  fake.failNext("read", { ok: false, sentence: "Not now." });
  assert.deepEqual(await fake.read({ projectId: PROJECT, taskId: "task-deals" }), { ok: false, sentence: "Not now." });
  assert.equal((await fake.read({ projectId: PROJECT, taskId: "task-deals" })).ok, true);
  assert.equal((await fake.read({ projectId: PROJECT, taskId: "task-missing" })).ok, false);
});

test("carrying on, adding budget and running again change what the next read says", async () => {
  const fake = port();
  assert.equal((await fake.carryOn!({ projectId: PROJECT, attemptId: "attempt-saved-searches-1" })).ok, true);
  const carried = await fake.read({ projectId: PROJECT, taskId: "task-saved-searches" });
  assert.equal(carried.ok && carried.value.attempts[0]!.attempt.status, "working");
  const added = await fake.results.addBudgetAndCarryOn!({ projectId: PROJECT, attemptId: "attempt-listings-1", addUsd: 5 });
  assert.equal(added.ok && added.value.budgetUsd, 10);
  const refused = await fake.results.addBudgetAndCarryOn!({ projectId: PROJECT, attemptId: "attempt-deals-2", addUsd: 5 });
  assert.equal(refused.ok, false);
  const again = await fake.results.runAgain({ projectId: PROJECT, taskId: "task-deals" });
  assert.equal(again.ok && again.value.attemptId, "task-deals-again-3");
  const read = await fake.read({ projectId: PROJECT, taskId: "task-deals" });
  assert.equal(read.ok && read.value.attempts.length, 3);
  assert.equal(read.ok && read.value.task.attemptCount, 3);
});

test("rename and remove change the list; a port made without a method does not have it", async () => {
  const fake = port();
  await fake.rename!({ projectId: PROJECT, taskId: "task-news", title: "Headlines" });
  const renamed = await fake.read({ projectId: PROJECT, taskId: "task-news" });
  assert.equal(renamed.ok && renamed.value.task.title, "Headlines");
  await fake.remove!({ projectId: PROJECT, taskId: "task-news" });
  assert.equal(fake.snapshot().some((task) => task.taskId === "task-news"), false);
  const bare = createFakeTasksPort({ tasks: [], without: ["readSteps", "carryOn", "rename", "remove"] });
  assert.equal(bare.readSteps, undefined);
  assert.equal(bare.carryOn, undefined);
});

test("the memory holds what it was last given", async () => {
  const memory = createFakeTasksMemory();
  assert.equal(await memory.read(), undefined);
  await memory.write({ projectId: PROJECT, taskId: "task-deals" });
  assert.deepEqual(await memory.read(), { projectId: PROJECT, taskId: "task-deals" });
  await memory.write(undefined);
  assert.equal(memory.open, undefined);
});
