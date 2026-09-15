import { describe, expect, it } from "vitest";
import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionContext, AutomationNodeExecutionResult, AutomationNodeIterationState } from "../../contracts.ts";
import { forEachNode } from "../for-each.ts";

/** A place kept between passes, as a graph run keeps it. */
function keptPlace(): NonNullable<AutomationNodeExecutionContext["iteration"]> {
  let state: AutomationNodeIterationState | undefined;
  return {
    get: () => state,
    set: (next?: AutomationNodeIterationState) => { state = next; }
  };
}

async function pass(context: AutomationNodeExecutionContext): Promise<AutomationNodeExecutionResult> {
  const result = await forEachNode.execute?.(context);
  if (!result) throw new Error("builtin.control.for-each has no executor");
  return result;
}

describe("builtin.control.for-each", () => {
  it("declares body and done branches, item, index, and count data outputs, and its limits", () => {
    expect(forEachNode.outputs.map((port) => [port.id, port.role])).toEqual([["body", "branch"], ["done", "branch"], ["item", "data"], ["index", "data"], ["count", "data"]]);
    expect(forEachNode.inputs.find((port) => port.id === "items")).toMatchObject({ valueType: "array", required: true });
    expect(forEachNode.parameters.find((parameter) => parameter.id === "maxIterations")).toMatchObject({ defaultValue: 100, constraints: { minimum: 1, maximum: 10_000, integer: true } });
    expect(forEachNode.parameters.find((parameter) => parameter.id === "maxStepsPerIteration")).toMatchObject({ defaultValue: 50, allowStateBinding: false });
  });

  it("hands out each item in order, by reference, then routes done and forgets its place", async () => {
    const items: JsonValue[] = [{ name: "synthetic-first" }, { name: "synthetic-second" }, 3];
    const iteration = keptPlace();

    const first = await pass({ inputs: { items }, parameters: {}, iteration });
    expect(first).toEqual({ status: "success", route: "body", outputs: { item: items[0], index: 0, count: 3 } });
    expect(first.outputs?.item).toBe(items[0]);

    // A later pass reads the place it kept, not the list it is handed now.
    const second = await pass({ inputs: { items: ["synthetic-other"] }, parameters: {}, iteration });
    expect(second).toMatchObject({ route: "body", outputs: { index: 1, count: 3 } });
    expect(second.outputs?.item).toBe(items[1]);
    expect((await pass({ inputs: { items }, parameters: {}, iteration })).outputs).toEqual({ item: 3, index: 2, count: 3 });

    expect(await pass({ inputs: { items }, parameters: {}, iteration })).toEqual({ status: "success", route: "done", outputs: { count: 3 } });
    expect(iteration.get()).toBeUndefined();

    // Reached again, it starts over on the list it is handed then.
    expect(await pass({ inputs: { items: ["synthetic-again"] }, parameters: {}, iteration })).toEqual({ status: "success", route: "body", outputs: { item: "synthetic-again", index: 0, count: 1 } });
  });

  it("routes an empty list straight to done, keeping no place", async () => {
    const iteration = keptPlace();

    expect(await pass({ inputs: { items: [] }, parameters: {}, iteration })).toEqual({ status: "success", route: "done", outputs: { count: 0 } });
    expect(iteration.get()).toBeUndefined();
  });

  it.each([
    { case: "its own limit", parameters: { maxIterations: 3 }, length: 4, limit: 3 },
    { case: "the default of 100", parameters: {}, length: 101, limit: 100 },
    { case: "the ceiling of 10,000, whatever its limit says", parameters: { maxIterations: 20_000 }, length: 10_001, limit: 10_000 }
  ])("fails with for_each.max_iterations_exceeded, keeping no place, past $case", async ({ parameters, length, limit }) => {
    const iteration = keptPlace();
    const result = await pass({ inputs: { items: Array.from({ length }, (_, index) => index) }, parameters, iteration });
    const failure = { category: "blocked_by_capability_or_policy", code: "for_each.max_iterations_exceeded", retryable: false };

    expect(result).toEqual({ status: "failed", route: "failed", outputs: {}, message: `For Each was given ${length} items, more than its limit of ${limit}.`, failure });
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(failure);
    expect(iteration.get()).toBeUndefined();
  });

  it("takes a list exactly as long as its limit", async () => {
    expect(await pass({ inputs: { items: [1, 2, 3] }, parameters: { maxIterations: 3 }, iteration: keptPlace() })).toMatchObject({ status: "success", route: "body", outputs: { count: 3 } });
  });

  it("fails with for_each.iteration_unavailable when no run keeps its place", async () => {
    const result = await pass({ inputs: { items: [1] }, parameters: {} });
    const failure = { category: "blocked_by_capability_or_policy", code: "for_each.iteration_unavailable", retryable: false };

    expect(result).toMatchObject({ status: "failed", route: "failed", failure });
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(failure);
  });

  it.each([
    { case: "a string", items: "synthetic-not-a-list" as JsonValue },
    { case: "an object", items: { first: 1 } as JsonValue },
    { case: "nothing", items: undefined }
  ])("fails with for_each.items_invalid, keeping no place, when Items is $case", async ({ items }) => {
    const iteration = keptPlace();
    const result = await pass({ inputs: items === undefined ? {} : { items }, parameters: {}, iteration });
    const failure = { category: "graph_validation_or_unknown_node", code: "for_each.items_invalid", retryable: false };

    expect(result).toMatchObject({ status: "failed", route: "failed", failure });
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(failure);
    expect(iteration.get()).toBeUndefined();
  });
});
