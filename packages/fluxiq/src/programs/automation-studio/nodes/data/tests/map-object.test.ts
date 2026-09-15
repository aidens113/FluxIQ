import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import { mapObjectNode } from "../map-object.ts";

// Stands in for a row the executor captured: one object, found by identity.
const ROW: JsonValue = { name: "synthetic-row-name", price: 3 };

async function mapped(inputs: Record<string, JsonValue>, parameters: Record<string, JsonValue>): Promise<Record<string, JsonValue>> {
  const run = mapObjectNode.execute;
  if (!run) throw new Error("builtin.data.map-object has no implementation.");
  const result = await run({ inputs, parameters });
  return (result.outputs ?? {}).object as Record<string, JsonValue>;
}

describe("builtin.data.map-object", () => {
  it("adds fields while keeping every value it carried over by reference", async () => {
    const object = await mapped({ object: { rows: [ROW] } }, { mode: "merge", mapping: { label: "synthetic-label" } });

    expect((object.rows as JsonValue[])[0]).toBe(ROW);
    expect(object.label).toBe("synthetic-label");
  });

  it("keeps a picked value by reference", async () => {
    const object = await mapped({ object: { page: { rows: [ROW] } } }, { mode: "pick", mapping: { rows: "page.rows" } });

    expect((object.rows as JsonValue[])[0]).toBe(ROW);
  });

  it("keeps a renamed value by reference, at the new path", async () => {
    const object = await mapped({ object: { page: { rows: [ROW] } } }, { mode: "rename", mapping: { "results.rows": "page.rows" } });
    const renamed = (object.results as Record<string, JsonValue>).rows as JsonValue[];

    expect(renamed).toHaveLength(1);
    // A copy here is a row the saved trace can no longer mark, so it writes the row's own text.
    expect(renamed[0]).toBe(ROW);
    expect((object.page as Record<string, JsonValue>).rows).toBeDefined();
  });

  it("normalizes a renamed value JSON cannot carry", async () => {
    const source = { page: { fn: (() => "not json") as unknown as JsonValue } };
    const object = await mapped({ object: source as unknown as JsonValue }, { mode: "rename", mapping: { "results.fn": "page.fn" } });

    expect(typeof (object.results as Record<string, JsonValue>).fn).toBe("string");
  });
});
