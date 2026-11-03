// Where the Flow a build is about to write starts, and why a build has to be
// told.
//
// A Flow Bootstrap explores by running the library's own nodes against the
// bound domain's live target, and the plan it proposes is assembled from the
// steps that actually ran (`authoring/assemble-draft.ts`). That is the design's
// strength and, until now, its one hole: whoever pressed build put the target
// in front of the model first, so the model never had to run the step that goes
// there, so no such step could be in the draft, so no such step could be in the
// Flow. The Flow then worked exactly once -- in the session that built it, on
// the target somebody else had opened -- and failed the first time it ran on
// its own.
//
// Measured, 2026-09-23: a seven-node Flow built from "search the store for
// wireless earbuds" held no step that reached the store and no address
// anywhere in it. Its first step was a press on a page the harness had loaded a
// moment earlier.
//
// So a build may now be told where its Flow starts, and the value travels three
// ways at once:
//
//   - to the model, in the bootstrap context it is shown, so it knows where it
//     is meant to be before it decides anything;
//   - to the bound domain, on every tool call, so the domain can refuse to do
//     anything else until the Flow has got there -- which is the enforcement,
//     and it is the same refusal the finished Flow would meet if it tried to
//     act before arriving;
//   - and therefore into the draft, because the step that got there is a step
//     that ran.
//
// **Core never parses it.** The spelling belongs to the domain: a URL for the
// web, and something else entirely for a domain with no pages. Core bounds its
// length, refuses control characters, and otherwise carries it as text.

/**
 * The longest a start location may be. Chosen for a URL with a long path and
 * query, which is the longest spelling any bound domain uses today, and bounded
 * at all because the value reaches a provider's prompt.
 */
export const AUTOMATION_STUDIO_FLOW_START_LOCATION_MAX_LENGTH = 2_048;

/**
 * The start location a request named, or `undefined` when it named none.
 *
 * Throws on a value that is present and unusable, rather than dropping it: a
 * build that silently lost its start location would explore from nowhere and
 * fail with nothing saying why.
 */
export function automationStudioFlowStartLocation(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("Flow start location must be text.");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Flow start location must not be empty.");
  if (trimmed.length > AUTOMATION_STUDIO_FLOW_START_LOCATION_MAX_LENGTH) throw new Error("Flow start location is too long.");
  // A control character in a value that reaches a prompt is either a mistake or
  // an attempt to break out of the field it is written in.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point.
  if (/[\u0000-\u001f\u007f]/u.test(trimmed)) throw new Error("Flow start location must not contain control characters.");
  return trimmed;
}
