// The words a model or a judge uses for the work, said as a person would.
//
// Live run `run-muwansvz-a2b4a987` (R2-U-4) put them in the chat: "I'll
// describe the extract list node so I can add a step that scrapes all result
// pages", "with the extraction node to see the rows, fields and pagination",
// "The extraction already read all 5 pages", and the judge's "Step 8 kept 82
// rows from 5 pages with no filtering or dedup" beside a Flow of five steps.
// Each is said in a person's words here; generic words of reading lists, not
// any one domain's names.

/** A word that already says whose or which: "the", "its", "the draft's". */
const DETERMINER = /(?:\b(?:the|an?|this|that|its|their|his|her|my|our|your|each|every)|\b\w+'s)\s+$/iu;
/** A word before which a verb is meant: "to dedup", "then dedup". */
const VERB_BEFORE = /\b(?:to|then|must|should|will|would|can|could|also|please)\s+$/iu;
/** What a list read is called: "extract list (node)", "dom extract list", "extraction node". */
const LIST_READER = /\b(?:dom\s+)?(?:extract[\s_-]?list(?:\s+(?:nodes?|steps?|tools?))?|extraction\s+(?:nodes?|steps?|tools?))\b/giu;
/** "extraction", alone. */
const EXTRACTION = /\bextraction(s?)\b/giu;
const SCRAPE: Readonly<Record<string, string>> = { e: "read", es: "reads", ed: "read", ing: "reading" };
const PAGINATE: Readonly<Record<string, string>> = { e: "page through", es: "pages through", ed: "paged", ing: "paging through" };
/** "is deduplicated" and the like, said with "have": "has duplicates removed". */
const HAVE: Readonly<Record<string, string>> = { is: "has", are: "have", was: "had", were: "had", be: "have", been: "had", being: "having" };
/** A draft step's own number: "Step 8", "steps 3 and 4", which the person's Flow numbers its own way. */
const STEP_NUMBER = /\b([Ss])tep(s?)\s+\d+(?:\s*(?:,|and|or|to|-|–)\s*\d+)*\b/gu;

/** `said` in the case `found` opens with. */
function cased(found: string, said: string): string {
  return /^\p{Lu}/u.test(found) ? `${said.charAt(0).toUpperCase()}${said.slice(1)}` : said;
}

/** True when the words before `offset` in `text` already say whose or which. */
function determined(text: string, offset: number): boolean {
  return DETERMINER.test(text.slice(0, offset));
}

/**
 * `text` with the model's and the judge's words for the work said in a
 * person's: a list read ("extract list node", "extraction node", "the
 * extraction") is "the list reader", and bare "extraction" is "reading the
 * list"; "scrape" is "read"; "pagination" is "the result pages" and
 * "paginate" "page through"; "dedup" and "deduplicate" are "remove(s)
 * duplicates", "removing duplicates" or "with duplicates removed"; "the judge"
 * is "the check"; a "next call" is the "next step"; and a draft step's number
 * ("Step 8", "steps 3 and 4") is "a step" or "some steps", since the person's
 * Flow numbers its steps its own way.
 */
export function automationStudioActivityPersonWords(text: string): string {
  return text
    .replace(LIST_READER, (found: string, offset: number, whole: string) => cased(found, determined(whole, offset) ? "list reader" : "the list reader"))
    .replace(EXTRACTION, (found: string, plural: string, offset: number, whole: string) => cased(found, determined(whole, offset) ? `list reader${plural}` : plural ? "list reads" : "reading the list"))
    .replace(/\b([Aa])n(\s+list reader)/gu, "$1$2")
    .replace(/\bscrap(e|es|ed|ing)\b/giu, (found: string, ending: string) => cased(found, SCRAPE[ending.toLowerCase()]!))
    .replace(/\bpagination\b/giu, (found: string, offset: number, whole: string) => cased(found, determined(whole, offset) ? "result pages" : "the result pages"))
    .replace(/\bpaginat(e|es|ed|ing)\b/giu, (found: string, ending: string) => cased(found, PAGINATE[ending.toLowerCase()]!))
    .replace(/\b(is|are|was|were|be|been|being)\s+(?:de-?duplicated|deduped)\b/giu, (found: string, verb: string) => cased(found, `${HAVE[verb.toLowerCase()]!} duplicates removed`))
    .replace(/\b(?:de-?duplicated|deduped)\b/giu, (found: string) => cased(found, "with duplicates removed"))
    .replace(/\b(?:de-?duplicates|dedupes)\b/giu, (found: string) => cased(found, "removes duplicates"))
    .replace(/\bde-?duplicate\b/giu, (found: string) => cased(found, "remove duplicates"))
    .replace(/\b(?:de-?duplication|de-?duplicating|dedup(?:e|ing)?)\b/giu, (found: string, offset: number, whole: string) => cased(found, VERB_BEFORE.test(whole.slice(0, offset)) ? "remove duplicates" : "removing duplicates"))
    .replace(/\b(the|a)\s+judge('s)?\b/giu, "$1 check$2")
    .replace(/\bnext\s+(?:model\s+)?call(s?)\b/giu, "next step$1")
    .replace(STEP_NUMBER, (found: string, s: string, plural: string, offset: number, whole: string) => {
      const many = plural !== "" || /\d\s*(?:,|and|or|to|-|–)\s*\d/u.test(found);
      if (determined(whole, offset)) return `${s}tep${many ? "s" : ""}`;
      return cased(s, many ? "some steps" : "a step");
    });
}
