// A Flow's typed interface and Call Flow targets.
import { describe, expect, it } from "vitest";
import { CALL_FLOW_NODE_TYPE, flowCallTargetSchema, flowInputNames, flowInterfaceSchema } from "../index.ts";

describe("flowInterfaceSchema", () => {
  it("accepts no interface, inputs only, outputs only, or both", () => {
    expect(flowInterfaceSchema.safeParse({}).success).toBe(true);
    expect(flowInterfaceSchema.safeParse({ inputs: { type: "object", properties: { q: {} } } }).success).toBe(true);
    expect(flowInterfaceSchema.safeParse({ outputs: { type: "array", items: { type: "string" } } }).success).toBe(true);
  });

  it("refuses inputs that are not an object", () => {
    const parsed = flowInterfaceSchema.safeParse({ inputs: { type: "string" } });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]).toMatchObject({ path: ["inputs", "type"], params: { code: "flow_interface.inputs_not_object" } });
  });

  it("lists declared input names in order", () => {
    expect(flowInputNames({ type: "object", properties: { query: {}, count: { type: "integer" } } })).toEqual(["query", "count"]);
    expect(flowInputNames(undefined)).toEqual([]);
  });
});

describe("Call Flow", () => {
  it("names a Flow by id or a FluxNode by name, never by path", () => {
    expect(CALL_FLOW_NODE_TYPE).toBe("builtin.control.call-flow");
    expect(flowCallTargetSchema.safeParse({ flowId: "flow_123" }).success).toBe(true);
    expect(flowCallTargetSchema.safeParse({ fluxNode: "market.cheapest-listings" }).success).toBe(true);
    expect(flowCallTargetSchema.safeParse({ path: "web/x" }).success).toBe(false);
    expect(flowCallTargetSchema.safeParse({ flowId: "a", fluxNode: "b" }).success).toBe(false);
  });
});
