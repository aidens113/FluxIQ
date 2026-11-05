// The one door every kept repair goes through: the apply of one change of an adaptation. A
// fix to a saved version is the library's to keep (`./pinned-repair.ts`), whatever kind it is.
// A fix to a Flow's own Subflow goes on as it always has, and when that Subflow is in the
// library, the library gets its next version too. Nobody who pinned it moves.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioFlowGraphVersion } from "../../../../../runtime/flow-authoring/version/index.ts";
import { isJsonRecord } from "../../json-values.ts";
import { keepProjectPart } from "../keep.ts";
import type { AutomationStudioProjectPartsPorts } from "../library-types.ts";
import { projectPartIdOf, projectPartKeyOf } from "../part-id.ts";
import { withProjectPartStores } from "../stores.ts";
import { applyProjectPartPinnedRepair, projectPartPinOfAdaptation, type ProjectPartPinnedRepairPorts } from "./pinned-repair.ts";

type Change = AutomationStudioFlowAdaptation["patch"][number];

/** What the door is on: the service's durable applier. */
type RepairDoor = { applyFlowAdaptationPatchMutations(adaptation: AutomationStudioFlowAdaptation, patch: Change, now: number): Promise<JsonObject[]> };

/** `door` with each change going through the library first (header). */
export function automationStudioDurableAdaptationsKeepingParts<Door extends RepairDoor>(door: Door, ports: ProjectPartPinnedRepairPorts & { library: AutomationStudioProjectPartsPorts }): Door {
  const apply = door.applyFlowAdaptationPatchMutations.bind(door);
  door.applyFlowAdaptationPatchMutations = async (adaptation, patch, now) => {
    if (projectPartPinOfAdaptation(adaptation)) return await applyProjectPartPinnedRepair(ports, adaptation, patch, now);
    return [...await apply(adaptation, patch, now), ...await keptInLibrary(ports, adaptation, patch)];
  };
  return door;
}

/**
 * The Subflow a kept change wrote, as its next version, when it is in the library already. The
 * Flow is what the run proved, and the library can be written at the next save, so a library
 * that could not take it never undoes the change: it goes on the record of the apply instead.
 */
async function keptInLibrary(ports: Pick<ProjectPartPinnedRepairPorts, "pool"> & { library: AutomationStudioProjectPartsPorts }, adaptation: AutomationStudioFlowAdaptation, patch: Change): Promise<JsonObject[]> {
  const subflowId = subflowOfChange(adaptation, patch);
  if (!subflowId || !ports.pool) return [];
  try {
    const subflow = await ports.library.getFlowSubflow(adaptation.projectId, adaptation.flowId, subflowId);
    if (!subflow?.graphFlowId) return [];
    const graphFlow = await ports.library.getFlow(adaptation.projectId, subflow.graphFlowId);
    const revision = automationStudioFlowGraphVersion({ flow: graphFlow }).revision;
    const partId = projectPartIdOf(adaptation.flowId, projectPartKeyOf({ subflow, graphFlow, ...(typeof revision === "number" ? { sourceGraphRevision: revision } : {}) }));
    const words = await withProjectPartStores(ports.pool, adaptation.projectId, async (stores) => {
      const part = await stores.parts.getPart(partId);
      const newest = part ? await stores.parts.getVersion(partId, part.latestVersion) : undefined;
      return newest ? newest.card as { name?: string; purpose?: string } : undefined;
    });
    if (!words || "ok" in words) return [];
    const saved = await keepProjectPart({ pool: ports.pool, ports: ports.library }, { projectId: adaptation.projectId, flowId: adaptation.flowId, subflowId, ...(words.name ? { name: words.name } : {}), ...(words.purpose ? { purpose: words.purpose } : {}) });
    return [{ partLibrary: JSON.parse(JSON.stringify(saved)) as JsonObject }];
  } catch {
    return [{ partLibrary: { saved: false, code: "parts.save_failed", message: "FluxIQ could not save the new version of this part just now." } }];
  }
}

/** The Subflow a change is written to: the part it replaces, or the Subflow its adaptation names. */
function subflowOfChange(adaptation: AutomationStudioFlowAdaptation, patch: Change): string | undefined {
  const after = isJsonRecord(patch.after) ? patch.after : {};
  const unit = isJsonRecord(after.unit) ? after.unit : undefined;
  return patch.kind === "replace_unit" && unit?.kind === "part" && typeof unit.subflowId === "string" ? unit.subflowId : adaptation.subflowId;
}
