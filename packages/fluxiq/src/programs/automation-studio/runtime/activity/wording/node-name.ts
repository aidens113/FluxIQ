import { activityActionVerb } from "../../../../../ui/index.ts";

/**
 * A node or tool id as the step a person knows: the words of its last segment
 * from the first one that names a verb ("web.output.dom-type" is "Type",
 * "web.output.dom-extract-list" is "Extract list"), else all of them
 * ("builtin.control.merge" is "Merge"). Nothing for an id with no words.
 */
export function automationStudioActivityNodeName(id: string): string | undefined {
  const words = (id.split(".").at(-1) ?? "").split(/[-_\s]+/u).filter(Boolean);
  const from = words.findIndex((word) => activityActionVerb(word) !== undefined);
  const said = (from < 0 ? words : words.slice(from)).join(" ").toLowerCase();
  return said ? said.charAt(0).toUpperCase() + said.slice(1) : undefined;
}
