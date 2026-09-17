import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT,
  AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_METADATA_KEY,
  AUTOMATION_STUDIO_NODE_VERIFIES_STATE_METADATA_KEY,
  automationStudioDefinitionVerifiesState,
  automationStudioNodeAdaptationIds,
  isAutomationStudioAdaptationId,
  withAutomationStudioNodeAdaptationId
} from "../index.ts";

describe("node metadata key names", () => {
  it("are the neutral names the executor, the store and the domain share", () => {
    expect(AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_METADATA_KEY).toBe("adaptationIds");
    expect(AUTOMATION_STUDIO_NODE_VERIFIES_STATE_METADATA_KEY).toBe("verifiesState");
    expect(AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT).toBe(8);
  });
});

describe("adaptation ids", () => {
  it("accepts a minted id and refuses anything else", () => {
    expect(isAutomationStudioAdaptationId("adaptation.bootstrap.0f3c")).toBe(true);
    expect(isAutomationStudioAdaptationId("a".repeat(256))).toBe(true);
    for (const value of ["", " adaptation.1", "adaptation.1 ", "adaptation\n1", "adaptation1", "a".repeat(257), 7, null, undefined, ["adaptation.1"]]) {
      expect(isAutomationStudioAdaptationId(value)).toBe(false);
    }
  });
});

describe("reading a node's adaptation ids", () => {
  it("returns the listed ids in order without duplicates", () => {
    expect(automationStudioNodeAdaptationIds({ adaptationIds: ["adaptation.b", "adaptation.a", "adaptation.b"] })).toEqual(["adaptation.b", "adaptation.a"]);
  });

  it("returns a fresh array", () => {
    const listed = ["adaptation.a"];
    const read = automationStudioNodeAdaptationIds({ adaptationIds: listed });
    read?.push("adaptation.b");
    expect(listed).toEqual(["adaptation.a"]);
  });

  it("ignores an absent, empty, oversized or malformed list whole", () => {
    const tooMany = Array.from({ length: AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT + 1 }, (_, index) => `adaptation.${index}`);
    for (const metadata of [undefined, {}, { adaptationIds: [] }, { adaptationIds: "adaptation.a" }, { adaptationIds: tooMany }, { adaptationIds: ["adaptation.a", ""] }, { adaptationIds: ["adaptation.a", 3] }] as Array<JsonObject | undefined>) {
      expect(automationStudioNodeAdaptationIds(metadata)).toBeUndefined();
    }
  });
});

describe("stamping a node with an adaptation id", () => {
  it("appends the id and keeps the rest of the metadata", () => {
    const metadata: JsonObject = { bootstrapSymbolicKey: "open", adaptationIds: ["adaptation.a"] };
    const stamped = withAutomationStudioNodeAdaptationId(metadata, "adaptation.b");
    expect(stamped).toEqual({ bootstrapSymbolicKey: "open", adaptationIds: ["adaptation.a", "adaptation.b"] });
    expect(metadata).toEqual({ bootstrapSymbolicKey: "open", adaptationIds: ["adaptation.a"] });
    expect(automationStudioNodeAdaptationIds(stamped)).toEqual(["adaptation.a", "adaptation.b"]);
  });

  it("starts a list on a node with no metadata", () => {
    expect(withAutomationStudioNodeAdaptationId(undefined, "adaptation.a")).toEqual({ adaptationIds: ["adaptation.a"] });
  });

  it("leaves an id already listed where it is", () => {
    const once = withAutomationStudioNodeAdaptationId({ adaptationIds: ["adaptation.a", "adaptation.b"] }, "adaptation.a");
    expect(once.adaptationIds).toEqual(["adaptation.a", "adaptation.b"]);
    expect(withAutomationStudioNodeAdaptationId(once, "adaptation.a")).toEqual(once);
  });

  it("drops malformed entries so the list reads back", () => {
    const stamped = withAutomationStudioNodeAdaptationId({ adaptationIds: ["adaptation.a", "", 4, " padded "] }, "adaptation.b");
    expect(stamped.adaptationIds).toEqual(["adaptation.a", "adaptation.b"]);
    expect(withAutomationStudioNodeAdaptationId({ adaptationIds: "adaptation.a" }, "adaptation.b").adaptationIds).toEqual(["adaptation.b"]);
  });

  it("lets the oldest ids give way past the limit", () => {
    const full = Array.from({ length: AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT + 2 }, (_, index) => `adaptation.${index}`);
    const stamped = withAutomationStudioNodeAdaptationId({ adaptationIds: full }, "adaptation.new");
    expect(stamped.adaptationIds).toEqual([...full.slice(3), "adaptation.new"]);
    expect(automationStudioNodeAdaptationIds(stamped)).toHaveLength(AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT);
  });

  it("refuses an id Core could not have minted", () => {
    expect(() => withAutomationStudioNodeAdaptationId({}, " adaptation.a")).toThrow(/well-formed adaptation id/);
    expect(() => withAutomationStudioNodeAdaptationId({}, "")).toThrow(/well-formed adaptation id/);
  });
});

describe("verification verbs", () => {
  it("count only when the definition sets verifiesState to exactly true", () => {
    expect(automationStudioDefinitionVerifiesState({ verifiesState: true })).toBe(true);
    for (const metadata of [undefined, {}, { verifiesState: false }, { verifiesState: "true" }, { verifiesState: 1 }] as Array<JsonObject | undefined>) {
      expect(automationStudioDefinitionVerifiesState(metadata)).toBe(false);
    }
  });
});
