import { describe, expect, it } from "vitest";
import { ACTIVITY_ACTION_ICONS, type ActivityActionKind } from "../index.ts";

const KINDS: readonly ActivityActionKind[] = ["click", "type", "navigate", "read", "look", "wait", "person_check", "permission", "draft", "test", "repair", "join", "branch", "repeat", "other"];

describe("ACTIVITY_ACTION_ICONS", () => {
  it("gives every kind a lucide icon name, and nothing else", () => {
    expect(Object.keys(ACTIVITY_ACTION_ICONS).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) expect(ACTIVITY_ACTION_ICONS[kind]).toMatch(/^[a-z]+(-[a-z]+)*$/u);
  });

  it("holds the pinned names", () => {
    expect(ACTIVITY_ACTION_ICONS).toEqual({
      click: "mouse-pointer-click", type: "keyboard", navigate: "globe", read: "table", look: "scan-search", wait: "hourglass",
      person_check: "shield-check", permission: "hand", draft: "pencil", test: "flask-conical", repair: "wrench", join: "git-merge", branch: "git-branch", repeat: "repeat", other: "circle-dot"
    });
  });

  it("cannot be changed by a client", () => {
    expect(Object.isFrozen(ACTIVITY_ACTION_ICONS)).toBe(true);
  });
});
