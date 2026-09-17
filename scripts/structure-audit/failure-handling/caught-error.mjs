// Which names hold the caught error inside a catch block or rejection
// handler, and whether a condition tests which failure it is looking at.

import { isEmptyValue, isRootedAt, someOwn, unwrap } from "./expressions.mjs";

const EQUALITY = new Set(["===", "==", "!==", "!="]);

// The caught error's name, plus every local declared from a value read from
// it or from a call it is passed to.
export function errorNames(ts, body, binding) {
  const names = new Set();
  if (!binding || !ts.isIdentifier(binding)) return names;
  names.add(binding.text);
  someOwn(ts, body, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return false;
    const value = unwrap(ts, node.initializer);
    if (isRootedAt(ts, value, names) || (ts.isCallExpression(value) && value.arguments.some((argument) => isRootedAt(ts, argument, names)))) {
      names.add(node.name.text);
    }
    return false;
  });
  return names;
}

// Whether a condition names which failure it is looking at: a call that is
// passed the error (or a value read from it), a call on the error with an
// argument, an `instanceof` other than plain `Error`, or an equality
// comparison of a value read from the error with something non-empty.
// Truthiness of the error alone names nothing.
export function testsError(ts, condition, names) {
  const namesFailure = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(ts, node.expression);
      return node.arguments.some((argument) => isRootedAt(ts, argument, names))
        || (node.arguments.length > 0 && ts.isPropertyAccessExpression(callee) && isRootedAt(ts, callee.expression, names));
    }
    if (!ts.isBinaryExpression(node)) return false;
    if (node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) {
      const right = unwrap(ts, node.right);
      return isRootedAt(ts, node.left, names) && !(ts.isIdentifier(right) && right.text === "Error");
    }
    if (!EQUALITY.has(ts.tokenToString(node.operatorToken.kind))) return false;
    const compares = (side, other) => isRootedAt(ts, side, names) && !isEmptyValue(ts, other);
    return compares(node.left, node.right) || compares(node.right, node.left);
  };
  return names.size > 0 && (namesFailure(condition) || someOwn(ts, condition, namesFailure));
}
