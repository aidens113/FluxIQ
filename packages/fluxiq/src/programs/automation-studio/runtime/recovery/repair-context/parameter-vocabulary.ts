// Core's own words for what a parameter's value is, in three kinds.
//
// `parameter-screen.ts` carries a string only where its *key* is Core's word for
// what something is, for what it is called, or for what it was compared
// against. This module is that vocabulary and the one rule that reads it. It
// sits beside the screen rather than inside it because the two are different
// things to read: the screen is a bounded recursion over JSON, and this is the
// list of words Core claims to own, with the argument for each -- an argument
// three tasks in a row have added to, until it was most of one file.
//
// **The three kinds, and what decides which one a key is.** Not the key's
// spelling. What can be written under it, and therefore where it may be
// believed:
//
// - A **classifier** says which of a declared set of things this is -- `kind`,
//   `mode`, `is`, `operator`, `handling`. Carried wherever it sits.
// - A **name** is what somebody called something -- `label`, `field`, `column`,
//   `read`. Carried only while the keys are a node definition's own declared ids
//   rather than an author's.
// - A **comparand** is what a condition tested something against -- `matches`,
//   `contains`, `expected`. Bounded exactly as a name is, and for the same
//   reason: it is a value rather than a word.
//
// `text` and `value` are in none of the three at any depth, and the line
// between them and a comparand is the one this whole module rests on. Both are
// authored Flow-document data, so "the user wrote it" cannot be what decides.
// What decides is what the position does with the value: `text` and `value` are
// where a step puts what the person supplied, to be *sent* into the page --
// their email, their card number, the answer to a security question -- while a
// comparand is a test applied to something the page had already shown. A payload
// has to sit under a key that says where it goes. That is why a relation is
// never a payload slot, and why no depth and no precedent makes `text` safe.
//
// **Why there are kinds at all, and why the depth of a key cannot decide
// alone.** Until `run-muhubegx-9469de5e` there was one list and one allowance: a
// key was Core's vocabulary in the top two levels of a parameter and the
// author's below them. That run stored 43 rows where 13 were asked for, was
// refuted for it, and the re-author that had to narrow the extraction was handed
// this:
//
//     extractList: { where: { count: 1, items: [{ read: null, is: null }] },
//                    fields: { name: { kind: null, required: true }, ... } }
//
// -- a Flow that filtered, once, on something. Every word the repair needed was
// a *declared* key and none of them was the author's: `read` names the field a
// condition reads, `is` is the comparison it made, `kind` is what a column
// reads. They were withheld because the allowance is spent by object levels,
// and a compound parameter's own declared keys always sit past it -- one
// `extractList` spends the only level there is, so a condition inside `where`
// and a field declaration inside `fields` are both out of reach before either is
// looked at.
//
// Raising the allowance does not fix that, and no setting of it can, because
// what has to be carried is not monotone in depth. `fields.price` -- two levels
// in, a column key the author invented, holding the page's own field name --
// must stay withheld, while `fields.price.kind` -- three levels in -- must come
// through. Any allowance that reaches the second reaches the first. So the
// answer came in two halves, and only one of them is here:
//
// - **A list and its items are one level, in both counters.** An author cannot
//   key a list, and an array declares the shape of its item, so a condition
//   inside `where` is keyed by the definition exactly as `where` itself is. That
//   is a rule about position rather than about words, so it is stated where it
//   is applied: `ScreenPosition` and `screenedListItem` in
//   `parameter-screen.ts`.
// - **A classifier is carried at any depth; a name and a comparand are not.**
//   That half is this module, and `CLASSIFIER_KEYS` states the property it
//   stands on.
//
// What the split does not claim is that an author cannot name a column after a
// word a node switches on. It can, and then that column's page field is carried
// where its neighbour's is not -- the same incoherence as before, now confined
// to a column spelled `kind` or `mode`, holding a value that still has to pass
// the credential screen, the locator screen and the screen's length bound. That
// is the narrowest residue this requirement admits.
//
// **Why what a condition compared *against* is carried too.** The split above
// handed `run-muhubegx-9469de5e`'s re-author the column and the comparison and
// then stopped:
//
//     where: { count: 1, items: [{ read: "column:Badge", contains: { count: 1 } }] }
//
// -- the Flow filtered the badge column on one phrase, and the phrase was
// withheld. A Flow that stored 43 rows where 13 were asked for is most likely
// wrong in exactly that phrase: a ceiling of 5 where 50 was meant, a badge word
// the page spells differently. The repair was shown the two parts of the
// condition that were probably right and refused the one that was probably
// wrong.
//
// A comparand is a value and not a word, so carrying it is a policy decision --
// and the policy was already settled one section away. `context.ts` carries
// `expectedState` whole, its `expected` text included, because authored document
// data is what the model is reasoning about; `flow-graph.ts` carries every
// router rule's condition whole for that same stated reason, and a rule's
// condition *is* a comparison target -- `{ signalPath: "page.url", operator:
// "contains", expected: "/plus" }` reaches a provider today, screened for
// locators and for nothing else. An extraction's `where` is the same kind of
// object authored on a different node, and the only reason it was treated
// differently is that the parameter screen is the one section that reads
// parameters. Withholding it there protected nothing the request as a whole was
// not already disclosing.
//
// **Why `expected` is one of them, and `operator` a classifier.** Carrying an
// extraction's comparand left one request disclosing a predicate over page text
// in one section and withholding it in another, and the difference between the
// two was which grammar the condition happened to be written in. The extraction
// grammar puts the relation in the key -- `contains: ["Sold out"]` -- while
// Core's own `AutomationCondition` puts it in a sibling and the value under
// `expected`: `{ signalPath, operator, expected }`. Same position, two
// spellings, and this vocabulary already refuses to let spelling decide, which
// is why `field_id`, `fieldId` and `FieldID` are one key.
//
// Three things make that checkable rather than a judgement call, and each is a
// property of the position:
//
// 1. **`expected` is the comparand slot by declaration.** `model/conditions.ts`
//    declares `AutomationCondition` as a `signalPath`, an `operator` drawn from
//    a closed union, and `expected` -- the right-hand side of the test named by
//    `operator`. Nothing is sent from there. A step that sends writes `text` or
//    `value`, which is the distinction stated at the top of this file.
// 2. **The screen already carried it whenever it was not a string.** A number
//    and a boolean are carried at any depth with no key consulted, so
//    `{ operator: "equals", expected: true }` -- Core's own recorded-task
//    fixtures -- has always come through intact. So the section's behaviour was
//    not "withhold the comparand" but "withhold the comparand when its author
//    wrote text", which is a property of the value's type and not of the
//    position at all.
// 3. **It is the same object, not merely the same shape.**
//    `executor/expected-transition.ts` builds a transition's `expectedState`
//    from `node.parameterValues.expectedState`, and `context.ts` puts that
//    object into `expected_transition` whole. So `parametersWithheld:
//    ["expectedState.conditions[0].expected"]` was a false claim about the
//    request it sat in: the value it named as withheld was two sections above
//    it, verbatim. The withholding list exists so that a screened parameter and
//    a parameter the step never had cannot read alike; a parameter named as
//    withheld *and carried elsewhere in the same request* breaks that from a
//    third side.
//
// This screen stays stricter than `context.ts` is with the same object, which is
// the part the precedent does not license away: `context.ts` applies the locator
// screen and nothing else, while here a credential-shaped, locator-shaped or
// over-long comparand is still refused and named, and the allowance still binds.
// Carrying `expected` narrows the disagreement between the two sections; it does
// not hand the screen's own guarantees over.
//
// `operator` joins the classifiers in the same breath, because the argument for
// `expected` names it. A comparand is believed because it sits under a relation,
// and a record that cannot show the relation cannot be checked against that
// reason. `operator` is drawn from `AutomationConditionOperator`, a closed union
// Core's own model declares, which is the definition of a classifier; `op`, the
// same word abbreviated, was already carried at any depth, so withholding
// `operator` was the spelling deciding again.
//
// `signalPath` is **not** added, and this is the residue rather than an
// argument: it is neither a classifier nor a comparand but an address into the
// run's value bag, and whether Core's state paths are names it carries is a
// question about *bindings* -- `step-parameters.ts` says a state-bound parameter
// carries its binding -- rather than about comparisons. So Core's canonical
// spelling of a condition reaches a repair as an operator and a comparand with
// its subject withheld and named, and the web domain's spelling, which names its
// subject with `kind` or `field`, reaches it whole. Deciding `signalPath` is a
// deliberate next step, not a patch to fold in here.
//
// **`handling` was added and `header` declined, for the same kind of reason.**
// `CLASSIFIER_KEYS` gives `handling`'s: a repair told the answer was missing a
// column the Flow plainly read has to be able to see that the column was
// declared `exclude`. `header` stays out because `headers` is a denied key in
// the web domain and `header` is one character from it, so a rule carrying
// `header` would sit one typo away from an Authorization value. Little is lost
// by declining it, because a condition already says which column it read, under
// `field` or `read`, and those are the author's own words.
//
// **The standard a word is admitted under.** Every addition here is justified by
// a property of the position -- what can and cannot be written there -- and
// never by a hope about the key. "It is a different key" has now been refused as
// an argument in both directions: it is what kept `header` out of the
// classifiers, and it is what stopped `expected` staying out of the comparands.

