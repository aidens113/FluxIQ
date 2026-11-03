import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import type { ChatRecordingsPort } from "../../ports/index.ts";
import { recordingsOver } from "../../tests/message-transport.ts";
import { ATTACH_LABEL, createRecordingAttachment, NO_RECORDINGS, REMOVE_LABEL } from "../recording-attachment.ts";

const summary = (id: string, description: string, startedAt: number) => ({ id, title: id, description, status: "completed", projectId: "p1", startedAt, endedAt: startedAt + 1 });
const asked = (items: unknown[]): ChatRecordingsPort => recordingsOver(async () => ({ ok: true, value: { recordings: { items } } }));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the list is headed, one button per recording named by its description, and picking shows the chip", async () => {
  await withFakeDocument(async () => {
    const attachment = createRecordingAttachment(asked([summary("a", "Add a coffee to the cart", 1), summary("b", "Filter jobs by city", 2)]), () => "p1");
    const button = fake(attachment.button);
    assert.equal(button.getAttribute("aria-label"), ATTACH_LABEL);
    assert.equal(fake(attachment.chip).hidden, true);
    button.dispatch("click");
    await flush();
    const menu = fake(attachment.menu);
    assert.equal(menu.hidden, false);
    assert.equal(menu.descendants().find((node) => node.tagName === "H3")?.textContent, ATTACH_LABEL);
    const items = menu.querySelectorAll("button");
    assert.deepEqual(items.map((node) => node.textContent), ["Filter jobs by city", "Add a coffee to the cart"]);
    items[0]!.dispatch("click");
    assert.equal(menu.hidden, true);
    assert.equal(fake(attachment.chip).hidden, false);
    assert.equal(fake(attachment.chip).textContent.startsWith("Recording: Filter jobs by city"), true);
    assert.deepEqual(attachment.current(), { id: "b", label: "Filter jobs by city" });
    const remove = fake(attachment.chip).querySelectorAll("button")[0]!;
    assert.equal(remove.getAttribute("aria-label"), REMOVE_LABEL);
    remove.dispatch("click");
    assert.equal(attachment.current(), undefined);
    assert.equal(fake(attachment.chip).hidden, true);
  });
});

test("with no finished recording the list says how to make one", async () => {
  await withFakeDocument(async () => {
    const attachment = createRecordingAttachment(asked([summary("x", "", 1)]), () => "p1");
    fake(attachment.button).dispatch("click");
    await flush();
    const menu = fake(attachment.menu);
    assert.equal(menu.querySelectorAll("button").length, 0);
    assert.equal(menu.textContent.includes(NO_RECORDINGS), true);
  });
});

test("attachLatest attaches the newest one, and says no when there is none", async () => {
  await withFakeDocument(async () => {
    const some = createRecordingAttachment(asked([summary("a", "old", 1), summary("b", "new", 2)]), () => "p1");
    assert.equal(await some.attachLatest(), true);
    assert.equal(some.current()?.label, "new");
    const none = createRecordingAttachment(asked([]), () => "p1");
    assert.equal(await none.attachLatest(), false);
    assert.equal(none.current(), undefined);
  });
});

test("an attachment does not follow the chat into another project", async () => {
  await withFakeDocument(async () => {
    let project = "p1";
    const attachment = createRecordingAttachment(asked([summary("a", "mine", 1)]), () => project);
    await attachment.attachLatest();
    project = "p2";
    assert.equal(attachment.current(), undefined);
    attachment.refresh();
    assert.equal(fake(attachment.chip).hidden, true);
  });
});
