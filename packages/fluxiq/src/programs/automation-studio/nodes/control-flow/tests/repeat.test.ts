import { describe, expect, it } from "vitest";
import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionContext, AutomationNodeExecutionResult, AutomationNodeIterationState } from "../../contracts.ts";
import { repeatNode } from "../repeat.ts";

/** A count kept between passes, as a graph run keeps it. */
function keptCount(): NonNullable<AutomationNodeExecutionContext["iteration"]> {
  let state: AutomationNodeIterationState | undefined;
  return {
    get: () => state,
    set: (next?: AutomationNodeIterationState) => { state = next; }
  };
}

async function pass(context: AutomationNodeExecutionContext): Promise<AutomationNodeExecutionResult> {
  const result = await repeatNode.execute?.(context);
  if (!result) throw new Error("builtin.control.repeat has no executor");
  return result;
}

async function passesUntilDone(parameters: JsonObject): Promise<AutomationNodeExecutionResult[]> {
  const iteration = keptCount();
  const results: AutomationNodeExecutionResult[] = [];
  for (let arrival = 0; arrival < 1_000; arrival += 1) {
    const result = await pass({ inputs: {}, parameters, iteration });
    results.push(result);
    if (result.route !== "body") return results;
  }
  throw new Error("Repeat never ended");
}

describe("builtin.control.repeat", () => {
  it("declares body and done branches, a pass data output, the control input only, and its limits", () => {
    expect(repeatNode.id).toBe("builtin.control.repeat");
    expect(repeatNode.outputs.map((port) => [port.id, port.role])).toEqual([["body", "branch"], ["done", "branch"], ["pass", "data"]]);
    expect(repeatNode.outputs.find((port) => port.id === "pass")?.valueType).toBe("number");
    expect(repeatNode.inputs.map((port) => [port.id, port.role])).toEqual([["in", "control"]]);
    expect(repeatNode.parameters.find((parameter) => parameter.id === "most")).toMatchObject({ defaultValue: 50, constraints: { minimum: 1, maximum: 500, integer: true } });
    expect(repeatNode.parameters.find((parameter) => parameter.id === "maxStepsPerIteration")).toMatchObject({ defaultValue: 50, allowStateBinding: false });
  });

  it("routes passes 1 to most on body, numbered, then done with the count cleared and a message", async () => {
    const iteration = keptCount();
    const results: AutomationNodeExecutionResult[] = [];
    for (let arrival = 0; arrival < 4; arrival += 1) results.push(await pass({ inputs: {}, parameters: { most: 3 }, iteration }));

    expect(results.slice(0, 3)).toEqual([1, 2, 3].map((n) => ({ status: "success", route: "body", outputs: { pass: n } })));
    expect(results[3]).toMatchObject({ status: "success", route: "done", outputs: { pass: 3 } });
    expect(results[3]?.message).toMatch(/most passes \(3\)/);
    expect(iteration.get()).toBeUndefined();
  });

  it("keeps its count as an empty list and the passes begun", async () => {
    const iteration = keptCount();
    await pass({ inputs: {}, parameters: { most: 5 }, iteration });
    await pass({ inputs: {}, parameters: { most: 5 }, iteration });
    expect(iteration.get()).toEqual({ items: [], index: 2 });
  });

  it("goes on counting from a kept count rather than starting over", async () => {
    const iteration = keptCount();
    iteration.set({ items: [], index: 4 });
    expect(await pass({ inputs: {}, parameters: { most: 5 }, iteration })).toEqual({ status: "success", route: "body", outputs: { pass: 5 } });
    expect((await pass({ inputs: {}, parameters: { most: 5 }, iteration })).route).toBe("done");
  });

  it("starts again from pass 1 after it routed done", async () => {
    const iteration = keptCount();
    await pass({ inputs: {}, parameters: { most: 1 }, iteration });
    expect((await pass({ inputs: {}, parameters: { most: 1 }, iteration })).route).toBe("done");
    expect(await pass({ inputs: {}, parameters: { most: 1 }, iteration })).toEqual({ status: "success", route: "body", outputs: { pass: 1 } });
  });

  it("takes 50 passes when its author set no most", async () => {
    const results = await passesUntilDone({});
    expect(results.filter((result) => result.route === "body")).toHaveLength(50);
  });

  it("clamps most to 1..500", async () => {
    expect((await passesUntilDone({ most: 0 })).filter((result) => result.route === "body")).toHaveLength(1);
    expect((await passesUntilDone({ most: -7 })).filter((result) => result.route === "body")).toHaveLength(1);
    expect((await passesUntilDone({ most: 2.9 })).filter((result) => result.route === "body")).toHaveLength(2);
    expect((await passesUntilDone({ most: 900 })).filter((result) => result.route === "body")).toHaveLength(500);
  });

  it("fails, with a valid failure record, outside a run that keeps its count", async () => {
    const result = await pass({ inputs: {}, parameters: {} });
    expect(result).toMatchObject({ status: "failed", route: "failed", failure: { code: "repeat.iteration_unavailable", retryable: false } });
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual(result.failure);
  });
});
