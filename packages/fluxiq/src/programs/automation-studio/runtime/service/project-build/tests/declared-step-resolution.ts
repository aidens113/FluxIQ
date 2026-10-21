// A stub domain's plan-node resolution, as a real domain answers it (t597): a
// step that declares a lasting act is put to the build's permission gate with
// the classes it declared, and stands unchanged when the gate permits it;
// otherwise it needs the person's permission. A step that declares nothing
// lasting stands as written. Without one, Core refuses every declared step
// (`llm/harness-options/plan-parameter-resolution.ts`), so a stub builder could
// never submit the lasting act its part asks for.
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionDeclaration, AutomationStudioActionPermissionCheck } from "../../../action-permissions/index.ts";

/** The resolver a stub binding carries (`resolvePlanNodeParameters`). */
export async function automationStudioTestDeclaredStepResolution(input: { nodeDefinitionId: string; parameters: JsonObject; permission: AutomationStudioActionPermissionCheck; declaredConsequences?: readonly AutomationStudioActionConsequence[] | undefined }, control?: AutomationStudioActionDeclaration["control"]) {
  const declared = input.declaredConsequences ?? [];
  if (!declared.length) return { status: "unchanged" as const };
  const verdict = await input.permission({ consequences: declared, control: control ?? { name: input.nodeDefinitionId, kind: "button" }, verb: "press", effect: "mutate" });
  return verdict.permitted ? { status: "unchanged" as const } : { status: "needs_permission" as const, missing: [...verdict.missing], requestId: verdict.requestId };
}
