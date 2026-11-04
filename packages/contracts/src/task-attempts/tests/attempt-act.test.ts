import { describe, expect, it } from "vitest";
// The runtime's own list, read here only to hold the two apart from drifting. A test
// may reach it; the contract itself cannot (`packages/contracts` must not import the runtime).
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../../fluxiq/src/components/automation/action-effect/consequences/index.ts";
import { AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES, AUTOMATION_STUDIO_ATTEMPT_ACT_STATES, parseAutomationStudioAttemptAct, type AutomationStudioAttemptAct } from "../index.ts";

const VALID: AutomationStudioAttemptAct = {
  id: "act-1",
  what: "Added 1 of the blue kettle to the cart",
  where: "shop.example, product page",
  classes: ["modify_existing"],
  state: "landed",
  rowIdentity: "a1b2c3d4e5f60718",
  undo: { how: "Remove it from the cart" }
};

function issuesOf(value: unknown): string[] {
  const result = parseAutomationStudioAttemptAct(value);
  return result.ok ? [] : result.issues;
}

describe("parseAutomationStudioAttemptAct", () => {
  it("returns a fresh act", () => {
    const parsed = parseAutomationStudioAttemptAct(VALID);
    expect(parsed).toEqual({ ok: true, act: VALID });
    if (!parsed.ok) throw new Error("expected a valid act");
    expect(parsed.act).not.toBe(VALID);
    expect(parsed.act.classes).not.toBe(VALID.classes);
    expect(parsed.act.undo).not.toBe(VALID.undo);
  });

  it("uses Core's consequence classes, in Core's order", () => {
    expect([...AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES]).toEqual([...AUTOMATION_STUDIO_ACTION_CONSEQUENCES]);
  });

  it("reads classes into Core's order, each once", () => {
    const parsed = parseAutomationStudioAttemptAct({ ...VALID, classes: ["create_new", "move_money", "create_new"] });
    expect(parsed.ok && parsed.act.classes).toEqual(["move_money", "create_new"]);
  });

  it("keeps an act no class was declared for: that it happened is still true", () => {
    const parsed = parseAutomationStudioAttemptAct({ ...VALID, classes: [] });
    expect(parsed.ok && parsed.act.classes).toEqual([]);
  });

  it("takes every state and refuses any other", () => {
    for (const state of AUTOMATION_STUDIO_ATTEMPT_ACT_STATES) expect(issuesOf({ ...VALID, state })).toEqual([]);
    for (const state of ["failed", "done", "", null, undefined]) expect(issuesOf({ ...VALID, state })).toContain("attempt_act.invalid_state");
  });

  it("refuses an unknown class", () => {
    expect(issuesOf({ ...VALID, classes: ["spend"] })).toContain("attempt_act.invalid_classes");
    expect(issuesOf({ ...VALID, classes: "delete" })).toContain("attempt_act.invalid_classes");
  });

  it("holds nothing it does not name: no address into a page, page text or token", () => {
    for (const key of ["selector", "xpath", "pageText", "token", "authorization", "control"]) {
      expect(issuesOf({ ...VALID, [key]: "x" }), key).toContain("attempt_act.unknown_key");
    }
    expect(issuesOf({ ...VALID, undo: { how: "Remove it", selector: "#x" } })).toContain("attempt_act.invalid_undo");
  });

  it("refuses an address or a token in its words", () => {
    expect(issuesOf({ ...VALID, what: "#add-to-cart" })).toContain("attempt_act.invalid_what");
    expect(issuesOf({ ...VALID, where: "https://shop.example/cart?session=1" })).toContain("attempt_act.invalid_where");
    expect(issuesOf({ ...VALID, undo: { how: "Bearer abc" } })).toContain("attempt_act.invalid_undo");
  });

  it("takes a row identity only as a digest, so a row's values cannot travel in it", () => {
    expect(issuesOf({ ...VALID, rowIdentity: "Blue kettle, $20" })).toContain("attempt_act.invalid_row_identity");
    expect(issuesOf({ ...VALID, rowIdentity: "sha256:a1b2c3d4e5f60718" })).toEqual([]);
  });

  it("refuses what is not a record, and never throws", () => {
    for (const value of [null, 1, "act", [], new Date()]) expect(issuesOf(value)).toEqual(["attempt_act.not_object"]);
    const hostile = { ...VALID, get what(): string { throw new Error("no"); } };
    expect(issuesOf(hostile)).toEqual(["attempt_act.invalid"]);
  });

  it("omits what is absent", () => {
    const { rowIdentity: _rowIdentity, undo: _undo, ...bare } = VALID;
    const parsed = parseAutomationStudioAttemptAct(bare);
    expect(parsed).toEqual({ ok: true, act: bare });
    expect(parsed.ok && Object.keys(parsed.act)).toEqual(["id", "what", "where", "classes", "state"]);
  });
});
