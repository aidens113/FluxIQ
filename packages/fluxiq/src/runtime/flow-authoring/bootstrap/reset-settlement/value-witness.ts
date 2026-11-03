// Which shown values one act replaced (t772 value witness): a lasting press
// whose effect shows neither as a list's item nor as its own control's state --
// a choice confirmed by a button that reloads its page to the same address, a
// settings form's Save -- replaces a value the page shows. The domain reports
// every read's shown values as opaque state tokens by opaque place
// (`AutomationStudioSiteResetRead.values`), and a trial step's diff carries what
// it replaced (`values.replaced`, the web domain's
// `state-diff/places/value-replacements.ts`, the same rule as this one).
//
// A place, of those both reads around the act show, is replaced when its value
// changed and the old value is gone from the page: a value still shown
// elsewhere only moved (a list sorted again, a row inserted above others whose
// positional places now show the rows above them). `newValue` marks a
// replacement whose new value the page did not show before; without it the new
// value may have been an option's label beside it, or the place may only have
// shifted (an inline notice above it left), so it never keeps an act open
// (`./value-tracker.ts`). Pure; opaque tokens only.

/** One shown value an act replaced: its place, the value before and after it, and whether the new value was new to the page (header). */
export type AutomationStudioSiteResetValueReplacement = { place: string; from: string; to: string; newValue?: true };

/** Core's bound on one act's replaced values: an act with more has no value witness. */
const MAX_REPLACED = 256;

/** Each place in both reads whose value the act between them replaced (header), in `before`'s order; none past the bound. */
export function automationStudioSiteResetValueReplacements(before: Readonly<Record<string, string>>, after: Readonly<Record<string, string>>): AutomationStudioSiteResetValueReplacement[] {
  const was = tally(before), now = tally(after);
  const replaced: AutomationStudioSiteResetValueReplacement[] = [];
  for (const [place, from] of Object.entries(before)) {
    const to = after[place];
    if (to === undefined || to === from || (now.get(from) ?? 0) >= (was.get(from) ?? 0)) continue;
    replaced.push({ place, from, to, ...((now.get(to) ?? 0) > (was.get(to) ?? 0) ? { newValue: true as const } : {}) });
  }
  return replaced.length > MAX_REPLACED ? [] : replaced;
}

/** How many places show each value. */
function tally(values: Readonly<Record<string, string>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of Object.values(values)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
