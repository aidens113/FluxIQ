// The icons the chat's own chrome draws (window, welcome, attachment, warning):
// lucide's, found by name beside the ones Core pins for action cards.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../testing/index.ts";
import { lucideIcon } from "../lucide-icon.ts";
import { LUCIDE_CHROME_ICON_NODES } from "../chrome-nodes.ts";
import { LUCIDE_ICON_NODES } from "../lucide-nodes.ts";

test("the chrome icons draw as lucide icons and an unknown name is still the generic action", async () => {
  await withFakeDocument(() => {
    for (const name of Object.keys(LUCIDE_CHROME_ICON_NODES)) {
      const svg = fake(lucideIcon(name));
      assert.equal(svg.getAttribute("data-icon"), name);
      assert.equal(svg.children.length, LUCIDE_CHROME_ICON_NODES[name]!.length);
    }
    assert.deepEqual(Object.keys(LUCIDE_CHROME_ICON_NODES).sort(), ["chevron-down", "key-round", "maximize-2", "messages-square", "minimize-2", "minus", "paperclip", "pen-line", "plus", "split", "triangle-alert"]);
    assert.equal(fake(lucideIcon("not-an-icon")).getAttribute("data-icon"), "circle-dot");
  });
});

test("no chrome icon repeats one Core pins, so each name has one drawing", () => {
  assert.deepEqual(Object.keys(LUCIDE_CHROME_ICON_NODES).filter((name) => Object.hasOwn(LUCIDE_ICON_NODES, name)), []);
});
