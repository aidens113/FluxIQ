import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import type { AutomationStudioSiteResetOriginal } from "../../reset-settlement/index.ts";
import type { AutomationStudioSiteResetSpot } from "../../site-reset/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNDO_PATHS as PATHS } from "../paths.ts";

// t750: the act's side of each undo admission path, the one source the
// admission (`../admission.ts`) and the reach (`../reach.ts`) both
// read. What each caller then does with a gate is covered beside it
// (`./admission.test.ts`, `../../site-reset/tests/settlement-unmeetable.test.ts`). Made-up
// fixtures: a gallery's albums, opaque tokens only.

type Act = Parameters<typeof PATHS.ownItem>[0];
const act = (extra: Partial<Act> = {}): Act => ({ strictReset: true, consequences: [], createdItems: [], destinations: [], ...extra });
const spot = (fields: AutomationStudioSiteResetSpot): AutomationStudioSiteResetSpot => fields;
const original = (beforeAct: number): AutomationStudioSiteResetOriginal => ({ beforeAct, subjects: new Set(["s:sunset"]), group: "g:albums", states: new Map([["s:sunset", "v:sunset"]]) });

describe("the paths a read cannot rule out", () => {
  it("follow_up: only after an undo of it landed on its own or a created item", () => {
    expect(PATHS.followUp(act())).toBe(false);
    expect(PATHS.followUp(act({ chain: "own" }))).toBe(true);
    expect(PATHS.followUp(act({ chain: "created" }))).toBe(true);
  });

  it("a transfer: only a witnessed one", () => {
    expect(PATHS.transfer(act())).toBe(false);
    expect(PATHS.transfer(act({ transfer: { origin: "p:drafts", scope: "p:album", group: "g:albums", subject: "s:sunset", state: "v:posted" } }))).toBe(true);
  });

  it("created: a legacy act's items by their token; none for a strict act", () => {
    expect(PATHS.createdItems(act({ strictReset: false, createdItems: ["i:photo"] }))).toEqual(["i:photo"]);
    expect(PATHS.createdItems(act({ strictReset: true, createdItems: ["i:photo"] }))).toEqual([]);
  });

  it("own: an item the act sat in, never one it created", () => {
    expect(PATHS.ownItem(act({ spot: spot({ item: "i:photo" }) }))).toBe(true);
    expect(PATHS.ownItem(act({ spot: spot({ item: "i:photo" }), createdItems: ["i:photo"] }))).toBe(false);
    expect(PATHS.ownItem(act({ spot: spot({ subject: "s:photo" }) }))).toBe(false);
  });
});

describe("the removals of a subject new on a list", () => {
  it("need the list's original read before the act", () => {
    expect(PATHS.readBefore(undefined, 1)).toBe(false);
    expect(PATHS.readBefore(original(0), 1)).toBe(true);
    expect(PATHS.readBefore(original(1), 1)).toBe(false);
    expect(PATHS.readBefore(original(1), 2)).toBe(true);
  });

  it("the subject deletion: an act that created", () => {
    const declaring = (consequences: AutomationStudioActionConsequence[]) => PATHS.deletesCreated(act({ consequences }));
    expect(declaring(["create_new"])).toBe(true);
    expect(declaring(["modify_existing"])).toBe(false);
    expect(declaring(["delete"])).toBe(false);
  });

  it("the removal on a destination: a strict act that created or changed something", () => {
    const declaring = (consequences: AutomationStudioActionConsequence[], strictReset = true) => PATHS.removesOnDestination(act({ consequences, strictReset }));
    expect(declaring(["create_new"])).toBe(true);
    expect(declaring(["modify_existing"])).toBe(true);
    expect(declaring(["delete"])).toBe(false);
    expect(declaring([])).toBe(false);
    expect(declaring(["create_new"], false)).toBe(false);
  });

  it("the removal on a destination: on a list the act named, or one lent to it", () => {
    const named = act({ destinations: [{ scope: "p:album" }] });
    expect(PATHS.named(named, undefined, "p:album")).toBe(true);
    expect(PATHS.named(named, undefined, "p:drafts")).toBe(false);
    expect(PATHS.named(named, [{ scope: "p:drafts" }], "p:drafts")).toBe(true);
    expect(PATHS.named(act(), [], "p:album")).toBe(false);
  });
});
