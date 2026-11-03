// A step in the words a person uses. An older Core named its steps by tool and
// node ids ("Using core.run_node", "Result: web.inspect.succeeded"); the chat
// never shows one of those. A title Core (or the background) already wrote in
// words is kept -- a tool's too: Core names what a call does and on what
// ("Clicking “No thanks”", "Reading the details of “Colour”"), and reading the
// call's result code instead turned each of those into "Looked at the page" or
// "Worked on the page" (t193, `run-muqiojz4-04a7a8fc`). Only a title that is
// an id reads as what its tool did, in the present while it is under way and
// in the past once it is done; an id nobody mapped reads as "Used a tool"
// rather than as the id. Result codes and lists of issue codes are dropped,
// since the step's mark already says whether it worked. No DOM.

import type { ClientGatewayActivity } from "fluxiq/ui";

type ActivityDetail = NonNullable<ClientGatewayActivity["detail"]>;

/** A step's title and Core's sentence under it, both in words; `text` is undefined when there is none worth showing. */
export type StepWords = { title: string; text: string | undefined };

type Tense = { now: string; done: string; failed?: string };

const TOOLS: Readonly<Record<string, Tense>> = {
  // The completion check reads whether a proposed Flow is finished; it never checks a result.
  // "The result didn't pass its check" headed "Sent back because some steps weren't written in a
  // way the Flow can run" (run-mux74k5q-1c3c2127 UI review).
  "core.completion_check": { now: "Checking the Flow is finished", done: "Checked the Flow is finished", failed: "The Flow isn't finished yet" },
  "core.dry_run": { now: "Trying the automation", done: "Tried the automation" },
  "core.dry_run.page": { now: "Trying the automation on the page", done: "Tried the automation on the page" },
  // Core heads an edit "Changing the Flow", and the overlay says the same (D12 of the t342 round 2 UI review).
  "core.flow_draft": { now: "Changing the Flow", done: "Changed the Flow" },
  "demo.look": { now: "Looking at the page", done: "Looked at the page" },
  "web.detect_repeating_structure": { now: "Finding the repeating items on the page", done: "Found the repeating items on the page" },
  "web.dom.capture_snapshot": { now: "Looking at the page", done: "Looked at the page" },
  "web.inspect_current_page": { now: "Looking at the page", done: "Looked at the page" }
};

/** What `core.run_node` did, by the action word in its result code (`web.<action>.<result>`). */
const PAGE_ACTIONS: ReadonlyArray<[RegExp, Tense]> = [
  [/inspect|capture|snapshot|look|observe/u, { now: "Looking at the page", done: "Looked at the page" }],
  [/navigate|goto|open/u, { now: "Opening a page", done: "Opened a page" }],
  [/click|press|tap/u, { now: "Clicking on the page", done: "Clicked on the page" }],
  [/type|fill|input|clear/u, { now: "Typing on the page", done: "Typed on the page" }],
  [/select|choose/u, { now: "Choosing an option", done: "Chose an option" }],
  [/scroll/u, { now: "Scrolling the page", done: "Scrolled the page" }],
  [/extract|list|read|collect/u, { now: "Reading data from the page", done: "Read data from the page" }],
  [/wait/u, { now: "Waiting for the page", done: "Waited for the page" }]
];
const PAGE_ACTION: Tense = { now: "Working on the page", done: "Worked on the page" };

/** Titles Core writes in words, turned to the tense the step is in. */
const TITLES: Readonly<Record<string, Tense>> = {
  // A decision that failed decided nothing: it read "Decided the next step — The AI model's reply
  // couldn't be read or used" (lane C, run-mv0fuotv-805294d7, defect 6). Core heads one it asks for
  // again "Asking the AI model again" itself (t378 W4), kept as written; its own failed "Deciding
  // the next step" is a decision that stopped, so it is not said as asked again either.
  "deciding the next step": { now: "Deciding the next step", done: "Decided the next step", failed: "Deciding the next step" },
  "amending the draft flow": TOOLS["core.flow_draft"]!,
  "completion check": TOOLS["core.completion_check"]!,
  "build started": { now: "Started building", done: "Started building" },
  "build finished": { now: "Finished building", done: "Finished building" },
  "build failed": { now: "The build failed", done: "The build failed" }
};

const UNKNOWN_TOOL: Tense = { now: "Using a tool", done: "Used a tool" };
/** A dotted id such as `core.run_node` or `web.inspect.succeeded`, anywhere in a sentence. */
const RAW_ID = /\b[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+\b/u;
/**
 * A sentence that is only codes: "Result: web.inspect.succeeded", "a.b, c.d",
 * or the observer's record "Result: web.click.succeeded · Node: web.output.dom-click".
 */
const ONLY_CODES = /^(?:[a-z]+:\s*)?[a-z0-9-]*[._][a-z0-9_.-]+(?:\s*[,·]\s*(?:[a-z]+:\s*)?[a-z0-9-]*[._][a-z0-9_.-]+)*$/iu;

/** `detail` in words; `step` is the run step it came from, when it did. */
export function stepWords(detail: ActivityDetail, step?: ClientGatewayActivity["step"]): StepWords {
  const status = detail.status;
  return { title: title(detail, step, status), text: text(detail.text) };
}

function title(detail: ActivityDetail, step: ClientGatewayActivity["step"], status: ActivityDetail["status"]): string {
  const ref = detail.ref?.trim().toLowerCase();
  const plain = detail.title.trim();
  if (detail.kind === "step" && step !== undefined) {
    const label = step.label?.trim() || (RAW_ID.test(plain) || plain === detail.ref ? "" : plain);
    return label ? `Step ${step.index}: ${label}` : `Step ${step.index}`;
  }
  const known = TITLES[plain.toLowerCase()];
  if (known) return tense(known, status);
  const said = plain !== "" && !RAW_ID.test(plain) && !/^using\s/iu.test(plain);
  if (detail.kind === "tool" && ref !== undefined && !said) {
    if (ref === "core.run_node") return tense(pageAction(detail.text), status);
    const tool = TOOLS[ref];
    if (tool) return tense(tool, status);
  }
  if (plain !== "" && !RAW_ID.test(plain)) return plain;
  const named = /^using\s+([a-z0-9_.-]+)/iu.exec(plain)?.[1]?.toLowerCase();
  if (named === "core.run_node") return tense(pageAction(detail.text), status);
  if (named !== undefined && TOOLS[named]) return tense(TOOLS[named]!, status);
  return tense(UNKNOWN_TOOL, status);
}

function pageAction(text: string | undefined): Tense {
  const code = /([a-z0-9_]+(?:\.[a-z0-9_]+)+)/iu.exec(text ?? "")?.[1]?.toLowerCase();
  const action = code?.split(".").slice(0, -1).join(".") ?? "";
  return PAGE_ACTIONS.find(([pattern]) => pattern.test(action))?.[1] ?? PAGE_ACTION;
}

function tense(words: Tense, status: ActivityDetail["status"]): string {
  if (status === "started") return words.now;
  if (status === "failed" && words.failed) return words.failed;
  return words.done;
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || ONLY_CODES.test(trimmed)) return undefined;
  return trimmed;
}
