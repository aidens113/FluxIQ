// The page a judge's view or trail entry holds, found by its shape alone (`../../llm/view-channel/view-of.ts`: a page key
// and keyed lines, whatever member the domain puts it under), for `./page-views.ts` and `./trail-pages.ts`. Core never
// reads a line's text here.
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { automationStudioLlmPageViewOf, type AutomationStudioLlmPageView } from "../../llm/view-channel/index.ts";

/** How deep a value's members are searched for its page: a view, its wrapper (`view`), and a reading held inside a note. */
const MOST_DEPTH = 3;

/** The shallowest page `value` holds among its members, or undefined where it holds none. */
export function automationStudioJudgePageOf(value: JsonValue | undefined): AutomationStudioLlmPageView | undefined {
  let level: JsonValue[] = value === undefined ? [] : [value];
  for (let depth = 0; depth <= MOST_DEPTH && level.length; depth += 1) {
    const next: JsonValue[] = [];
    for (const each of level) {
      const page = automationStudioLlmPageViewOf(each);
      if (page !== undefined) return page;
      const held = object(each);
      if (held) next.push(...Object.values(held).filter((member) => object(member) !== undefined));
    }
    level = next;
  }
  return undefined;
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
