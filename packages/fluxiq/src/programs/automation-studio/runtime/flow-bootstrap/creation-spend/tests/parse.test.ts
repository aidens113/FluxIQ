// A Flow creation's spend is read back only when it is whole and written for
// this Flow: a damaged record is refused, and the build carries nothing.
import { describe, expect, it } from "vitest";
import { parseAutomationStudioFlowBootstrapCreationSpend, type AutomationStudioFlowBootstrapCreationSpend } from "../index.ts";

const OWNER = { projectId: "p1", flowId: "f1" };
const RECORD: AutomationStudioFlowBootstrapCreationSpend = { kind: "flow_creation_spend", ...OWNER, spentUsd: 0.0731, builds: 2, createdAt: 1_000, updatedAt: 2_000 };
/** What a record kept before the largest input and role tallies reads back as. */
const READ = { ...RECORD, largestInputTokens: null, byRole: null };

describe("a Flow creation's spend read back", () => {
  it("reads a whole record written for this Flow, with no largest input or role tallies", () => {
    expect(parseAutomationStudioFlowBootstrapCreationSpend(structuredClone(RECORD), OWNER)).toEqual(READ);
  });

  it("drops fields it does not know", () => {
    expect(parseAutomationStudioFlowBootstrapCreationSpend({ ...RECORD, extra: true }, OWNER)).toEqual(READ);
  });

  it.each([
    ["another Flow's", { ...RECORD, flowId: "f2" }],
    ["another project's", { ...RECORD, projectId: "p2" }],
    ["another kind", { ...RECORD, kind: "flow_bootstrap_incomplete_draft" }],
    ["a negative spend", { ...RECORD, spentUsd: -0.01 }],
    ["a spend that is not a number", { ...RECORD, spentUsd: "0.05" }],
    ["an infinite spend", { ...RECORD, spentUsd: Number.POSITIVE_INFINITY }],
    ["no builds", { ...RECORD, builds: 0 }],
    ["a fractional build count", { ...RECORD, builds: 1.5 }],
    ["a missing time", { ...RECORD, updatedAt: undefined }],
    ["an array", [RECORD]],
    ["nothing", null]
  ])("refuses %s record", (_label, value) => {
    expect(parseAutomationStudioFlowBootstrapCreationSpend(value, OWNER)).toBeNull();
  });

  // Itemised by a Lab-scoped Flow purse (t728): `calls` and `byPhase` together, every phase present.
  const ITEM = { calls: 1, usd: 0.01 };
  const ITEMISED: AutomationStudioFlowBootstrapCreationSpend = {
    ...RECORD,
    calls: 6,
    byPhase: { build: ITEM, read: ITEM, judge: ITEM, runtime: ITEM, reauthor: ITEM, chat: ITEM }
  };

  it("reads an itemised record, older ones with no largest input or role tallies", () => {
    expect(parseAutomationStudioFlowBootstrapCreationSpend(structuredClone(ITEMISED), OWNER)).toEqual({ ...ITEMISED, largestInputTokens: null, byRole: null });
    const tallied = { ...ITEMISED, largestInputTokens: 21_000, byRole: { supervisor: { calls: 1, usd: 0.002 }, builder: { calls: 3, usd: 0.005 } } };
    expect(parseAutomationStudioFlowBootstrapCreationSpend(structuredClone(tallied), OWNER)).toEqual(tallied);
    const none = { ...ITEMISED, largestInputTokens: null, byRole: {} };
    expect(parseAutomationStudioFlowBootstrapCreationSpend(structuredClone(none), OWNER)).toEqual(none);
  });

  it.each([
    ["calls without phases", { ...RECORD, calls: 6 }],
    ["phases without calls", { ...ITEMISED, calls: undefined }],
    ["a missing phase", { ...ITEMISED, byPhase: { ...ITEMISED.byPhase, chat: undefined } }],
    ["a fractional call count", { ...ITEMISED, byPhase: { ...ITEMISED.byPhase, judge: { calls: 0.5, usd: 0 } } }],
    ["a negative phase spend", { ...ITEMISED, byPhase: { ...ITEMISED.byPhase, read: { calls: 0, usd: -1 } } }],
    ["a negative total call count", { ...ITEMISED, calls: -1 }],
    ["a fractional largest input", { ...ITEMISED, largestInputTokens: 10.5 }],
    ["a negative largest input", { ...ITEMISED, largestInputTokens: -1 }],
    ["a role tally that is not an object", { ...ITEMISED, byRole: [] }],
    ["a role name that is free text", { ...ITEMISED, byRole: { "Builder 1": ITEM } }],
    ["a malformed role item", { ...ITEMISED, byRole: { builder: { calls: 1 } } }],
    ["a largest input on an unitemised record", { ...RECORD, largestInputTokens: 100 }],
    ["role tallies on an unitemised record", { ...RECORD, byRole: {} }]
  ])("refuses an itemised record with %s", (_label, value) => {
    expect(parseAutomationStudioFlowBootstrapCreationSpend(value, OWNER)).toBeNull();
  });
});
