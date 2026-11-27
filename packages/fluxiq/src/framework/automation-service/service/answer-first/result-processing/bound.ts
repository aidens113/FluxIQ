import { stampAutomationStudioRecordProcessing, type AutomationStudioRecordProcessingAliases, type AutomationStudioRecordProcessingBinding, type AutomationStudioRecordSchema, type AutomationStudioRecordSortType } from "@fluxiq/contracts/automation";
import type { AutomationStudioAnswerFirstProcessingDeclaration } from "./declaration.ts";

/** Bind only actual schema evidence, stamp framework provenance, and make typed sorting deterministic where metadata supplies the type. */
export function automationStudioAnswerFirstBoundProcessing(raw: unknown, schema: AutomationStudioRecordSchema, declaration: AutomationStudioAnswerFirstProcessingDeclaration, aliases?: AutomationStudioRecordProcessingAliases): AutomationStudioRecordProcessingBinding {
  // `aliases`: the other names the framework knows for stored fields (`../result-feed/column-names.ts`, t1074).
  const bound = stampAutomationStudioRecordProcessing(raw, schema, declaration, aliases);
  if (!bound.ok || !bound.processing.sort) return bound;
  const sort = bound.processing.sort.map((key) => {
    if (key.as !== undefined && key.as !== "auto") return key;
    const field = schema.fields.find((field) => field.id === key.field);
    const derived = bound.processing.derive?.find((field) => field.id === key.field);
    let as: AutomationStudioRecordSortType | undefined = derived?.as;
    if (field) {
      const semantic = field.semanticType;
      as = semantic === "number" || semantic === "currency" || semantic === "count" || field.valueType === "number" ? "number"
        : semantic === "date" || semantic === "datetime" || field.valueType === "datetime" ? "date"
        : semantic !== undefined || field.mark !== undefined || field.valueType === "boolean" || field.valueType === "url" ? "text" : undefined;
    }
    return as === undefined ? key : { ...key, as };
  });
  return { ...bound, processing: { ...bound.processing, sort } };
}
