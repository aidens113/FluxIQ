// Every icon Core pins for an action card is drawn, the way lucide draws it:
// stroked in the current colour on a 24 grid, hidden from assistive
// technology; a name the panel does not know draws the generic action.

import assert from "node:assert/strict";
import { test } from "vitest";
import { ACTIVITY_ACTION_ICONS } from "fluxiq/ui";
import { fake, withFakeDocument } from "../../testing/index.ts";
import { lucideIcon } from "../lucide-icon.ts";
import { LUCIDE_ICON_NODES } from "../lucide-nodes.ts";

test("the panel holds exactly the icons Core pins for action cards", () => {
  assert.deepEqual(Object.keys(LUCIDE_ICON_NODES).sort(), [...new Set(Object.values(ACTIVITY_ACTION_ICONS))].sort());
});

test("each pinned icon draws as a lucide SVG in the current colour, hidden from assistive technology", async () => {
  await withFakeDocument(() => {
    for (const name of Object.values(ACTIVITY_ACTION_ICONS)) {
      const svg = fake(lucideIcon(name));
      assert.equal(svg.tagName, "SVG");
      assert.equal(svg.getAttribute("data-icon"), name);
      for (const [attr, value] of [["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"], ["focusable", "false"]]) {
        assert.equal(svg.getAttribute(attr!), value, `${name} ${attr}`);
      }
      assert.equal(svg.children.length, LUCIDE_ICON_NODES[name]!.length, name);
      assert.ok(svg.children.every((node) => ["PATH", "CIRCLE", "RECT"].includes(node.tagName)), name);
    }
  });
});

test("an unknown name, or one inherited from Object, draws the generic action", async () => {
  await withFakeDocument(() => {
    assert.equal(fake(lucideIcon("rocket")).getAttribute("data-icon"), "circle-dot");
    assert.equal(fake(lucideIcon("constructor")).getAttribute("data-icon"), "circle-dot");
    assert.equal(fake(lucideIcon("globe", 20)).getAttribute("width"), "20");
  });
});
