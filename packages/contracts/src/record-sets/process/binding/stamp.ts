import type { AutomationStudioRecordSchema } from "../../schema.ts";
import { parseAutomationStudioRecordProcessingDeclaration, type AutomationStudioRecordProcessingDeclaration } from "../declaration/index.ts";
import { bindAutomationStudioRecordProcessing } from "./bind.ts";
import type { AutomationStudioRecordProcessingBinding } from "./result.ts";

/** The caller supplies framework digest/revision; only actual binding results supply the stored provenance map. */
export function stampAutomationStudioRecordProcessing(value: unknown, schema: AutomationStudioRecordSchema, provenance: Pick<AutomationStudioRecordProcessingDeclaration, "source" | "revision">): AutomationStudioRecordProcessingBinding {
  const bound = bindAutomationStudioRecordProcessing(value, schema);
  if (!bound.ok) return bound;
  const declaration = parseAutomationStudioRecordProcessingDeclaration({ version: 1, source: provenance.source, revision: provenance.revision, bindings: bound.bindings }, schema);
  if (!declaration) return { ok: false, issues: ["record_output.process_invalid_declaration"], unresolved: [] };
  return { ...bound, processing: { ...bound.processing, declaration } };
}
