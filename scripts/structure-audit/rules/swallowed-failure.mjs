// A failure is never silently dropped.
//
// Why. `await cache.purge(id).catch(() => undefined)` and `try { ... } catch {}`
// turn a failed write or side effect into apparent success: nothing fails,
// nothing is logged, and the next reader acts on state that was never written.
// failure-as-empty catches the failures that become an answer; this rule
// catches the ones that vanish because nobody reads the result.
//
// What is counted, in non-test source (test files and anything under a test
// root directory are skipped):
//
//   await work().catch(() => undefined);    a discarded promise -- an expression
//   void work().catch(() => {});            statement, optionally under `await`
//   work().catch((error) => {});            or `void` -- whose inline rejection
//   void work().then(use, () => {});        handler neither reports nor
//                                           propagates the failure
//   try { ... } catch {}                    a catch block with no statement,
//   try { ... } catch (error) { }           with or without a binding
//
// A handler reports or propagates the failure when every path through it
// throws, returns `Promise.reject(...)`, calls something that is passed the
// error (`log.warn("purge failed", error)`, `reject(error)`,
// `failures.push({ id, error })`), or stores it (`this.lastError = error`).
// A value computed from the error -- `const message = String(error)` -- carries
// it. A path that does none of these drops the failure, except as below.
//
// What is allowed.
//
//   1. Naming the one expected failure and reporting or rethrowing the rest.
//      An `if`, `?:`, `&&` or `||` whose condition tests the caught error (the
//      test failure-as-empty uses) may leave one side silent when the other
//      side reports or propagates:
//
//        .catch((error) => { if (isMissingFile(error)) return; throw error; })
//        .catch((error) => { if (!isAbort(error)) log.warn("sync failed", error); })
//        .catch((error) => (isMissingFile(error) ? undefined : Promise.reject(error)))
//
//   2. Waiting for a held promise to settle. A discarded `.catch` or
//      `.then(noValue, handler)` directly on a promise held in a name or a
//      property -- `await this.tail.catch(() => undefined)` -- only waits for
//      work someone else started and owns; its failure is that owner's to
//      report. A chain that starts the work in the same expression
//      (`await purge().catch(...)`, `void tail.then(write).catch(...)`) is
//      not waiting, it is dropping. A queue tail that is kept rather than
//      discarded (`tail = run.catch(() => undefined)`) is not counted at all.
//
//   3. A best-effort call that says so. A handler, or an empty catch block,
//      holding the marker comment
//
//        .catch(/* best-effort: <reason> */ () => undefined)
//        .catch(() => { // best-effort: <reason>
//        })
//        catch { /* best-effort: <reason> */ }
//
//      is not counted. The comment must start `best-effort:` and give a reason
//      of at least three words saying why losing the failure is acceptable,
//      and it must sit inside the handler (including just before it, within
//      the call's parentheses) or inside the catch block's braces. A comment
//      after the call, or above the `try`, does not count.
//
//   4. A handler passed by name -- `.catch(reportSyncFailure)` -- is not
//      opened; its body is audited where it is written.
//
// The holes, stated rather than hidden. The audit is syntactic. It does not
// see a named handler that ignores its argument (`.catch(noop)`), a catch
// block that has statements but ignores the error (`catch { return false; }`
// -- see failure-as-empty for the empty-answer case), a guard's polarity
// (`if (isAbort(error)) log(error);` passes), a report inside a loop, switch
// or try that runs on only some paths, or a held promise whose owner never
// reads it. Existing instances are baselined per file and may only shrink.

import {
  isDiscarded, isInlineFunction, isRejection, nonTestScripts, promiseMethod, someOwn, testsError, unwrap, yieldsNoValue
} from "../failure-handling/index.mjs";

export const id = "swallowed-failure";
export const title = "A failure is never silently dropped";

const MARKER = /^best-effort:\s*([\s\S]*)$/;
const MARKER_REASON_WORDS = 3;

// --- The marker. ---

function commentBody(ts, text, range) {
  const raw = text.slice(range.pos, range.end);
  const body = range.kind === ts.SyntaxKind.SingleLineCommentTrivia ? raw.slice(2) : raw.slice(2, -2);
  return body.replace(/^[\s*]+/, "").replace(/\n[\t ]*\*?/g, " ").trim();
}

function isMarker(ts, text, range) {
  const match = MARKER.exec(commentBody(ts, text, range));
  return Boolean(match) && (match[1].match(/\S+/g) ?? []).length >= MARKER_REASON_WORDS;
}

