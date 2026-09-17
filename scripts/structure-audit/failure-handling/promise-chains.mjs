// Where a promise chain's value goes: which method a call is, whether a
// handler gives its promise a value, whether a chain only settles, and whether
// its result is thrown away.

import { isEmptyValue, isInlineFunction, someOwn, unwrap } from "./expressions.mjs";

// The callee of `<receiver>.<name>(...)`, or undefined for any other call.
export function promiseMethod(ts, call, name) {
  const callee = unwrap(ts, call.expression);
  return ts.isPropertyAccessExpression(callee) && callee.name.text === name ? callee : undefined;
}

// Whether a function's block body returns a non-empty value anywhere,
// including inside its catch clauses.
export const returnsAValue = (ts, fn) => Boolean(fn?.body) && ts.isBlock(fn.body) && someOwn(ts, fn.body,
  (node) => ts.isReturnStatement(node) && Boolean(node.expression) && !isEmptyValue(ts, node.expression), { intoCatch: true });

// Whether a fulfilment handler gives its promise no value: an empty
// expression body, or a block that never returns a value.
export function yieldsNoValue(ts, handler) {
  const fn = unwrap(ts, handler);
  if (!isInlineFunction(ts, fn)) return false;
  return ts.isBlock(fn.body) ? !returnsAValue(ts, fn) : isEmptyValue(ts, fn.body);
}

// A settled promise carries no value either way when the chain's fulfilment
// side gives none, so turning its failure into nothing reads nothing: the
// queue-tail idioms `tail.then(() => undefined, () => undefined)` and
// `tail = tail.then(async () => { ... }).catch(() => undefined)`. The same
// holds when the result is only passed on to a `.then` that takes no value:
// `previous.catch(() => undefined).then(() => next())`.
export function onlySettles(ts, call, method) {
  if (method === "then") return yieldsNoValue(ts, call.arguments[0]);
  const receiver = unwrap(ts, promiseMethod(ts, call, "catch").expression);
  if (ts.isCallExpression(receiver) && promiseMethod(ts, receiver, "then") && yieldsNoValue(ts, receiver.arguments[0])) return true;
  let node = call;
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  const access = node.parent;
  if (!ts.isPropertyAccessExpression(access) || access.expression !== node || access.name.text !== "then") return false;
  const next = access.parent;
  const onFulfilled = ts.isCallExpression(next) && next.expression === access ? unwrap(ts, next.arguments[0]) : undefined;
  return isInlineFunction(ts, onFulfilled) && onFulfilled.parameters.length === 0;
}

// `node.finally(...)`, which settles to the same value as `node`: the call,
// or undefined when `node` is not the receiver of a `.finally`.
function finallyOn(ts, node) {
  const access = node.parent;
  if (!ts.isPropertyAccessExpression(access) || access.expression !== node || access.name.text !== "finally") return undefined;
  return ts.isCallExpression(access.parent) && access.parent.expression === access ? access.parent : undefined;
}

// Whether a call's result is thrown away: an expression statement, optionally
// under `await`, `void`, parentheses, a type assertion or a `.finally(...)`.
export function isDiscarded(ts, call) {
  let node = call;
  for (;;) {
    const parent = node.parent;
    if (ts.isParenthesizedExpression(parent) || ts.isAwaitExpression(parent) || ts.isAsExpression(parent) || ts.isNonNullExpression(parent)) {
      node = parent;
    } else if (finallyOn(ts, node)) {
      node = finallyOn(ts, node);
    } else {
      return ts.isExpressionStatement(parent) || ts.isVoidExpression(parent);
    }
  }
}
