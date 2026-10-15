// What the dispatcher carries of a subflow's standing nos from brief to brief
// (t634): only nos that upheld rows of a kind, only to a brief of the same
// subflow under the same plan, as copies, the latest kept.
import { describe, expect, it } from "vitest";
import { AutomationStudioProjectDispatchStandingNos } from "../standing-nos.ts";

const PLAN = "a".repeat(64);
const upheld = (label: string) => ({ stored: [label], storedWhole: true, conditions: [], upheldKind: [label], standing: [{ call: 1 }] });

describe("the standing nos a build carries across a subflow's briefs (t634)", () => {
  it("hands a later brief of the same subflow and plan the upheld ones, oldest first, and no other", () => {
    const kept = new AutomationStudioProjectDispatchStandingNos();
    const scope = { subflowKey: "list_seeds", planDigest: PLAN };
    kept.stood(scope, upheld("Tray"));
    // A no that upheld nothing, or no record, is not carried.
    kept.stood(scope, { ...upheld("Trowel"), upheldKind: [] });
    kept.stood(scope, "not a record");
    kept.stood(scope, upheld("Label"));
    expect(kept.earlier(scope)).toEqual([upheld("Tray"), upheld("Label")]);
    // Another subflow, or the same subflow under another plan, is handed none.
    expect(kept.earlier({ subflowKey: "open_packet", planDigest: PLAN })).toEqual([]);
    expect(kept.earlier({ subflowKey: "list_seeds", planDigest: "b".repeat(64) })).toEqual([]);
    // Copies: what a gate does with them never changes what the build keeps.
    (kept.earlier(scope)[0] as { stored: string[] }).stored.push("changed");
    expect(kept.earlier(scope)[0]).toEqual(upheld("Tray"));
  });

  it("keeps the latest twenty", () => {
    const kept = new AutomationStudioProjectDispatchStandingNos();
    const scope = { subflowKey: "list_seeds", planDigest: PLAN };
    for (let index = 0; index < 25; index += 1) kept.stood(scope, upheld(`Row ${index}`));
    const earlier = kept.earlier(scope) as Array<{ stored: string[] }>;
    expect(earlier).toHaveLength(20);
    expect(earlier[0]!.stored).toEqual(["Row 5"]);
  });
});
