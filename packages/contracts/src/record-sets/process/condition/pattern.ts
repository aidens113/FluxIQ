// The regular expression a `matches` or a derive's `pattern` names, read once
// for everything that judges one: the processing parser, the run-end
// conditions (`holds.ts`), a derived column (`../derive.ts`) and a downstream
// domain's own reading of a condition, which imports it. A pattern therefore
// means the same rows wherever it is judged.
//
// **The flavour is JavaScript's.** A bare source ignores case; `/source/flags`
// says what it says, `g` and `y` accepted and dropped because they carry state
// between rows.
//
// **A leading inline flag group is read as its flags (t1070).** Run
// `run-mwyg0x66-4d561a42` wrote `(?i)^...` fourteen times. That is PCRE's way
// of saying "ignore case", JavaScript refuses it as an invalid group, and the
// refusal named no part, so the model never learnt why. A leading `(?i)`,
// `(?m)` or `(?s)`, or any mix of the three, means the JavaScript flag of the
// same letter, so it is read as that flag (after a leading `^` too, where it
// means the same). An `ignoreCase` key was the other choice; it was not taken,
// because a bare source already ignores case and `/source/i` already exists, so
// it would add a third way to say one thing. Other inline groups and a group
// further in are refused, and the refusal says so.
//
// **A refused pattern says why** (`reason`), naming the rule it broke and
// quoting only the JavaScript parser's own reason, never the pattern: a pattern
// is a value the model wrote and may carry page text.

/** The longest pattern a condition or derive may carry. */
export const AUTOMATION_STUDIO_RECORD_PATTERN_CHARACTERS = 200;

/** Flags a `/pattern/flags` form may name; `g` and `y` are accepted and dropped, since they carry state between rows. */
const PATTERN_FLAGS = "dimsuv";
const STATEFUL_FLAGS = "gy";
const DELIMITED_PATTERN = /^\/(.+)\/([a-z]*)$/su;
/** A leading inline flag group, after a leading `^` or not (header). */
const LEADING_INLINE_FLAGS = /^(\^?)\(\?([A-Za-z]+)\)/u;
/** The inline flags JavaScript has a flag of the same meaning for. */
const INLINE_FLAGS = "ims";
/** An inline flag group or scoped modifier anywhere: `(?i)`, `(?-i)`, `(?i:`. */
const INLINE_GROUP = /\(\?[A-Za-z-]+[):]/u;
/** V8's wording: the source and flags, then the reason. */
const V8_MESSAGE = /^Invalid regular expression: \/[\s\S]*\/[a-z]*: ([^\n]+)$/u;

/** A pattern read: the expression it runs, or why it cannot run. */
export type AutomationStudioRecordConditionPatternReading = { ok: true; pattern: RegExp } | { ok: false; reason: string };

/** The regular expression `written` names, or why it names none (header). */
export function readAutomationStudioRecordConditionPattern(written: string): AutomationStudioRecordConditionPatternReading {
  if (written.length === 0) return refused("empty");
  if (written.length > AUTOMATION_STUDIO_RECORD_PATTERN_CHARACTERS) {
    return refused(`${written.length} characters, over the ${AUTOMATION_STUDIO_RECORD_PATTERN_CHARACTERS} a pattern may have. Write a list of shorter patterns instead, which keeps a row when any one matches (with not: true, leaves it out); plain words to look for may be a contains list.`);
  }
  const delimited = DELIMITED_PATTERN.exec(written);
  const body = delimited?.[1] ?? written;
  const asked = delimited?.[2] ?? "";
  const unknown = [...asked].filter((flag) => !PATTERN_FLAGS.includes(flag) && !STATEFUL_FLAGS.includes(flag));
  if (unknown.length) return refused(`names the flag ${unknown.join("")}, which JavaScript has not; a /source/flags pattern takes ${PATTERN_FLAGS} (and g and y, which are dropped).`);
  let source = body;
  let flags = delimited === null ? "i" : [...asked].filter((flag) => !STATEFUL_FLAGS.includes(flag)).join("");
  const inline = LEADING_INLINE_FLAGS.exec(body);
  if (inline) {
    const letters = inline[2]!;
    const foreign = [...new Set([...letters].filter((flag) => !INLINE_FLAGS.includes(flag)))];
    if (foreign.length) return refused(`starts with the inline flag group (?${letters}), and only (?i), (?m) and (?s) have a JavaScript flag; ${foreign.join("")} has none.`);
    source = `${inline[1]}${body.slice(inline[0].length)}`;
    flags = [...new Set(`${flags}${letters}`)].join("");
  }
  try {
    return { ok: true, pattern: new RegExp(source, flags) };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const said = parserReason(error.message, source);
    const hint = INLINE_GROUP.test(source) ? " JavaScript reads no inline flag group inside a pattern: a leading (?i), (?m) or (?s) is read as that flag, and a bare pattern already ignores case." : "";
    return refused(`not a valid JavaScript regular expression${said === undefined ? "" : ` (${said})`}.${hint}`);
  }
}

/** The JavaScript parser's own reason, never the pattern it quotes (header). */
function parserReason(message: string, source: string): string | undefined {
  const v8 = V8_MESSAGE.exec(message);
  if (v8) return v8[1];
  return message.includes(source) || message.trim() === "" ? undefined : message.trim();
}

function refused(reason: string): AutomationStudioRecordConditionPatternReading {
  return { ok: false, reason };
}
