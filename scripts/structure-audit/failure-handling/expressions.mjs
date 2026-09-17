// Expression-level questions the failure-handling rules ask of a TypeScript
// AST: what an expression is once its parentheses and type assertions are
// removed, whether it is an empty or absent value, whether it rejects, and
// whether a subtree contains something without entering nested functions.

const EMPTY_COLLECTIONS = new Set(["Map", "Set", "WeakMap", "WeakSet", "Array"]);
const EMPTY_FACTORY = /^empty(?:[A-Z_0-9]|$)/;

export function unwrap(ts, node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current)
    || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current))) {
    current = current.expression;
  }
  return current;
}

const isFunctionLike = (ts, node) => ts.isFunctionLike(node) || ts.isClassLike(node);
export const isInlineFunction = (ts, node) => Boolean(node) && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));

// `Promise.<name>(...)`: the call's arguments, or undefined for anything else.
function promiseStatic(ts, node, name) {
  const value = unwrap(ts, node);
  if (!value || !ts.isCallExpression(value)) return undefined;
  const callee = unwrap(ts, value.expression);
  const matches = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
    && callee.expression.text === "Promise" && callee.name.text === name;
  return matches ? value.arguments : undefined;
}

export const isRejection = (ts, node) => promiseStatic(ts, node, "reject") !== undefined;

// An empty value is `undefined`, `null`, `void x`, `[]`, `{}`, `""`, an object
// literal whose every property is empty, `new Map()` and its kin with no
// entries, `Promise.resolve()` of nothing or of an empty value, and a call to a
// function named `empty...`. `false` and `0` are answers, not absence.
export function isEmptyValue(ts, node) {
  const value = unwrap(ts, node);
  if (!value) return false;
  if (ts.isIdentifier(value)) return value.text === "undefined";
  if (value.kind === ts.SyntaxKind.NullKeyword || ts.isVoidExpression(value)) return true;
  if (ts.isArrayLiteralExpression(value)) return value.elements.length === 0;
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text === "";
  if (ts.isObjectLiteralExpression(value)) {
    return value.properties.every((property) => ts.isPropertyAssignment(property) && isEmptyValue(ts, property.initializer));
  }
  if (ts.isNewExpression(value)) {
    return ts.isIdentifier(value.expression) && EMPTY_COLLECTIONS.has(value.expression.text)
      && (value.arguments ?? []).every((argument) => isEmptyValue(ts, argument));
  }
  if (!ts.isCallExpression(value)) return false;
  const resolved = promiseStatic(ts, value, "resolve");
  if (resolved) return resolved.every((argument) => isEmptyValue(ts, argument));
  const callee = unwrap(ts, value.expression);
  const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
  return EMPTY_FACTORY.test(name);
}

// Whether any node under `root` satisfies `predicate`, without entering nested
// functions or classes, nor -- unless `intoCatch` -- nested catch clauses,
// which are audited on their own.
export function someOwn(ts, root, predicate, { intoCatch = false } = {}) {
  let found = false;
  const step = (node) => {
    if (found || isFunctionLike(ts, node) || (!intoCatch && ts.isCatchClause(node))) return;
    if (predicate(node)) found = true;
    else ts.forEachChild(node, step);
  };
  ts.forEachChild(root, step);
  return found;
}

// Whether `node` is one of `names`, or a property or element read from one.
export function isRootedAt(ts, node, names) {
  let current = unwrap(ts, node);
  while (current && (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))) {
    current = unwrap(ts, current.expression);
  }
  return Boolean(current) && ts.isIdentifier(current) && names.has(current.text);
}
