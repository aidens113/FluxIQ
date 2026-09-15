import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import { setVariableNode } from "../set-variable.ts";

// Stands in for a row the executor captured. What matters about it is that it is
// one object: the saved trace finds captured rows by identity, never by value.
const ROW: JsonValue = { name: "synthetic-row-name", price: 3 };

async function execute(
  inputs: Record<string, JsonValue>,
  parameters: Record<string, JsonValue>,
  variables = new Map<string, JsonValue>()
): Promise<{ outputs: Record<string, JsonValue>; variables: Map<string, JsonValue> }> {
  const run = setVariableNode.execute;
  if (!run) throw new Error("builtin.data.set-variable has no implementation.");
  const result = await run({ inputs, parameters, variables });
  return { outputs: result.outputs ?? {}, variables };
}

describe("builtin.data.set-variable", () => {
  it("writes the value it was given, the same object, so a captured row keeps its identity", async () => {
    const { outputs, variables } = await execute({ value: ROW }, { name: "row", writeMode: "replace" });

    expect(variables.get("row")).toBe(ROW);
    expect(outputs.next).toBe(ROW);
  });

  it("writes a list it was given as the same array, which the saved trace marks whole", async () => {
    const rows: JsonValue = [ROW, { name: "synthetic-second" }];
    const { outputs, variables } = await execute({ value: rows }, { name: "rows", writeMode: "replace" });

    expect(variables.get("rows")).toBe(rows);
    expect(outputs.next).toBe(rows);
  });

  it("appends the value to a list by reference, keeping the rows already in it", async () => {
    const first: JsonValue = { name: "synthetic-first" };
    const { outputs, variables } = await execute({ value: ROW }, { name: "rows", writeMode: "append-list" }, new Map<string, JsonValue>([["rows", [first]]]));
    const appended = variables.get("rows") as JsonValue[];

    expect(appended).toHaveLength(2);
    expect(appended[0]).toBe(first);
    expect(appended[1]).toBe(ROW);
    expect(outputs.next).toBe(appended);
  });

  it("merges object fields while keeping each field's value by reference", async () => {
    const { variables } = await execute({ value: { rows: [ROW] } }, { name: "state", writeMode: "merge-object" }, new Map<string, JsonValue>([["state", { kept: ROW }]]));
    const merged = variables.get("state") as Record<string, JsonValue>;

    expect(merged.kept).toBe(ROW);
    expect((merged.rows as JsonValue[])[0]).toBe(ROW);
  });

  it("normalizes a value JSON cannot carry, and leaves what it was given untouched", async () => {
    const source = { keep: "synthetic-keep", drop: () => "not json" } as unknown as JsonValue;
    const { variables } = await execute({ value: source }, { name: "mixed", writeMode: "replace" });
    const stored = variables.get("mixed") as Record<string, JsonValue>;

    expect(stored).not.toBe(source);
    expect(stored.keep).toBe("synthetic-keep");
    expect(typeof stored.drop).toBe("string");
    expect(typeof (source as unknown as Record<string, unknown>).drop).toBe("function");
  });

  it("writes null when there is no value", async () => {
    const { outputs, variables } = await execute({}, { name: "absent", writeMode: "replace" });

    expect(variables.get("absent")).toBeNull();
    expect(outputs.next).toBeNull();
  });
});
