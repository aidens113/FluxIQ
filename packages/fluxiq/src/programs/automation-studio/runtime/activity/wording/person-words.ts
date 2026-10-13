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
/**
 * A list's handle, by the list read's name for it: "the detected extraction
 * handle" read "the detected reading the list handle" (R3-U-10, live run
 * `run-mux6naez-6c20f26e`). It is said as the list it names.
 */
const LIST_HANDLE = /\b(?:dom\s+)?(?:extract[\s_-]?list|extraction)\s+handles?\b/giu;
/**
 * A control's handle, after the word for the control: "the quantity field
 * handle", "the current quantity input handle" (R4a, `run-mv2nlh9l-52e476da`,
 * moment 07). The control is said alone.
 */
const CONTROL_HANDLE = /\b(element|control|field|input|box|button|link|checkbox|dropdown|menu|option|swatch|chip|tab|row|target)\s+handle(s?)\b/giu;
/**
 * A handle, as a noun after a word that says which: "the handle", "a fresh
 * handle", "its handles". Said as the control on the page. "handle" as a verb
 * ("to handle the popup") follows none of these words and is left alone.
 */
const HANDLE_NOUN = /\b(the|a|this|that|its|their|each|every|new|fresh|current|stale|old|older|newer|latest|valid|same|right|correct|exact|another|other|which)\s+handle(s?)\b/giu;
/** "handle id(s)", "handle ref(s)": said as the control on the page. */
const HANDLE_ID = /\bhandle\s+(?:ids?|refs?|references?|tokens?)\b/giu;
/**
 * Sending a Flow again, which the model calls resubmitting: "before
 * resubmitting", "I drop that optional step and resubmit the Flow" (R4a,
 * moment 05 and 07). Said as sending it again, with what it sends when the
 * sentence names it ("send the Flow again", "send it again").
 */
const RESUBMIT = /\bre-?submi(t|ts|tted|tting)\b(?:\s+((?:the|this|that|its|my|our|a)\s+(?:[\w-]+(?:'s)?\s+)?(?:flow|plan|script|fix|change|changes|version|steps?)\b|it|them))?/giu;
const SEND: Readonly<Record<string, string>> = { t: "send", ts: "sends", tted: "sent", tting: "sending" };
/** "a resubmission", "the resubmission": a Flow sent again. */
const RESUBMISSION = /\bre-?submission(s?)\b/giu;

/** "extraction", alone. */
const EXTRACTION = /\bextraction(s?)\b/giu;
const SCRAPE: Readonly<Record<string, string>> = { e: "read", es: "reads", ed: "read", ing: "reading" };
const PAGINATE: Readonly<Record<string, string>> = { e: "page through", es: "pages through", ed: "paged", ing: "paging through" };
/** "is deduplicated" and the like, said with "have": "has duplicates removed". */
const HAVE: Readonly<Record<string, string>> = { is: "has", are: "have", was: "had", were: "had", be: "have", been: "had", being: "having" };
/**
 * A candidate's revision number, with what names it: "revision 2", "rev 7",
 * "(revision 3)", "revisions 4 and 5", "r7" never (too short to tell from a
 * word). The person never sees a revision: "Testing the submitted Flow
 * revision 2" reached the chat (t362, `run-muyrpbnk-fef374e7`).
 */
const REVISION = /\s*\(?\b(?:rev(?:ision)?s?\.?)\s*#?\d+(?:\s*(?:,|and|or|to|-|–)\s*#?\d+)*\)?/giu;
/** The noun a revision number numbers, when it follows one: "the Flow revision 2", "candidate (revision 3)". */
const REVISION_NOUN = /\b(?:flows?|plans?|scripts?|drafts?|candidates?|versions?)\s*\(?$/iu;
/**
 * A revision named as a part "of" the Flow: "Testing revision 3 of the Flow,
 * which ..." lost only its number and read "Testing of the Flow, which ..."
 * (round 12, lanes B and D). Said as the Flow it is part of: "Testing the Flow".
 */
const REVISION_OF = /\b(?:rev(?:ision)?\.?)\s*#?\d+\s+of\s+(the|this|that|your|my|our|its)\b/giu;
/** What a candidate is to the person: the Flow. "the candidate", "this candidate Flow", "candidate's steps". */
const CANDIDATE = /\bcandidate(s?)('s)?(?:\s+(?:flow|plan|script)s?\b)?/giu;
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
 * Flow numbers its steps its own way. A candidate is "the Flow", and its
 * revision number is left out (t362). A control's handle is the control ("the
 * quantity field", "the current control"), and resubmitting is sending it
 * again ("send the Flow again"), never the model's words (R4a).
 */
export function automationStudioActivityPersonWords(text: string): string {
  return text
    .replace(REVISION_OF, (found: string, owner: string, offset: number, whole: string) => (determined(whole, offset) ? found : cased(found, owner.toLowerCase())))
    .replace(REVISION, (found: string, offset: number, whole: string) => {
      // Left out only after the noun it numbers ("the Flow revision 2"). Anywhere
      // else the sentence needs a noun there: as its subject, after a preposition,
      // or as a verb's object. "Testing revision 3, which keeps ..." read "Testing,
      // which keeps ..." (C1 of round 15, `run-mv6eq0m8-3fe9dc47`); it is "Testing
      // this version, which keeps ...". After a word that already says which ("the
      // latest revision 4") it is the version alone.
      const before = whole.slice(0, offset);
      const space = /^\s/u.test(found) && before ? " " : "";
      if (/(?:^|[.!?;:]\s*)$/u.test(before)) return `${space}${/[;:]\s*$/u.test(before) ? "this" : "This"} version`;
      if (REVISION_NOUN.test(before.trimEnd())) return "";
      if (DETERMINER.test(`${before.trimEnd()} `) || /\b(?:the|an?|this|that|its|their|my|our|your)\s+[\w-]+\s*$/iu.test(before)) return `${space}version`;
      return `${space}this version`;
    })
    // A revision with no number is a version to the person: "test the new revision" (C2 of round 15).
    .replace(/\brevision(s?)\b/giu, (found: string, plural: string) => cased(found, `version${plural}`))
    .replace(CANDIDATE, (found: string, plural: string, owner: string | undefined, offset: number, whole: string) => cased(found, `${determined(whole, offset) ? "" : "the "}Flow${plural}${owner ?? ""}`))
    .replace(LIST_HANDLE, (found: string) => cased(found, "list"))
    .replace(CONTROL_HANDLE, (found: string, control: string, plural: string) => `${control}${plural}`)
    .replace(HANDLE_ID, (found: string) => cased(found, "control"))
    .replace(HANDLE_NOUN, (found: string, which: string, plural: string) => `${which} control${plural}`)
    .replace(RESUBMIT, (found: string, ending: string, object: string | undefined) => cased(found, `${SEND[ending.toLowerCase()]!} ${object ?? "it"} again`))
    .replace(RESUBMISSION, (found: string, plural: string, offset: number, whole: string) => cased(found, determined(whole, offset) ? `Flow sent again` : plural ? "Flows sent again" : "sending it again"))
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
