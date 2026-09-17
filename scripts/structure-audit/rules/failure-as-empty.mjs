// A caught failure is never turned into an empty or absent value.
//
// Why. A read that fails and answers `[]`, `{}`, `null` or `undefined` gives
// its caller an answer that looks exactly like a real one. The caller cannot
// tell "there are no sessions" from "the session index could not be read",
// so it goes on to act on the wrong answer: a second adaptive run is admitted
// beside an active one, a retried request starts a duplicate run, a Flow
// listing comes back empty, a canonical Flow run skips its compilation check.
// In one day three workers found and fixed several of these in FluxIQ Core
// (commits cb9c54b, fce62f9, a719531), and each fix left more of the same
// behind. Finding them one at a time is not enforcement; this rule is.
//
// What is counted, in non-test source (test files and anything under a test
// root directory are skipped):
//
//   promise.catch(() => [])  .catch(() => ({}))  .catch(() => undefined)
//   promise.catch(() => null)  .catch(() => {})  .catch((e) => { log(e); })
//   promise.then(read, () => [])      the same, as then's rejection handler
//   try { ... } catch { return []; }  or `undefined`, `null`, `{}`
//   try { ... } catch { return; }     in a function returning a value elsewhere
//
// An empty value is `undefined`, `null`, `void x`, `[]`, `{}`, `""`, an object
// literal whose every property is empty (`{ sessions: [] }`), `new Map()` and
// its kin with no entries, `Promise.resolve()` of nothing or of an empty
// value, and a call to a function named `empty...` -- `emptyFlowSummaryIndex()`
// is how a repository spells `{}` once it has a type. `false` and `0` are
// answers, not absence, and are not counted.
//
// What is allowed.
//
//   1. Naming the one failure that really does mean "absent", and rethrowing
//      everything else. The empty exit must sit under an `if` that tests the
//      caught error, or after an `if` that tests it and throws, and the block
//      must throw somewhere:
//
//        catch (error) { if (isMissingFile(error)) return []; throw error; }
//        catch (error) { if ((error as Errno).code !== "ENOENT") throw error; return []; }
//        .catch((error) => { if (error instanceof NotFoundError) return null; throw error; })
//        .catch((error) => (isMissingFile(error) ? [] : Promise.reject(error)))
//
//      "Tests the caught error" means a call that is passed the error (or a
//      value read from it), a call on the error with an argument, an
//      `instanceof` other than plain `Error`, or an equality comparison of a
//      value read from the error. `const code = error.code` and similar
//      aliases are followed. Truthiness of the error alone names nothing.
//
//   2. A `.catch` whose result is thrown away -- an expression statement,
//      optionally under `await`, `void` or a `.finally(...)`. Nothing is read
//      from it; whether dropping the failure is acceptable is the
//      swallowed-failure rule's question.
//
//   3. A chain that only settles. When the fulfilment side gives the promise
//      no value, its failure turned into nothing reads nothing either -- the
//      queue-tail idioms `tail.then(() => undefined, () => undefined)` and
//      `tail = tail.then(async () => { ... }).catch(() => undefined)`, and
//      `previous.catch(() => undefined).then(() => next())`, whose next step
//      takes no value.
//
//   4. A `.catch` handler that keeps the error itself for a later reader --
//      `.catch((error) => { this.loadError = error; })` -- and so does not
//      drop it. Only its falling off the end is excused; an explicit empty
//      return beside it still counts.
//
//   5. A handler passed by name -- `.catch(ignoreMissing)` -- is not opened.
//      The name is the declaration of intent, and its body is audited where
//      it is written. It is also the way to write a best-effort side effect
//      whose promise is kept (for de-duplication, say) rather than discarded.
//
// The holes, stated rather than hidden. The audit is syntactic. It does not
// see an empty value bound to a name first (`const none = []; return none;`),
// a catch block that assigns an empty value and falls through, a `continue`
// past a failed item, a guard's polarity (`if (isMissing(e)) throw e; return
// [];` passes), or a fallback that is not empty (`.catch(() => defaults)`).
// Existing instances are baselined per file and may only shrink.

import {
  errorNames, isDiscarded, isEmptyValue, isInlineFunction, isRejection, nonTestScripts, onlySettles,
  promiseMethod, returnsAValue, someOwn, testsError, unwrap
} from "../failure-handling/index.mjs";

export const id = "failure-as-empty";
export const title = "A caught failure is never turned into an empty or absent value";

function definitelyThrows(ts, statement) {
  if (!statement) return false;
  if (ts.isThrowStatement(statement)) return true;
  if (ts.isReturnStatement(statement)) return isRejection(ts, statement.expression);
  return ts.isBlock(statement) && statement.statements.some((inner) => definitelyThrows(ts, inner));
}

function definitelyExits(ts, statement) {
  if (!statement) return false;
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
  if (ts.isBlock(statement)) return statement.statements.some((inner) => definitelyExits(ts, inner));
  if (ts.isIfStatement(statement)) return definitelyExits(ts, statement.thenStatement) && definitelyExits(ts, statement.elseStatement);
  if (!ts.isTryStatement(statement)) return false;
  return definitelyExits(ts, statement.tryBlock) && (!statement.catchClause || definitelyExits(ts, statement.catchClause.block));
}

