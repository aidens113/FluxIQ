// One domain's stored values for one Flow: bounded where they are written,
// the oldest build let go past the count, and a stored file of another shape
// refused rather than read as empty (t728).

import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import { AutomationStudioDomainBuildStateDocument as Document } from "../document.ts";
import { AUTOMATION_STUDIO_DOMAIN_BUILD_STATE_LIMITS as LIMITS } from "../limits.ts";

const refusedWith = (code: string) => expect.objectContaining({ name: "AutomationStudioDomainBuildStateRefusal", code });

describe("a domain's build state document", () => {
  it("keeps build values apart from the Flow's own, and hands back copies", () => {
    const document = Document.empty("warehouse");
    document.put("build.1", "shelves", { counted: [1, 2] });
    document.put(undefined, "shelves", "flow-wide");
    const read = document.get("build.1", "shelves") as { counted: number[] };
    read.counted.push(3);
    expect(document.get("build.1", "shelves")).toEqual({ counted: [1, 2] });
    expect(document.get(undefined, "shelves")).toBe("flow-wide");
    expect(document.get("build.2", "shelves")).toBeUndefined();
  });

  it("survives its own round trip", () => {
    const document = Document.empty("warehouse");
    document.put("build.1", "a", 1);
    document.put(undefined, "b", [true, null]);
    const again = Document.parse(JSON.parse(JSON.stringify(document.toJson())), "warehouse");
    expect(again.get("build.1", "a")).toBe(1);
    expect(again.get(undefined, "b")).toEqual([true, null]);
  });

  it("refuses a value that is not plain JSON, or past its byte bound, and writes nothing", () => {
    const document = Document.empty("warehouse");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    // A hole would be written back as null; a class instance would lose its prototype.
    // eslint-disable-next-line no-sparse-arrays
    const values: unknown[] = [Number.NaN, cyclic, [1, , 3], new Date(0), [undefined]];
    for (const value of values) expect(() => document.put("build.1", "k", value as JsonValue)).toThrow(refusedWith("domain_build_state.value_invalid"));
    expect(() => document.put("build.1", "k", "x".repeat(LIMITS.maxValueBytes))).toThrow(refusedWith("domain_build_state.value_too_large"));
    expect(document.toJson().builds).toEqual({});
  });

  it("bounds a scope's keys and bytes, but lets a key be replaced at the bound", () => {
    const document = Document.empty("warehouse");
    for (let index = 0; index < LIMITS.maxKeysPerScope; index += 1) document.put("build.1", `k${index}`, index);
    expect(() => document.put("build.1", "one-more", 1)).toThrow(refusedWith("domain_build_state.scope_full"));
    document.put("build.1", "k0", "replaced");
    expect(document.get("build.1", "k0")).toBe("replaced");
    const big = Document.empty("warehouse");
    const chunk = "x".repeat(LIMITS.maxValueBytes - 16);
    for (let index = 0; index < 4; index += 1) big.put(undefined, `k${index}`, chunk);
    expect(() => big.put(undefined, "k4", chunk)).toThrow(refusedWith("domain_build_state.scope_full"));
  });

  it("lets go of the build written longest ago once there are too many", () => {
    const document = Document.empty("warehouse");
    for (let index = 0; index < LIMITS.maxBuildsPerFlow; index += 1) document.put(`build.${index}`, "k", index);
    // Writing build.0 again makes build.1 the oldest.
    document.put("build.0", "k", "again");
    document.put("build.new", "k", "new");
    expect(document.get("build.1", "k")).toBeUndefined();
    expect(document.get("build.0", "k")).toBe("again");
    expect(document.get("build.new", "k")).toBe("new");
    expect(Object.keys(document.toJson().builds as object)).toHaveLength(LIMITS.maxBuildsPerFlow);
  });

  it("drops a value, and its scope once empty", () => {
    const document = Document.empty("warehouse");
    document.put("build.1", "k", 1);
    document.put(undefined, "k", 1);
    expect(document.drop("build.1", "k")).toBe(true);
    expect(document.drop("build.1", "k")).toBe(false);
    expect(document.drop(undefined, "k")).toBe(true);
    expect(document.toJson()).toEqual({ schemaVersion: 1, domainId: "warehouse", sequence: 2, builds: {} });
  });

  it("refuses a stored document of another shape or another domain, never reading it as empty", () => {
    expect(Document.parse({}, "warehouse").toJson().builds).toEqual({});
    expect(() => Document.parse({ schemaVersion: 2, domainId: "warehouse", sequence: 0, builds: {} }, "warehouse")).toThrow(refusedWith("domain_build_state.document_invalid"));
    expect(() => Document.parse({ schemaVersion: 1, domainId: "warehouse", sequence: 0, builds: { "build.1": { values: [], written: 1 } } }, "warehouse")).toThrow(refusedWith("domain_build_state.document_invalid"));
    expect(() => Document.parse({ schemaVersion: 1, domainId: "Warehouse", sequence: 0, builds: {} }, "warehouse")).toThrow(refusedWith("domain_build_state.domain_mismatch"));
  });
});
