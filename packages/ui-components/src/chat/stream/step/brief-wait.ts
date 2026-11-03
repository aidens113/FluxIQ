// A brief the supervisor dispatched whose builder has not started: it waits.
//
// The supervisor dispatches the briefs of a plan together, and a part that
// starts where another ends waits for that one to pass before its builder
// runs. Its card read "Building Add pickup items to cart ... / Allowance $0.08"
// beside the builder still working on the part before it, as if two builders
// were at work and its money were being spent, and that brief never ran (A8
// frozen pair 3, `run-mv9zn5ob-d929084d`, screenshot 00004, t649). Until its
// own builder's first event it says it waits, by the names of the parts it
// waits for ("Add pickup items to cart waits for Switch pickup store"): those
// Core's card names it starting after (`after`) that are still out
// (`project-message.ts`), or, from an older Core that names none, the one
// brief still out; else it waits for its turn. Its allowance is said once
// the builder starts. No DOM.

import type { ActivityProjectCard } from "fluxiq/ui";
import type { ProjectWords } from "./project-words.ts";

type Brief = Extract<ActivityProjectCard, { kind: "brief" }>;

/** `words`, the brief `card`'s words while it runs, said while it waits for the parts named `after` (or its turn, for none). */
export function waitingBriefWords(words: ProjectWords, card: Brief, after: readonly string[] | undefined): ProjectWords {
  const named = after === undefined || after.length === 0 ? undefined : after.length === 1 ? after[0]! : `${after.slice(0, -1).join(", ")} and ${after.at(-1)!}`;
  const waits = named === undefined ? "waits for its turn" : `waits for ${named}`;
  const subject = card.brief === "reset" ? "The site's reset" : card.subflowName;
  return {
    title: card.purpose && card.brief !== "reset" ? `${subject} ${waits}: ${card.purpose}` : `${subject} ${waits}`,
    text: words.text,
    card: { ...words.card, outcome: named === undefined ? "Waits for its turn" : `Waits for ${named}`, state: "settled" }
  };
}