// An empty exit at `node` inside `block` is the allowed form when the block
// throws somewhere, and the exit is either under an `if` that tests the error
// or after a top-level `if` that tests the error and throws.
function isNamedExpectedFailure(ts, block, node, names) {
  if (names.size === 0 || !someOwn(ts, block, (inner) => definitelyThrows(ts, inner))) return false;
  let topLevel = node;
  for (let current = node; current && current !== block; current = current.parent) {
    const parent = current.parent;
    if (ts.isIfStatement(parent) && current !== parent.expression && testsError(ts, parent.expression, names)) return true;
    topLevel = current;
  }
  const statements = block.statements;
  const index = node === block ? statements.length : statements.indexOf(topLevel);
  return statements.slice(0, index).some((statement) => ts.isIfStatement(statement) && !statement.elseStatement
    && testsError(ts, statement.expression, names) && definitelyThrows(ts, statement.thenStatement));
}

// The empty exits of a block: returns of an empty value, bare returns when
// `bareCounts`, and the block's own end when it can fall off it.
function emptyExits(ts, block, { bareCounts, fallThroughCounts }) {
  const exits = [];
  someOwn(ts, block, (node) => {
    if (ts.isReturnStatement(node) && (node.expression ? isEmptyValue(ts, node.expression) : bareCounts)) exits.push(node);
    return false;
  });
  if (fallThroughCounts && !block.statements.some((statement) => definitelyExits(ts, statement))) exits.push(block);
  return exits;
}

// The inline rejection handler of `.catch(handler)` or `.then(_, handler)`,
// unless the chain only settles or its result is thrown away.
function rejectionHandler(ts, call) {
  const method = promiseMethod(ts, call, "catch") ? "catch" : promiseMethod(ts, call, "then") ? "then" : undefined;
  if (!method) return undefined;
  const fn = unwrap(ts, call.arguments[method === "catch" ? 0 : 1]);
  if (!isInlineFunction(ts, fn) || isDiscarded(ts, call) || onlySettles(ts, call, method)) return undefined;
  return fn;
}

function handlerExits(ts, fn) {
  const names = errorNames(ts, fn.body, fn.parameters[0]?.name);
  if (ts.isBlock(fn.body)) {
    // Keeping the error itself -- `this.loadError = error` -- for a later
    // reader to rethrow excuses falling off the end, not an empty return.
    const kept = someOwn(ts, fn.body, (node) => ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(unwrap(ts, node.right)) && names.has(unwrap(ts, node.right).text));
    return emptyExits(ts, fn.body, { bareCounts: true, fallThroughCounts: !kept })
      .filter((exit) => !isNamedExpectedFailure(ts, fn.body, exit, names));
  }
  const body = unwrap(ts, fn.body);
  if (isEmptyValue(ts, body)) return [body];
  if (!ts.isConditionalExpression(body)) return [];
  const branches = [body.whenTrue, body.whenFalse];
  if (!branches.some((branch) => isEmptyValue(ts, branch))) return [];
  const named = testsError(ts, body.condition, names) && branches.some((branch) => isRejection(ts, branch));
  return named ? [] : [body];
}

function catchExits(ts, clause) {
  let fn = clause.parent;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  const names = errorNames(ts, clause.block, clause.variableDeclaration?.name);
  return emptyExits(ts, clause.block, { bareCounts: returnsAValue(ts, fn), fallThroughCounts: false })
    .filter((exit) => !isNamedExpectedFailure(ts, clause.block, exit, names));
}

function offendingLines(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const lines = [];
  const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const visit = (node) => {
    const handler = ts.isCallExpression(node) ? rejectionHandler(ts, node) : undefined;
    if (handler && handlerExits(ts, handler).length > 0) lines.push(lineOf(handler));
    if (ts.isCatchClause(node)) for (const exit of catchExits(ts, node)) lines.push(lineOf(exit));
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
      ? `1 caught failure is turned into an empty or absent value, at line ${lines[0]}`
      : `${lines.length} caught failures are turned into empty or absent values, at lines ${lines.join(", ")}`;
    findings.push({
      rule: id,
      key: normalized,
      value: lines.length,
      limit: 0,
      path: normalized,
      line: lines[0],
      message: `${normalized}: ${subject}. A failure read as "nothing there" is an answer no caller can tell from a real one: an empty list, a missing record, a skipped check. Let the error propagate; or fail closed with an error that says what could not be read; or, when one failure really does mean absent (a missing file), name it and rethrow the rest: \`catch (error) { if (isMissingFile(error)) return []; throw error; }\`. A queue tail that only waits for the step before it is written \`tail.then(() => undefined, () => undefined)\`, and a \`.catch\` whose result is discarded is not counted.`,
      severity: "fail",
      ratchet: true
    });
  }
  return findings;
}
