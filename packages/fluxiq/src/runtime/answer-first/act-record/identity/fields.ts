// A value as its own fields, for a digest (plan D6, `design.md` "Row identity").
//
// The engine leaves out what a read mints the same way
// (`engine/automation/lifecycle-run/act-identity.ts`, `MINTED_FIELD`): a key that
// starts with `$` or names a handle or evidence reference is made afresh each time
// a list is read, and a row read again must still be the row it was. That module
// keeps its reader private and the engine is not this lane's to change, so the rule
// is written again here.
//
// **Two more readings than the engine needs (the web domain's real answers).** It
// compares one run's rows with themselves. This compares a row a model was shown
// with the same row a pass carries, and a read shows a model its links written from
// the page's origin while its carried rows hold them whole
// (`node-run/shown-rows/links.ts`). So an address is read as its path. And a value
// assembly reads back from text may come back as a number
// (`flow-bootstrap/authoring/values.ts`), so a scalar is read as its words.

/** A key a read mints afresh. */
const MINTED_FIELD = /^\$|handle|evidence/iu;

const ADDRESS = /^[a-z][a-z\d+.-]*:\/\/[^/?#]+(?<rest>[/?#].*)?$/iu;

/** A value's fields without what a read mints, every scalar as its words and every address as its path. */
export function automationStudioAttemptActOwnFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(automationStudioAttemptActOwnFields);
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const fields: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) if (!MINTED_FIELD.test(key)) fields[key] = automationStudioAttemptActOwnFields(item);
    return fields;
  }
  const words = String(value).trim();
  const address = ADDRESS.exec(words);
  return address ? address.groups?.rest ?? "/" : words;
}
