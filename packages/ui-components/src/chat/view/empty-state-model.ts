// What an empty chat says, and what it offers. The latest chat's empty thread
// is the onboarding once connected: a paragraph saying what FluxIQ does, two
// starts (describe a job, or extract data from the page without AI), the
// example prompts, and, when FluxIQ has no model key it may use, a line
// saying so. It shows only while the thread is empty, so nothing remembers a
// first run. The examples only fill the composer, so the person reads and
// edits one before anything is sent; they show only when a message could be
// sent now. An automation's empty chat asks about that automation; a
// question's empty thread offers nothing to start from. A host whose chat is
// not about a page passes its own welcome (`offers.welcome`): the empty latest
// chat, and an empty chosen thread, say that instead, with no starts, no
// concept and no examples about the page. No DOM.

import type { ConversationMode } from "../conversation/index.ts";
import type { ModelReadiness } from "../onboarding/index.ts";
import type { ChatWelcome, ChatWelcomeItem } from "../ports/index.ts";
import type { ChatTarget } from "../target.ts";

/** One of the latest chat's two starts. */
export type EmptyStart = { readonly id: "describe" | "extract"; readonly label: string };

/** The empty state's words; null when the chat is not empty. */
export type EmptyStateModel = {
  title: string;
  line: string;
  starts: readonly EmptyStart[];
  /** Says FluxIQ needs a model key, with Open FluxIQ beside it; null when it does not, or nobody knows. */
  keyLine: string | null;
  examples: readonly string[];
  /** A host's welcome lines, each with its icon; empty except in a welcome. */
  items: readonly ChatWelcomeItem[];
};

/** What FluxIQ is, in the latest chat's empty state. Its last sentence is true once Stop and Take over ship (t376). */
export const ONBOARDING_CONCEPT =
  "FluxIQ turns a job you describe on a website into an automation you can run again. "
  + "The first time, it works the job out on this page with AI and shows each step here. "
  + "After that it repeats the saved steps without AI, and if the site changes it fixes the step, checks the fix and remembers it. "
  + "You can stop it, or take over the page, at any time.";

/** Said when no model key is enabled; Extract still works, because it needs no model. */
export const MODEL_KEY_LINE = "FluxIQ needs a model key before it can build. Add one in FluxIQ.";

const LATEST_STARTS: readonly EmptyStart[] = [
  { id: "describe", label: "Describe what you want" },
  { id: "extract", label: "Extract data from this page" }
];

const LATEST_EXAMPLES: readonly string[] = [
  "Collect the name and price of every product on this page",
  "Check this page every morning and tell me what's new",
  "Fill in this form for me, and stop before sending it"
];

const AUTOMATION_EXAMPLES: readonly string[] = [
  "Run this automation now",
  "Change what this automation collects",
  "Why did the last run stop?"
];

/**
 * The empty state for a chat in `mode` showing `target`; `readiness` is what the latest chat read of the model keys.
 * Without `extract` (a host that cannot extract data from its page) the latest chat offers only "Describe what you want".
 */
export function emptyStateModel(
  mode: ConversationMode,
  target: ChatTarget,
  readiness: ModelReadiness = "unknown",
  offers: { readonly extract: boolean; readonly welcome?: ChatWelcome | undefined } = { extract: true }
): EmptyStateModel | null {
  // A question's thread that holds nothing: the question was answered and its
  // thread closed, or Core has not written it yet. It is no place to start.
  if (target.kind === "question" && mode === "empty") {
    return quiet(target.title, "There is no question waiting here now. Go back to the latest chat to carry on.");
  }
  const automation = target.kind === "automation" ? target.name.trim() || "this automation" : undefined;
  const title = automation === undefined ? "What can FluxIQ do for you?" : `Ask about ${automation}`;
  switch (mode) {
    case "empty":
      if (offers.welcome !== undefined && (target.kind === "latest" || target.kind === "thread")) {
        return {
          ...quiet(offers.welcome.title, offers.welcome.line),
          items: offers.welcome.items,
          keyLine: target.kind === "latest" && readiness === "missing" ? MODEL_KEY_LINE : null
        };
      }
      if (automation !== undefined) {
        return { ...quiet(title, "Ask for a change, a run, or why something happened. FluxIQ answers here."), examples: AUTOMATION_EXAMPLES };
      }
      // Another project's thread, opened from FluxIQ: the person came with something to ask.
      if (target.kind !== "latest") {
        return { ...quiet(title, "Describe what you want done on the page, in your own words. FluxIQ builds it and shows its work here."), examples: LATEST_EXAMPLES };
      }
      return {
        title,
        line: ONBOARDING_CONCEPT,
        starts: offers.extract ? LATEST_STARTS : LATEST_STARTS.filter((start) => start.id !== "extract"),
        keyLine: readiness === "missing" ? MODEL_KEY_LINE : null,
        examples: LATEST_EXAMPLES,
        items: []
      };
    case "offline":
      return quiet(title, "Connect to FluxIQ to start a conversation.");
    case "loading":
      return quiet("", "Loading the conversation...");
    default:
      return null;
  }
}

function quiet(title: string, line: string): EmptyStateModel {
  return { title, line, starts: [], keyLine: null, examples: [], items: [] };
}