// Every comment in the trivia at `pos`: the same-line comments the compiler
// calls trailing, and the ones after a line break it calls leading.
function commentsAt(ts, text, pos) {
  return [...(ts.getTrailingCommentRanges(text, pos) ?? []), ...(ts.getLeadingCommentRanges(text, pos) ?? [])];
}

// Whether a marker sits inside `root`: in the trivia before or after any of
// its nodes, or before a block's closing brace, without entering functions
// nested inside it.
function hasMarker(ts, sourceFile, root) {
  const text = sourceFile.text;
  const positions = [];
  const visit = (node) => {
    positions.push(node.pos, node.end);
    if (ts.isBlock(node)) positions.push(node.statements.end);
    ts.forEachChild(node, (child) => (ts.isFunctionLike(child) || ts.isClassLike(child) ? positions.push(child.pos) : visit(child)));
  };
  visit(root);
  return positions.some((pos) => commentsAt(ts, text, pos).some((range) => isMarker(ts, text, range)));
}

function hasBlockMarker(ts, sourceFile, block) {
  return commentsAt(ts, sourceFile.text, block.statements.end).some((range) => isMarker(ts, sourceFile.text, range));
}

// --- Which names carry the caught error. ---

function isReference(ts, identifier) {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent) || ts.isVariableDeclaration(parent)
    || ts.isParameter(parent) || ts.isBindingElement(parent) || ts.isMethodDeclaration(parent)) {
    return parent.name !== identifier && parent.propertyName !== identifier;
  }
  return true;
}

function references(ts, root, names) {
  if (names.size === 0) return false;
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isIdentifier(node) && names.has(node.text) && isReference(ts, node)) found = true;
    else ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function bindNames(ts, binding, names) {
  if (!binding) return;
  if (ts.isIdentifier(binding)) names.add(binding.text);
  else for (const element of binding.elements ?? []) if (!ts.isOmittedExpression(element)) bindNames(ts, element.name, names);
}

// The caught error's names, plus every local declared from a value that
// refers to one of them.
function carriers(ts, body, binding) {
  const names = new Set();
  bindNames(ts, binding, names);
  if (names.size === 0) return names;
  someOwn(ts, body, (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && references(ts, node.initializer, names)) bindNames(ts, node.name, names);
    return false;
  });
  return names;
}

// --- Whether a handler reports or propagates the failure on every path. ---

const LOGICAL = new Set(["&&", "||", "??"]);
const ASSIGNMENT = new Set(["=", "||=", "&&=", "??="]);

function stripped(ts, node) {
  let current = unwrap(ts, node);
  while (current && (ts.isAwaitExpression(current) || ts.isVoidExpression(current))) current = unwrap(ts, current.expression);
  return current;
}

function expressionHandles(ts, expression, names) {
  const node = stripped(ts, expression);
  if (!node) return false;
  if (isRejection(ts, node)) return true;
  if (ts.isConditionalExpression(node)) {
    return eitherSide(ts, node.condition, expressionHandles(ts, node.whenTrue, names), expressionHandles(ts, node.whenFalse, names), names);
  }
  if (ts.isCallExpression(node)) {
    if (node.arguments.some((argument) => references(ts, argument, names))) return true;
    const callee = unwrap(ts, node.expression);
    return (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) && expressionHandles(ts, callee.expression, names);
  }
  if (!ts.isBinaryExpression(node)) return false;
  const operator = ts.tokenToString(node.operatorToken.kind);
  // The right side of a logical operator runs on one outcome of the left.
  if (LOGICAL.has(operator)) return testsError(ts, node.left, names) && expressionHandles(ts, node.right, names);
  if (operator === ",") return expressionHandles(ts, node.left, names) || expressionHandles(ts, node.right, names);
  return ASSIGNMENT.has(operator) && references(ts, node.right, names);
}

// Both sides handle, or the condition names the failure and one side does.
function eitherSide(ts, condition, first, second, names) {
  return (first && second) || ((first || second) && testsError(ts, condition, names));
}

