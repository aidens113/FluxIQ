import { dataPipelineSchema } from "@fluxiq/contracts/fluxnode";
import { expect, it, vi } from "vitest";
import type { FluxNodeRegistered } from "../../pipeline/index.ts";
import type { FluxNodeOwnerFlows } from "../../owner-flows.ts";
import { fluxNodeExecutionTargets } from "../execution-targets.ts";
import { fluxNodeChildActScope } from "../child-scope.ts";

const node = (name: string, specHash: string) => ({ name, specHash, spec: {} }) as FluxNodeRegistered;
const pipeline = (name: string, calls: string[]) => ({ name, specHash: `${name}.hash`, pipeline: dataPipelineSchema.parse({ name, source: { kind: "input", field: "rows" }, steps: calls.map((target, at) => ({ id: `call${at}`, kind: "map", target: { fluxNode: target }, inputs: {} })) }) }) as FluxNodeRegistered;

it("freezes reachable target versions, retains admitted versions and honors explicit find hashes", async () => {
  const leaf = "library.leaf";
  const middle = pipeline("library.middle", [leaf]);
  const root = pipeline("library.root", [middle.name, leaf]);
  let latest = "old";
  const find: FluxNodeOwnerFlows["find"] = vi.fn(async (name, hash) => ({ found: name === middle.name ? middle : node(name, hash ?? latest) }));
  const before = await fluxNodeExecutionTargets(root, { find });
  if ("problem" in before) throw before.problem;
  expect(before.targets).toEqual({ [middle.name]: middle.specHash, [leaf]: "old" });
  latest = "new";
  expect(await before.flows.find(leaf)).toMatchObject({ found: { specHash: "old" } });
  expect(await before.flows.find(leaf, "new")).toMatchObject({ found: { specHash: "new" } });
  expect(await before.flows.find("library.late")).toEqual({ missing: "name" });
  expect(await before.flows.find("library.late", "explicit")).toMatchObject({ found: { specHash: "explicit" } });
  const continued = await fluxNodeExecutionTargets(root, { find }, before.targets);
  expect(continued).toMatchObject({ targets: before.targets });
  expect(await fluxNodeExecutionTargets(root, { find })).toMatchObject({ targets: { [leaf]: "new" } });
});

it("fails closed when a preserved admitted target is unavailable", async () => {
  const find: FluxNodeOwnerFlows["find"] = vi.fn(async () => ({ missing: "hash" as const }));
  const result = await fluxNodeExecutionTargets(pipeline("library.root", ["library.leaf"]), { find }, { "library.leaf": "old" });
  expect(result).toHaveProperty("problem");
  if (!("problem" in result)) throw new Error("Expected a configuration problem.");
  expect(result.problem.cause).toBeInstanceOf(Error);
  expect(find).toHaveBeenCalledWith("library.leaf", "old");
});

it("refuses missing targets before admission and bounds traversal of recursive registered pipelines", async () => {
  const first = pipeline("library.first", ["library.second"]);
  const second = pipeline("library.second", [first.name]);
  const found = new Map([[first.name, first], [second.name, second]]);
  const find: FluxNodeOwnerFlows["find"] = vi.fn(async (name) => {
    const value = found.get(name);
    return value ? { found: value } : { missing: "name" as const };
  });
  expect(await fluxNodeExecutionTargets(pipeline("library.missing", ["library.late"]), { find })).toHaveProperty("problem");
  vi.mocked(find).mockClear();
  expect(await fluxNodeExecutionTargets(first, { find })).toMatchObject({ targets: { [first.name]: first.specHash, [second.name]: second.specHash } });
  expect(find).toHaveBeenCalledTimes(2);
});

it("keeps invocation identity independent of a resolved version and distinct by occurrence and lexical step", () => {
  const call = { stepId: "save", invocationId: "snapshot:occurrence" };
  const original = fluxNodeChildActScope("parent", call, { name: "library.save", specHash: "old" });
  expect(fluxNodeChildActScope("parent", call, { name: "library.save", specHash: "new" })).toBe(original);
  expect(fluxNodeChildActScope("parent", { ...call, stepId: "again" }, { name: "library.save", specHash: "old" })).not.toBe(original);
  expect(fluxNodeChildActScope("parent", { ...call, invocationId: "snapshot:other" }, { name: "library.save", specHash: "old" })).not.toBe(original);
});
