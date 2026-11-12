// Declared secret inputs identify immutable caller-input bindings; their values never enter request digests or snapshots.
import { dataFieldPathSteps, fluxNodeSecretInputs, formatJsonPointer, type DataExpression, type DataPipeline, type FlowCallTarget } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import { readField } from "../../pipelines/index.ts";
import type { FluxNodeOwnerFlows } from "../owner-flows.ts";
import { isRegisteredPipeline } from "../pipeline/is-registered-pipeline.ts";
import type { FluxNodeRegistered } from "../pipeline/index.ts";

export async function fluxNodeSecretBindings(registered: FluxNodeRegistered | { pipeline: DataPipeline }, inputs: JsonObject, flows: Pick<FluxNodeOwnerFlows, "find">, options?: { privateDataset: (snapshotId: string) => Promise<boolean> }): Promise<{ pointers: string[]; problem?: string }> {
  if ("spec" in registered) return { pointers: fluxNodeSecretInputs(registered.spec.inputs).names.map((name) => formatJsonPointer(["inputs", name])) };
  const { pipeline } = registered;
  const source = pipeline.source;
  const pointers = new Set<string>();
  const calls: { target: FlowCallTarget; inputs: Record<string, DataExpression>; fromRecords: boolean }[] = [];
  if (source.kind === "flow") calls.push({ target: source.target, inputs: source.inputs ?? {}, fromRecords: false });
  for (const step of pipeline.steps) if (step.kind === "map") calls.push({ target: step.target, inputs: step.inputs, fromRecords: true });
  for (const call of calls) {
    if (!("fluxNode" in call.target)) continue;
    const found = await flows.find(call.target.fluxNode);
    if ("missing" in found || isRegisteredPipeline(found.found)) continue;
    for (const name of fluxNodeSecretInputs(found.found.spec.inputs).names) {
      const expression = call.inputs[name];
      if (!expression) continue;
      let problem: string | undefined;
      let privateDataset = false;
      if (source.kind === "dataset" && options) privateDataset = await options.privateDataset(source.dataset.datasetId);
      const visit = (part: DataExpression): void => {
        if ("input" in part) pointers.add(formatJsonPointer(["inputs", ...dataFieldPathSteps(part.input)]));
        else if ("field" in part) {
          if (call.fromRecords && source.kind === "input") {
            const rows = readField(inputs, source.field);
            if (Array.isArray(rows)) rows.forEach((_row, at) => pointers.add(formatJsonPointer(["inputs", ...dataFieldPathSteps(source.field), at, ...dataFieldPathSteps(part.field)])));
          } else if (!(call.fromRecords && source.kind === "dataset" && (!options || privateDataset))) problem = "A secret read from an ephemeral source needs an immutable caller-input binding or a private source dataset before mapped actions can start.";
        } else if ("op" in part) part.args.forEach(visit);
        else if ("object" in part) Object.values(part.object).forEach(visit);
        else if ("list" in part) part.list.forEach(visit);
        else if (typeof part.value === "string" && part.value !== "") problem = "Supply a declared secret through a caller-input binding or private source dataset, rather than a literal in the pipeline.";
      };
      visit(expression);
      if (problem) return { pointers: [], problem };
    }
  }
  return { pointers: [...pointers] };
}
