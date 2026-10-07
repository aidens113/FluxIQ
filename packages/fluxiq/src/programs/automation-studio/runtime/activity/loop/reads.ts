import { activityActionVerb } from "../../../../../ui/index.ts";

/**
 * Whether a node reads from the page, told by the verb its definition id
 * names, the way the wording reads it (`../wording/action.ts`): the first word
 * of the id's last segment that names a verb ("web.output.dom-extract_list" is
 * `dom`, `extract`: a read). Generic verbs only, so no domain's id is written
 * here.
 */
export function automationStudioActivityReads(definitionId: string | undefined): boolean {
  if (typeof definitionId !== "string") return false;
  const words = (definitionId.split(".").at(-1) ?? "").toLowerCase().split(/[-_\s]+/u).filter(Boolean);
  for (const word of words) {
    const verb = activityActionVerb(word);
    if (verb) return verb.kind === "read" && verb.verb !== "describe";
  }
  return false;
}
