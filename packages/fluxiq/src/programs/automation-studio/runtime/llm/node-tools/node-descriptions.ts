// The nodes one build has been shown whole, and the definitions it is shown.
//
// **Why a build has this (user, 2026-10-01).** Every decision of an evidence
// build used to carry the whole catalog: every node's label, description,
// ports and every parameter's authoring text, on every request, whether the
// build would ever run that node or not. The model is now shown each node by
// name only, asks for the full definitions of the nodes it is about to use
// (`./describe-nodes.ts`), and a node it was shown stays shown for the rest of
// the build, under `flowBootstrap.describedNodes`. A call that fails naming a
// node it never asked about describes that node too
// (`../harness-options/binding.ts`), so a model that skipped the step is not
// left guessing at parameters twice.
//
// **What it holds.** Only ids, in the order they were first described, each
// once: the harness input carries them (`flowBootstrap.describedNodeIds`) and
// the request renders the entries itself. The definitions are the catalog's own
// entries (`../../flow-bootstrap/plan/catalog.ts`), built once, on first use,
// from the same registry and resolution the build's catalog is built from, so
// what a described node shows is exactly what the catalog would have shown.
//
// **Its scope is one build.** Every round of the build -- the exploration and
// any repair after its Flow was judged -- shares one, because a repair is the
// same model continuing the same work. A new build starts empty.

import { buildAutomationStudioFlowBootstrapContext, type AutomationStudioFlowBootstrapCatalogEntry } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";

/** One build's described-node memory. */
export type AutomationStudioLlmNodeDescriptions = {
  /** Every node described so far, in the order each was first described. */
  ids(): string[];
  /**
   * Describe these nodes. `described` are the ones this call added, in the
   * order asked; `alreadyDescribed` were shown before; `unknown` are not in the
   * catalog and were not added. Each id is counted once.
   */
  describe(ids: readonly string[]): { described: string[]; alreadyDescribed: string[]; unknown: string[] };
  /** Whether this node has been described. */
  has(id: string): boolean;
  /** A node's catalog entry, described or not; undefined for an id the catalog does not hold. */
  definition(id: string): AutomationStudioFlowBootstrapCatalogEntry | undefined;
};

/** A fresh, empty memory for one build over this registry and resolution. */
export function automationStudioLlmNodeDescriptions(input: {
  registry?: AutomationStudioNodeRegistry | undefined;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioLlmNodeDescriptions {
  const described = new Set<string>();
  let catalog: Map<string, AutomationStudioFlowBootstrapCatalogEntry> | undefined;
  const definition = (id: string): AutomationStudioFlowBootstrapCatalogEntry | undefined => {
    catalog ??= new Map(buildAutomationStudioFlowBootstrapContext({ ...(input.registry ? { registry: input.registry } : {}), resolution: input.resolution })
      .nodeCatalog.map((entry) => [entry.id, entry]));
    return catalog.get(id);
  };
  return {
    ids: () => [...described],
    has: (id) => described.has(id),
    definition,
    describe: (ids) => {
      const answer = { described: [] as string[], alreadyDescribed: [] as string[], unknown: [] as string[] };
      for (const id of new Set(ids)) {
        if (described.has(id)) answer.alreadyDescribed.push(id);
        else if (definition(id)) {
          described.add(id);
          answer.described.push(id);
        } else answer.unknown.push(id);
      }
      return answer;
    }
  };
}
