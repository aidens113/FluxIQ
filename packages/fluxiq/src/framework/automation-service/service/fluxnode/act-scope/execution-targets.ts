import type { FluxNodeOwnerFlows } from "../owner-flows.ts";
import { isRegisteredPipeline } from "../pipeline/is-registered-pipeline.ts";
import type { FluxNodeRegistered } from "../pipeline/index.ts";

/** Resolve the code a pipeline admits once; rows and secret values are never part of this manifest. */
export async function fluxNodeExecutionTargets(registered: FluxNodeRegistered, flows: Pick<FluxNodeOwnerFlows, "find">, admitted?: Readonly<Record<string, string>>): Promise<{ targets: Record<string, string> | undefined; flows: Pick<FluxNodeOwnerFlows, "find"> } | { problem: Error }> {
  try {
    const original: Pick<FluxNodeOwnerFlows, "find"> = { find: async (name, hash) => {
      if (hash !== undefined || admitted === undefined) return await flows.find(name, hash);
      const version = own(admitted, name);
      return version === undefined ? { missing: "hash" } : await flows.find(name, version);
    } };
    if (!isRegisteredPipeline(registered)) return { targets: undefined, flows: original };
    const targets = new Map<string, string>();
    const visit = async (node: FluxNodeRegistered): Promise<void> => {
      if (!isRegisteredPipeline(node)) return;
      const calls = [...(node.pipeline.source.kind === "flow" ? [node.pipeline.source.target] : []), ...node.pipeline.steps.flatMap((step) => step.kind === "map" ? [step.target] : [])];
      for (const target of calls) {
        if (!("fluxNode" in target) || targets.has(target.fluxNode)) continue;
        const found = await original.find(target.fluxNode);
        if ("missing" in found) {
          throw new Error(`The declared target ${target.fluxNode} or its admitted version is unavailable.`);
        }
        targets.set(target.fluxNode, found.found.specHash);
        await visit(found.found);
      }
    };
    await visit(registered);
    const manifest = Object.fromEntries(targets);
    return { targets: manifest, flows: { find: async (name, hash) => {
      if (hash !== undefined) return await flows.find(name, hash);
      const version = own(manifest, name);
      return version === undefined ? { missing: "name" } : await flows.find(name, version);
    } } };
  } catch (cause) {
    return { problem: new Error("Core cannot bind this execution's resolved target identities. Register every declared target and restore admitted versions before starting.", { cause }) };
  }
}

function own(targets: Readonly<Record<string, string>> | undefined, name: string): string | undefined {
  return targets && Object.hasOwn(targets, name) ? targets[name] : undefined;
}
