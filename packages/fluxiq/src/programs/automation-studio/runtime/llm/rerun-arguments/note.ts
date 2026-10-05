import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioRerunArgumentMetadata } from "./metadata.ts";
import type { AutomationStudioRerunAttempt } from "./attempt.ts";

/** A failed/refused rerun's merge provenance; successful checks need no failed note. */
export function automationStudioRerunArgumentNote(metadata: AutomationStudioRerunArgumentMetadata, attempt: AutomationStudioRerunAttempt): JsonObject | undefined {
  if (attempt.kind === "accepted" || !metadata.paths.length) return undefined;
  const first = metadata.paths[0]!;
  const inner = first.reduceRight<JsonValue>((value, key) => ({ [key]: value }), null);
  const removal = metadata.parameters ? { parameters: inner } : inner;
  return {
    code: "llm_evidence_loop.rerun_kept_keys", step: metadata.step, attempt: { ...attempt },
    kept: metadata.paths.map((path) => path.join(".")), removal,
    instruction: "The rerun patch was merged over this step's authored argument. Keys omitted inside the objects you patched remain present; these paths identify retained keys, not necessarily the cause of the failure. To remove an unneeded key, explicitly write null at its position, as in removal; required parameters still need a valid value. Nothing was corrected or executed by this note."
  };
}