// Whether every path from `statement` on handles; `next` is the answer for
// the paths that continue past it.
function statementHandles(ts, statement, names, next) {
  if (!statement) return next;
  if (ts.isThrowStatement(statement)) return true;
  if (ts.isReturnStatement(statement)) return Boolean(statement.expression) && expressionHandles(ts, statement.expression, names);
  if (ts.isExpressionStatement(statement)) return expressionHandles(ts, statement.expression, names) || next;
  if (ts.isBlock(statement)) return listHandles(ts, statement.statements, names, next);
  if (ts.isIfStatement(statement)) {
    const whenTrue = statementHandles(ts, statement.thenStatement, names, next);
    return eitherSide(ts, statement.expression, whenTrue, statementHandles(ts, statement.elseStatement, names, next), names);
  }
  if (ts.isVariableStatement(statement) || ts.isEmptyStatement(statement)) return next;
  // A loop, switch, try or label: counted when it throws or reports anywhere.
  const reports = someOwn(ts, statement, (node) => ts.isThrowStatement(node)
    || (ts.isCallExpression(node) && node.arguments.some((argument) => references(ts, argument, names))), { intoCatch: true });
  return reports || next;
}

function listHandles(ts, statements, names, fallThrough) {
  let result = fallThrough;
  for (let index = statements.length - 1; index >= 0; index -= 1) result = statementHandles(ts, statements[index], names, result);
  return result;
}

function dropsFailure(ts, fn) {
  const names = carriers(ts, fn.body, fn.parameters[0]?.name);
  return ts.isBlock(fn.body) ? !listHandles(ts, fn.body.statements, names, false) : !expressionHandles(ts, fn.body, names);
}

// --- Which rejection handlers are examined. ---

const isHeld = (ts, node) => {
  const value = unwrap(ts, node);
  return ts.isIdentifier(value) || ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)
    || value.kind === ts.SyntaxKind.ThisKeyword;
};

const isAbsent = (ts, node) => {
  const value = unwrap(ts, node);
  return !value || (ts.isIdentifier(value) && value.text === "undefined") || value.kind === ts.SyntaxKind.NullKeyword;
};

// Waiting for a held promise to settle: `.catch(h)`, `.then(undefined, h)` or
// `.then(noValue, h)` directly on a name or a property.
function waitsOnHeldPromise(ts, call, method) {
  const callee = unwrap(ts, call.expression);
  const onFulfilled = call.arguments[0];
  return isHeld(ts, callee.expression) && (method === "catch" || isAbsent(ts, onFulfilled) || yieldsNoValue(ts, onFulfilled));
}

// The inline rejection handler of a discarded `.catch(handler)` or
// `.then(_, handler)`, unless the chain waits on a held promise.
function discardedHandler(ts, call) {
  const method = promiseMethod(ts, call, "catch") ? "catch" : promiseMethod(ts, call, "then") ? "then" : undefined;
  if (!method) return undefined;
  const fn = unwrap(ts, call.arguments[method === "catch" ? 0 : 1]);
  if (!isInlineFunction(ts, fn) || !isDiscarded(ts, call) || waitsOnHeldPromise(ts, call, method)) return undefined;
  return fn;
}

function offendingLines(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const lines = [];
  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const visit = (node) => {
    const handler = ts.isCallExpression(node) ? discardedHandler(ts, node) : undefined;
    if (handler && dropsFailure(ts, handler) && !hasMarker(ts, sourceFile, handler)) lines.push(lineOf(handler));
    if (ts.isCatchClause(node) && node.block.statements.length === 0 && !hasBlockMarker(ts, sourceFile, node.block)) lines.push(lineOf(node));
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return lines.sort((a, b) => a - b);
}

export function run(ctx) {
  const findings = [];
  for (const normalized of nonTestScripts(ctx)) {
    const lines = offendingLines(ctx, normalized);
    if (lines.length === 0) continue;

    const subject = lines.length === 1
      ? `1 failure is silently dropped, at line ${lines[0]}`
      : `${lines.length} failures are silently dropped, at lines ${lines.join(", ")}`;
    findings.push({
      rule: id,
      key: normalized,
      value: lines.length,
      limit: 0,
      path: normalized,
      line: lines[0],
      message: `${normalized}: ${subject}. A discarded \`.catch(() => undefined)\` or an empty \`catch {}\` turns a failed write or side effect into apparent success: nothing fails, nothing is logged, and the next reader acts on state that was never written. Let the error propagate; or report it: \`.catch((error) => log.warn("cache purge failed", error))\`; or name the one expected failure and rethrow the rest: \`.catch((error) => { if (isMissingFile(error)) return; throw error; })\`. When losing the failure really is acceptable, say why inside the handler or the catch block: \`.catch(/* best-effort: <reason, three words or more> */ () => undefined)\`, \`catch { /* best-effort: <reason> */ }\`.`,
      severity: "fail",
      ratchet: true
    });
  }
  return findings;
}
