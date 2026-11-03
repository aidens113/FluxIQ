import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapCatalogEntry } from "./entry.ts";
import type { AutomationStudioFlowBootstrapRoutingContext } from "../index.ts";
import type { AutomationStudioFlowBootstrapCatalogNames } from "./names.ts";

export type AutomationStudioFlowBootstrapContext = {
  outputSchema: JsonObject;
  /**
   * The Flow's size setting, present only when it is not the default, so a
   * provider adapter holding only the request can size the schema it checks and
   * the plan it parses (`./size-limits.ts`). A default Flow's context is unchanged.
   */
  maxNodesPerSubflow?: number;
  nodeCatalog: AutomationStudioFlowBootstrapCatalogEntry[];
  /** Always false: the catalog is every offered node (`./catalog.ts`). Kept so a request reads as it always did. */
  catalogTruncated: boolean;
  catalogSelection: {
    /** The catalog's size in UTF-8 bytes, as measured, never a budget. */
    usedBytes: number;
    requiredTerms: string[];
    missingRequiredTerms: string[];
    /**
     * The parameters this catalog does not describe in full, `<node
     * id>.<parameter id>` each (`./catalog.ts`).
     *
     * Absent when there are none. A parameter named here had an example that
     * could not be written as JSON, so a value written for it is written from a
     * vocabulary the model was never shown -- which every campaign that shortened
     * such text to fit had no way of telling.
     */
    withheldParameterText?: string[];
  };
  /** What the model routes with: the structure as it stands, what a condition can test, and what exploration saw. */
  routing?: AutomationStudioFlowBootstrapRoutingContext;
  /**
   * Where the Flow this build writes starts, in the bound domain's own spelling
   * (`../start-location.ts`).
   *
   * The build is not there: its first step has to be the one that goes there,
   * and the domain refuses everything else until it has. Absent for a build
   * that was given its target instead of being told where it is, which is still
   * the right shape when a person is asking about what is in front of them.
   */
  startLocation?: string;
  /**
   * Every node by id and what it does, by category (`./catalog-names.ts`).
   * Evidence decisions only: it is what such a decision is shown in place of
   * `nodeCatalog` (`../../llm/deepseek/request-body.ts`), which the packet still
   * carries whole for every reader that checks it.
   */
  catalogNames?: AutomationStudioFlowBootstrapCatalogNames;
  /**
   * The full entries of the nodes this build has run or asked `core.describe_nodes`
   * about, in the order first described; ids the catalog does not hold are
   * skipped. Evidence decisions only, and absent until a node is described.
   * Append-only for the length of a build, so it never cuts the cached prefix
   * of a request that repeats it.
   */
  describedNodes?: AutomationStudioFlowBootstrapCatalogEntry[];
};