import { automationStudioEvidenceKey } from "../../llm/harness/index.ts";

/**
 * The keys whose string value is a name somebody wrote for something.
 *
 * Core cannot tell a control's label from a person's typed text by looking at
 * either, so it does not try: it reads the key. The list is short on purpose --
 * a key that is not here has its value withheld, which is the safe answer for a
 * key nobody has thought about yet -- and it is bounded by
 * `MAX_NAMED_KEY_DEPTH`, because a name is only Core's word for a name where the
 * keys are a definition's rather than an author's.
 *
 * `read` is here because a condition names the value it compares either by
 * `field`, a key of the field map, or by `read`, a field of its own -- and a
 * repair asked why an extraction kept the wrong rows has to be shown which of
 * the two the Flow used and what it pointed at. Where `read` points at a
 * selector rather than a column the locator screen still withholds it, which is
 * the same answer the screen gives a `name` that turns out to be a selector.
 */
const NAMING_KEYS: ReadonlySet<string> = new Set([
  "label", "name", "title", "caption", "heading", "placeholder", "arialabel", "accessiblename",
  "visibletext", "key", "field", "fieldid", "column", "columnid", "read"
]);

/**
 * The keys whose string value says which of a declared set of things this is.
 *
 * These are carried at any depth, and the reason is a property of the value
 * rather than a judgement about the key: a node *branches* on a classifier, and
 * it can only branch on a word its own schema declares. A page, a person's data
 * or a way to address an element cannot be hidden in one and still work, which
 * is what makes the depth of the key irrelevant here and decisive for a name.
 *
 * `handling` is here for that reason and has to be: it says whether a column is
 * included in, excluded from or reserved for encryption in the saved dataset,
 * drawn from the extraction field spec's own closed set, and it sits only ever
 * at `fields.<column>.handling` -- past the allowance, where a name would never
 * be reached. A repair told the answer was missing a column the Flow plainly
 * read has to be able to see that the column was declared `exclude`.
 *
 * `operator` is here because `AutomationConditionOperator` is a closed union
 * Core's own model declares, and because `op` -- the same word, abbreviated --
 * was already carried at any depth. It is also what makes a carried comparand
 * checkable: a comparand is believed because it sits under a relation, so the
 * relation has to be visible beside it.
 */
