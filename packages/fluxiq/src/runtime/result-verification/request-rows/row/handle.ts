// A stored row's handle, so rows that share a label are cited apart (t1087).
//
// **Why.** Live run `run-mwz2jc4w-0c207128` (kestrel auctions): two stored rows held one title, and the judge, with only the
// title to name them by, wrote "title (ends Mon 21 Sep 15:35)" and "title (ends Mon 21 Sep 23:05)". Neither is a row's label,
// so Core refused the yes, and the judge was asked again at about $0.25 (twice in one run: the first attempt paid it too).
// A row's label alone cannot tell rows apart that share it, and the position the rules also accept is the judge's own count.
//
// **What it is.** Where two or more stored rows share a label, each is given the label and its rank among them, in the order
// the rows are held: `<label> #1`, `<label> #2`. A row whose label no other row has needs none and has none. Labels are
// compared as a citation compares them (`fold`), so a label that differs only in case, spacing or a closing stop is shared.
// The judge's copy shows the handle on such a row (`../summary/with/row-handles.ts`) and a citation by it is read as that
// row (`../../cited-yes/citation-refuted.ts`); a citation by the label as written is still read as it was.

/** Where a handle's rank starts: a space, `#`, and a whole positive number, at the end of the text. */
const RANK = /^(.*\S)\s+#(\d+)$/u;

export const AutomationStudioRequestRowHandle = Object.freeze({
  /** A label as labels are compared: lower case, each run of spaces one, no closing stop. */
  fold(text: string): string {
    return text.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
  },

  /** The handle of each row, by its label and in the rows' order (header): `undefined` for a row whose label no other row shares. */
  of(labels: readonly string[]): Array<string | undefined> {
    const total = new Map<string, number>();
    for (const label of labels) total.set(AutomationStudioRequestRowHandle.fold(label), (total.get(AutomationStudioRequestRowHandle.fold(label)) ?? 0) + 1);
    const seen = new Map<string, number>();
    return labels.map((label) => {
      const key = AutomationStudioRequestRowHandle.fold(label);
      if ((total.get(key) ?? 0) < 2 || key === "") return undefined;
      const rank = (seen.get(key) ?? 0) + 1;
      seen.set(key, rank);
      return `${label.trim()} #${rank}`;
    });
  },

  /** A text read as a handle: the label before the rank, and the rank; nothing where the text ends in no rank. */
  read(text: string): { label: string; rank: number } | undefined {
    const match = RANK.exec(text.trim());
    const rank = match ? Number(match[2]) : 0;
    return match && Number.isSafeInteger(rank) && rank >= 1 ? { label: match[1]!, rank } : undefined;
  }
});
