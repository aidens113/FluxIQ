// In a directory that builds values for an external wire contract, every
// property is written by name. No property arrives through a spread.
//
// Why. TypeScript's excess-property ("freshness") check runs on the properties
// an object literal writes out. It does not run on the properties a spread
// brings in. So this compiles clean, and the field simply stops arriving:
//
//   const item: DialogEvidence = { selector, ...(label ? { titel: label } : {}) };
//
// while the same mistake written by name is caught:
//
//   const item: DialogEvidence = { selector, titel: label };
//   //                                       ^ TS2353: 'titel' does not exist
//
// That silence is what let a producer rename a contract field three separate
// times in the FluxIQ web-extension repository with every type check, unit
// suite and build green -- the value is dropped on the wire and nothing says
// so. 46 conditional spreads across two producers were removed to close it,
// and nothing mechanically stopped the 47th until this rule.
//
// What counts as a spread of a "fresh" value. Anything whose properties the
// compiler has not already checked against the contract:
//
//   ...(cond ? { label } : {})     a conditional -- the original defect
//   ...(cond && { label })         the same thing spelled with &&
//   ...{ label }                   an inline literal
//   ...boundsOrNone(bounds)        a call whose return type restates contract keys
//   ...(value as Contract)         a cast, which is how a restatement gets in
//
// What is allowed, and why it is genuinely safe. Spreading a *named* value --
// an identifier, `this`, or a property/element access rooted at one:
//
//   const merged: Snapshot = { ...topSnapshot, interactiveElements: merged };
//
// Every key the literal writes out beside the spread is still excess-property
// checked (verified: `{ ...whole, selektor: v }` is TS2561), and every key the
// spread brings in came from a value the compiler already typed as the
// contract, so a rename moves both sides at once. This is copy-with-override,
// not property laundering, and banning it would make the rule unsatisfiable in
// exactly the file the rule exists to protect.
//
// The hole this leaves, stated rather than hidden. Naming a fresh value first
// and spreading the name --
//
//   const extra = cond ? { titel: label } : {};
//   const item: DialogEvidence = { selector, ...extra };
//
// -- is silent to both the compiler and this rule. A syntactic audit cannot see
// it; only a type-aware pass could. It is a longer way to write the defect than
// the one the rule blocks, and the surviving `present<T>()` seam in the
// configured directories makes it read against the grain, but it is not closed.
//
// Scope. Configured per repository in structure-audit/config.mjs as
// `contractSpreadPaths`, because an object spread is idiomatic and harmless
// almost everywhere; a repository-wide ban would be wrong. Each entry is a
// directory prefix or a single file, and carries the `reason` it is configured
// and the `remedy` a developer in that path should reach for, both of which go
// into the message. A path is configured only once it is clean: the finding is
// ratcheted like every other rule's, and `--update` never adds an entry, so a
// dirty path stays red until it is fixed rather than being recorded.

export const id = "contract-spread";
export const title = "Wire-contract values are built key by key, not by spread";

// The spread of a value the compiler has already named and typed: an
// identifier, `this`, or an access chain rooted at one. Parentheses and `!`
// are transparent; a call, cast, literal, conditional or anything else is a
// fresh value whose properties nothing has checked.
function isNamedValue(ts, node) {
  let expression = node;
  while (ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)) {
    expression = expression.expression;
  }
  if (ts.isIdentifier(expression) || expression.kind === ts.SyntaxKind.ThisKeyword) return true;
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return isNamedValue(ts, expression.expression);
  }
  return false;
}

// The longest configured path containing the file, so a single file may carry
// a narrower reason than the directory it sits in.
function entryFor(paths, file) {
  let best;
  for (const entry of paths) {
    if (file !== entry.path && !file.startsWith(`${entry.path}/`)) continue;
    if (!best || entry.path.length > best.path.length) best = entry;
  }
  return best;
}

function offendingLines(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const lines = [];
  const visit = (node) => {
    if (ts.isSpreadAssignment(node) && !isNamedValue(ts, node.expression)) {
      lines.push(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return lines;
}

export function run(ctx) {
  const paths = ctx.CONFIG.contractSpreadPaths ?? [];
  if (paths.length === 0) return [];

  const findings = [];
  for (const file of ctx.scriptFiles) {
    const normalized = ctx.normalize(file);
    const entry = entryFor(paths, normalized);
    if (!entry) continue;
    const lines = offendingLines(ctx, normalized);
    if (lines.length === 0) continue;

    const subject = lines.length === 1
      ? `1 property spread into an object literal, at line ${lines[0]}`
      : `${lines.length} properties spread into object literals, at lines ${lines.join(", ")}`;
    const reason = entry.reason ?? "this path builds values for an external wire contract";
    const remedy = entry.remedy ?? "Write each field by name.";
    findings.push({
      rule: id,
      key: normalized,
      value: lines.length,
      limit: 0,
      path: normalized,
      line: lines[0],
      message: `${normalized}: ${subject}. Here ${reason}, and TypeScript runs no excess-property check on a property that arrives through a spread, so a renamed or deleted contract field leaves the wire with every gate green. ${remedy} Spreading a named value of the same type -- \`{ ...snapshot, one: change }\` -- is allowed and still checked; a conditional, a call or a literal is not.`,
      severity: "fail",
      ratchet: true
    });
  }
  return findings;
}
