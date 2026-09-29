// Whether a value a step was written with is about where the Flow starts.
//
// One reading, used twice: by the check, over the plan's parameters
// (`./plan-locations.ts`), and by the completion's arrival restore, over the
// draft's arguments (`./start-step.ts`). Two readings of "goes there" would be
// how a step the restore put back came to be one the check still refused.
//
// **The comparison is deliberately loose.** A build told to start at
// `https://shop.test/collections/audio` may legitimately write the step that
// goes there with the site's front page, a deeper page, or a neighbouring one,
// and refusing any of those would be refusing a Flow that runs. So a value
// counts as going there when it agrees with the start location from the first
// character for twelve characters, or for the whole start location when it is
// shorter than that. Twelve is longer than any scheme and separator a location
// begins with -- `https://` is eight -- so agreement that short is agreement
// about nothing, and agreement longer than it is about a place.
//
// Core never parses a start location (`../start-location.ts`): the spelling
// belongs to the domain, so this compares text and nothing else. Deliberately
// absent from the barrel, like the two modules that read it.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** How much of the start location a value must agree with to be about it. */
const MIN_SHARED_LOCATION_CHARACTERS = 12;

/** What one step's values are walked for: bounded, because a plan is a model's writing. */
const MAX_VALUES_PER_STEP = 64;
const MAX_VALUE_DEPTH = 6;

/** Whether any value in `values` is about where the Flow starts. */
export function automationStudioFlowBootstrapValuesCarryLocation(values: JsonObject | undefined, startLocation: string): boolean {
  const wanted = startLocation.trim().toLowerCase();
  const needed = Math.min(MIN_SHARED_LOCATION_CHARACTERS, wanted.length);
  if (!needed) return false;
  let seen = 0;
  const visit = (value: JsonValue, depth: number): boolean => {
    if (seen >= MAX_VALUES_PER_STEP || depth > MAX_VALUE_DEPTH) return false;
    if (typeof value === "string") {
      seen += 1;
      return sharedLeadingCharacters(value.trim().toLowerCase(), wanted) >= needed;
    }
    if (Array.isArray(value)) return value.some((item) => visit(item, depth + 1));
    if (typeof value === "object" && value !== null) return Object.values(value).some((item) => visit(item, depth + 1));
    return false;
  };
  return visit(values ?? {}, 0);
}

/** How many characters two texts agree on from the first. */
function sharedLeadingCharacters(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let shared = 0;
  while (shared < limit && left[shared] === right[shared]) shared += 1;
  return shared;
}
