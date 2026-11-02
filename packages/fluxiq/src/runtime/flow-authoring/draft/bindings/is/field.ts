import { INDEX } from "../index-pattern.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD } from "../row-field.ts";

export function isField(segment: string): boolean {
    return AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD.test(segment) && !INDEX.test(segment);
}
