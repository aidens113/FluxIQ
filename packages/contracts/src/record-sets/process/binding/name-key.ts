// How a written field name is compared with a field's label when a declaration is bound (t999).
//
// A declaration may name a column by the site's detected key (`brightaisle_plus`, `data-ad-id`) where the retained
// schema labels that column in the page's own words ("Brightaisle Plus"). So, in binding only, `_` and `-` separate
// words as spaces do, and case and runs of separators are ignored. Cell values are never compared this way: a
// `contains` over text holding `_` still needs the `_` (`../cell-text.ts`, `foldedText`, is unchanged).

/** The key a written name and a label are matched by: `_` and `-` read as spaces, separators collapsed, ends trimmed, lower case. */
export function automationStudioRecordBindingNameKey(name: string): string {
  return name.replace(/[_\-\s]+/gu, " ").trim().toLowerCase();
}
