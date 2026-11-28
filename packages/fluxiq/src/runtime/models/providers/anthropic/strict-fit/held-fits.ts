// The strict set this process holds for each exact offer of tools the platform refused for its grammar (t1093).
//
// **Why remembered.** Prompt caching is a prefix match and tools render first, so every request of one offer must send
// the same bytes; and a compiled grammar is cached by the platform only while its schemas stay the same (the
// structured-outputs page, "Grammar compilation and caching"). Once a refused offer has been narrowed until the
// platform accepted it, every later request of that offer is built with that strict set from the start, and pays no
// second refusal.
//
// **A set, not a list of demotions.** A tool demoted frees part of the counted budget (`../grammar.ts`), and counting
// alone would then hand that budget to the next tool in the offer: the panel's `project_amend_plan`, as large as the
// `project_write_plan` demoted before it, would turn strict and be refused in its turn. So once an offer is refused,
// only tools the refused request already sent strict can stay strict; the held set only ever narrows.
//
// **Only refused offers are held.** An offer the platform accepts as counted (`../decision-tools-wire.ts`) is never
// written here, so this holds one entry per offer that was refused -- a handful per process -- and nothing is ever
// dropped from it: a set that was forgotten would be refused, and narrowed, again.

const HELD = new Map<string, ReadonlySet<string>>();

/** The process's memory of the strict set each refused offer is sent with, by the offer's digest (`./tools-digest.ts`). */
export const AUTOMATION_STUDIO_ANTHROPIC_STRICT_FITS = Object.freeze({
  /** The only tools that may go strict for the offer `digest`; `undefined` for an offer that was never refused. */
  strict(digest: string): ReadonlySet<string> | undefined {
    return HELD.get(digest);
  },
  /** Holds the offer `digest` to `names`, within what it already held: the set never widens. */
  narrow(digest: string, names: Iterable<string>): void {
    const held = HELD.get(digest);
    HELD.set(digest, new Set([...names].filter((name) => held === undefined || held.has(name))));
  },
  /** Forgets every held set. For tests only: a running process never forgets an accepted fit. */
  forgetForTests(): void {
    HELD.clear();
  }
});
