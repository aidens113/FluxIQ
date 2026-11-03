// The declared view keys, grouped by where in a result each view lives.
//
// A domain declares the keys of a result that are a view the next one replaces
// (`../context-window.ts`). A plain name is a key of the result itself -- the
// web domain's page. A name with one dot, `holder.member`, is a key of the
// object the result holds under `holder` -- the web domain's `read.extracted`,
// the rows a read returned (t194 w48). Each holder is its own kind of view: a
// read's rows are replaced only by the next read's rows, never by a page, and
// a page only by the next page.
//
// A name with more than one dot, or with an empty side, is not a view key and
// is ignored here; the registry refuses it outright
// (`../harness-options/registry.ts`).

/** One kind of view: its members, under `holder` or, without one, at the top of the result. */
export type AutomationStudioLlmEvidenceViewGroup = { holder?: string; members: readonly string[] };

/** The groups of `keys`, the result's own first, then each holder in the order it was first declared. */
export function automationStudioLlmEvidenceViewGroups(keys: readonly string[]): AutomationStudioLlmEvidenceViewGroup[] {
  const top: string[] = [];
  const held = new Map<string, string[]>();
  for (const key of keys) {
    const parts = key.split(".");
    if (parts.some((part) => part === "")) continue;
    if (parts.length === 1) {
      if (!top.includes(key)) top.push(key);
      continue;
    }
    if (parts.length !== 2) continue;
    const [holder, member] = parts as [string, string];
    const members = held.get(holder) ?? [];
    if (!members.includes(member)) members.push(member);
    held.set(holder, members);
  }
  return [
    ...(top.length ? [{ members: top }] : []),
    ...[...held].map(([holder, members]) => ({ holder, members }))
  ];
}
