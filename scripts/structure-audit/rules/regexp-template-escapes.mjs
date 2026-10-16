// A `new RegExp(...)` pattern never loses a regex escape to the string it is
// written in.
//
// Why. The pattern a RegExp constructor receives is a string, and the string
// literal is read first. In `new RegExp(`\b${word}\b`)` the template literal
// turns `\b` into a backspace (U+0008), so the regex looks for a control
// character and never a word boundary; `\d`, `\s`, `\w` and their capitals
// become the plain letters d, s, w, and `\.` becomes `.`, which matches any
// character. Nothing fails: the expression compiles, it just never matches,
// or matches too much. In October 2026 two Core tests (the supervisor guidance
// test and the flow-draft amendment test, fixed in t673) silently never ran
// their check because of exactly this.
//
// What is counted, in every script file the audit sees, source and tests
// alike: the first argument of `new RegExp(...)` or `RegExp(...)` (also
// `globalThis.RegExp`), when it is a string literal, a template literal, or a
// `+` concatenation of them, and its source holds a single backslash followed
// by
//
//   - `b`, which the string turns into a backspace;
//   - any other letter that is not a string escape of its own (`d D s S w W B`,
//     `p P k c` ...), which the string turns into the bare letter;
//   - a regex syntax character (`. ( ) [ ] { } * + ? ^ $ | -`), which the
//     string turns into the bare character.
//
// What is allowed. A doubled backslash (`\\b`, `\\.`) reaches the regex as one
// backslash and is the fix. A `String.raw` template is a tagged template, not a
// template literal, and keeps its backslashes. `\n`, `\t`, `\r`, `\v`, `\f`,
// `\0`, `\xHH` and `\uHHHH` become the very character the regex escape would
// match, so they are not counted. A pattern held in a variable first, or built
// by a helper, is not seen: the audit is syntactic. A finding always fails:
// there is no baseline to hide one behind.

export const id = "regexp-template-escapes";
export const title = "A RegExp pattern string never swallows a regex escape";

// Letters a string literal reads as an escape of its own. `\b` is one too, but
// the character it makes (a backspace) is not what the regex escape means.
const STRING_ESCAPE_LETTERS = new Set(["n", "r", "t", "v", "f", "x", "u"]);
const REGEX_SYNTAX = new Set([".", "(", ")", "[", "]", "{", "}", "*", "+", "?", "^", "$", "|", "-"]);
const BACKSLASH = "\\";

export function run(ctx) {
  const { ts } = ctx;
  const findings = [];
  for (const file of ctx.scriptFiles) {
    const sourceFile = ctx.parse(file);
    const normalized = ctx.normalize(file);
    const visit = (node) => {
      if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && isRegExpCallee(ts, node.expression)) {
        const [pattern] = node.arguments ?? [];
        const literals = pattern ? patternLiterals(ts, pattern) : [];
        for (const literal of literals) {
          for (const escape of swallowedEscapes(sourceFile, literal)) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(escape.position);
            const kind = ts.isStringLiteral(literal) ? "string literal" : "template literal";
            findings.push({
              rule: id, key: `${normalized}:${line + 1}:${character + 1}`, value: 1, limit: 0, path: normalized, line: line + 1,
              message: `${normalized}:${line + 1}: the RegExp pattern holds "${escape.text}", but the ${kind} reads it first and the regex receives ${escape.becomes}, so the pattern silently means something else. Double the backslash ("${BACKSLASH}${escape.text}") or write the pattern with String.raw\`...\`.`,
              severity: "fail", ratchet: false
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return findings;
}

function isRegExpCallee(ts, expression) {
  if (ts.isIdentifier(expression)) return expression.text === "RegExp";
  return ts.isPropertyAccessExpression(expression) && expression.name.text === "RegExp" && ts.isIdentifier(expression.expression) && expression.expression.text === "globalThis";
}

/** The literal pieces whose source text becomes the pattern string: a string, a template's head and spans, or the literal operands of a `+` chain. */
function patternLiterals(ts, node) {
  if (ts.isParenthesizedExpression(node)) return patternLiterals(ts, node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node];
  if (ts.isTemplateExpression(node)) return [node.head, ...node.templateSpans.map((span) => span.literal)];
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...patternLiterals(ts, node.left), ...patternLiterals(ts, node.right)];
  }
  return [];
}

/** Each single-backslash escape in the literal's source that the string itself consumes. */
function swallowedEscapes(sourceFile, literal) {
  const start = literal.getStart(sourceFile);
  const raw = sourceFile.text.slice(start, literal.getEnd());
  const escapes = [];
  for (let index = 0; index < raw.length - 1; index += 1) {
    if (raw[index] !== BACKSLASH) continue;
    const next = raw[index + 1];
    index += 1;
    const becomes = swallowedAs(next);
    if (becomes) escapes.push({ text: `${BACKSLASH}${next}`, becomes, position: start + index - 1 });
  }
  return escapes;
}

function swallowedAs(character) {
  if (character === "b") return "a backspace (U+0008), not a word boundary";
  if (/^[A-Za-z]$/.test(character) && !STRING_ESCAPE_LETTERS.has(character)) return `the plain letter "${character}"`;
  if (REGEX_SYNTAX.has(character)) return `a bare "${character}", which the regex reads as syntax`;
  return null;
}
