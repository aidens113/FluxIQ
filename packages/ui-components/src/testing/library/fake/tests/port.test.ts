import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeSubflowLibraryPort } from "../index.ts";

test("lists in pages by cursor, searches by words, and reads what a subflow calls and who calls it", async () => {
  const port = createFakeSubflowLibraryPort({ pageSize: 3, now: 0 });
  const first = await port.list({ projectId: "p" });
  assert.ok(first.ok && !first.value.refused && first.value.parts.length === 3 && first.value.hasMore && first.value.nextCursor === "3");
  const second = await port.list({ projectId: "p", cursor: "3" });
  assert.ok(second.ok && !second.value.refused && second.value.parts.length === 1 && !second.value.hasMore);
  const found = await port.list({ projectId: "p", text: "borrowed" });
  assert.ok(found.ok && !found.value.refused && found.value.parts.map((card) => card.partId).join() === "list-loans");
  const read = await port.read({ projectId: "p", partId: "add-to-basket" });
  assert.ok(read.ok && !read.value.refused);
  if (read.ok && !read.value.refused) {
    assert.deepEqual(read.value.detail.calls.map((call) => call.partId), ["choose-colour"]);
    assert.deepEqual(read.value.detail.callers, [{ kind: "part", partId: "restock-notebooks" }]);
  }
});

test("refuses a run as Core does, and answers a refusal or failure when asked, once", async () => {
  const port = createFakeSubflowLibraryPort({ now: 0 });
  const run = (permitted: string[], inputs: Record<string, string> = { quantity: "1" }) => port.run({ projectId: "p", partId: "restock-notebooks", inputs, permitted });
  assert.deepEqual((await run([], {})).ok && (await run([], {})), { ok: true, value: { refused: true, code: "part.input_missing", message: "Missing." } });
  const refused = await run([]);
  assert.ok(refused.ok && refused.value.refused && refused.value.code === "part.act_not_allowed" && refused.value.classes?.join() === "move_money,create_new");
  port.refuseNext("run", { code: "part.wrong_site" });
  const wrong = await run(["move_money", "create_new"]);
  assert.ok(wrong.ok && wrong.value.refused && wrong.value.code === "part.wrong_site");
  const done = await run(["move_money", "create_new"]);
  assert.ok(done.ok && !done.value.refused && done.value.status === "succeeded");
  port.failNext("list", { ok: false, sentence: "Down." });
  assert.equal((await port.list({ projectId: "p" })).ok, false);
  assert.equal((await port.list({ projectId: "p" })).ok, true);
});