const CLASSIFIER_KEYS: ReadonlySet<string> = new Set([
  "kind", "mode", "op", "operator", "is", "role", "implicitrole", "tagname", "status", "type", "unit", "handling"
]);

/**
 * The keys whose value is what a condition compared something against.
 *
 * Each one names a *relation* or, in `expected`'s case, the slot a declared
 * relation tests against -- "matches any of", "contains any of", "equals", "the
 * operator's right-hand side". What sits there is a test applied to something
 * the page had already shown, never a value the step sends anywhere. A payload
 * has to sit under a key that says where it goes, which is what keeps `text` and
 * `value` out of every list here and lets these six in.
 *
 * They are bounded by `MAX_NAMED_KEY_DEPTH` as a name is, because a comparand is
 * a value rather than a word: below the allowance `matches` is a column somebody
 * invented, and its value is the page's own field name. Only the canonical
 * relations are listed. A domain's forgiving spelling of one -- `regex`, `has`,
 * `includes` and the rest of its grammar -- is a domain's vocabulary rather than
 * Core's, and an unrecognised key is withheld, which is the conservative answer
 * this whole screen gives a key nobody has thought about yet.
 *
 * `expected` is the one that is not a relation but a slot: Core's
 * `AutomationCondition` names the relation in `operator` and puts the value
 * here. The module header argues it at length, because it was carried while an
 * extraction's comparand was withheld and the two are one position in two
 * grammars.
 */
const COMPARAND_KEYS: ReadonlySet<string> = new Set([
  "equals", "matches", "contains", "startswith", "endswith", "expected"
]);

/**
 * The deepest level at which a key that carries a *value* -- a name or a
 * comparand -- is the node definition's vocabulary rather than the author's.
 */
const MAX_NAMED_KEY_DEPTH = 1;

/**
 * Whether this key, this many author-keyable levels in, is Core's own word for
 * what the value is.
 *
 * A classifier is that word wherever it sits; a name and a comparand are that
 * word only while the keys are still a definition's, because both of those carry
 * a value and only a definition's key says which kind of value it is. All three
 * are compared with separators removed, so `field_id`, `fieldId` and `FieldID`
 * are one key, as are `startsWith` and `starts_with`.
 *
 * `nameDepth` is the screen's count of the levels whose keys could be an
 * author's rather than a definition's -- the one thing about a position this
 * vocabulary needs. It is passed as a number rather than as the screen's
 * position so that the recursion's own bound stays the screen's business.
 */
export function coreVocabularyKey(key: string, nameDepth: number): boolean {
  const normalized = automationStudioEvidenceKey(key);
  if (CLASSIFIER_KEYS.has(normalized)) return true;
  if (nameDepth > MAX_NAMED_KEY_DEPTH) return false;
  return NAMING_KEYS.has(normalized) || COMPARAND_KEYS.has(normalized);
}
