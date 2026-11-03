import assert from "node:assert/strict";
import { test } from "vitest";
import { bindChatProjectNavigation } from "../binding.ts";
import { CHAT_PROJECT_NAVIGATION } from "../contracts.ts";

test("only exact bounded project navigation reaches the mounted opener, until unbound", () => {
  const view = new EventTarget(), opened: string[] = [];
  const unbind = bindChatProjectNavigation(view, id => opened.push(id));
  const dispatch = (detail: unknown) => view.dispatchEvent(new CustomEvent(CHAT_PROJECT_NAVIGATION.event, { detail }));
  for (const bad of [undefined, null, [], {}, "project-1", { projectId: "" }, { projectId: "  " }, { projectId: 1 }, { projectId: "project 1" }, { projectId: "project-1", instruction: "must not run" }, { projectId: "x".repeat(257) }]) dispatch(bad);
  assert.deepEqual(opened, []);
  dispatch({ projectId: "project-1" });
  assert.deepEqual(opened, ["project-1"]);
  unbind();
  dispatch({ projectId: "project-2" });
  assert.deepEqual(opened, ["project-1"]);
});
