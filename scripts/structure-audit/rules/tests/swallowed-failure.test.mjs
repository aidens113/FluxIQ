// Unit tests for the swallowed-failure rule. The rule reaches the repository
// only through ctx, so these build a fake ctx by hand over in-memory fixtures:
// no git, no filesystem.
//
// The rule exists because a discarded `.catch(() => undefined)` or an empty
// `catch {}` turns a failed write into apparent success, and FluxIQ Core held
// dozens of them after failure-as-empty had closed the read side: a failed UI
// cache purge, a failed canonical Flow graph sync, a failed rollback. Every
// flagged form below is paired with the honest form a developer should reach
// for instead -- report the error, name the one expected failure, or say why
// losing it is acceptable.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../swallowed-failure.mjs";

function makeCtx(files) {
  const astCache = new Map();
  return {
    ts,
    CONFIG: { testRootDirNames: ["tests", "e2e"] },
    scriptFiles: Object.keys(files),
    isTestFile: (file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file),
    normalize: (file) => file,
    parse: (file) => {
      if (!astCache.has(file)) {
        astCache.set(file, ts.createSourceFile(file, files[file], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
      }
      return astCache.get(file);
    },
    dirname: (file) => path.posix.dirname(file),
    basename: (file) => path.posix.basename(file)
  };
}

const count = (source) => run(makeCtx({ "src/store.ts": source })).reduce((total, finding) => total + finding.value, 0);
const dropped = (handler) => count(`export async function save() { await write().catch(${handler}); }`);
const inCatch = (block) => count(`export function parse(text: string) { try { JSON.parse(text); } catch ${block} }`);

// --- Flagged: a discarded promise whose handler drops the failure. ---

test("an awaited, discarded .catch(() => undefined) is one ratcheted finding", () => {
  const findings = run(makeCtx({ "src/store.ts": "export async function save() {\n  await cache.purge(id).catch(() => undefined);\n}" }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "fail");
  assert.equal(findings[0].ratchet, true);
  assert.equal(findings[0].key, "src/store.ts");
  assert.equal(findings[0].value, 1);
  assert.equal(findings[0].line, 2);
});

test("every way of discarding the promise is flagged: await, void, a bare statement, parentheses, .finally", () => {
  for (const statement of ["await write().catch(() => undefined);", "void write().catch(() => {});", "write().catch(() => {});",
    "await (write().catch(() => null));", "void write().catch(() => {}).finally(() => done());", "write().catch(() => {}) as unknown;"]) {
    assert.equal(count(`export async function save() { ${statement} }`), 1, statement);
  }
});

test("a handler that ignores the error is flagged whatever it returns", () => {
  for (const handler of ["() => undefined", "() => {}", "() => null", "() => false", "() => ({ ok: false })", "(_error) => {}",
    "(error) => error", "(error) => void error", "function () { return; }", "async () => { await settle(); }", "() => setStatus(\"failed\")",
    "(error) => { setStatus(\"failed\"); }", "() => { this.failed = true; }", "(error) => { status = \"failed\"; }"]) {
    assert.equal(dropped(handler), 1, handler);
  }
});

test("then's rejection handler on a discarded chain is flagged the same way", () => {
  assert.equal(count("export function save() { void write().then((saved) => note(saved), () => undefined); }"), 1);
});

test("a chain that starts the work in the same expression is not waiting, even on a held promise", () => {
  assert.equal(count("export function save() { void this.tail.then(() => write()).catch(() => undefined); }"), 1);
  assert.equal(count("export function save() { void tail.then((value) => use(value), () => undefined); }"), 1);
});

test("a report on only one side of a guard that does not test the error is flagged", () => {
  assert.equal(dropped("(error) => { if (signal.aborted) return; log(error); }"), 1);
  assert.equal(dropped("(error) => { if (debug) console.error(error); }"), 1);
  assert.equal(dropped("(error) => verbose && log(error)"), 1);
  assert.equal(dropped("(error) => (verbose ? log(error) : undefined)"), 1);
});

test("naming the failure is not enough when nothing else is reported", () => {
  assert.equal(dropped("(error) => { if (isMissingFile(error)) return; }"), 1);
  assert.equal(dropped("(error) => (isMissingFile(error) ? undefined : null)"), 1);
});

// --- Flagged: an empty catch block. ---

test("a catch block with no statement is flagged, with or without a binding or a plain comment", () => {
  for (const block of ["{}", "{ }", "(error) {}", "{\n}", "{ /* ignore */ }", "{\n  // malformed values are oldest\n}"]) {
    assert.equal(inCatch(block), 1, block);
  }
  const findings = run(makeCtx({ "src/store.ts": "export function f() {\n  try {\n    a();\n  } catch {}\n}" }));
  assert.equal(findings[0].line, 4, "the finding points at the catch clause");
});

test("every instance in a file is counted into one finding that lists its lines", () => {
  const source = [
    "export async function a() { await write().catch(() => undefined); }",
    "export function b() { try { c(); } catch {} }",
    "export function d() { void send().catch(() => {}); try { e(); } catch { } }"
  ].join("\n");
  const findings = run(makeCtx({ "src/store.ts": source }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].value, 4);
  assert.match(findings[0].message, /4 failures are silently dropped, at lines 1, 2, 3, 3/);
});

// --- Allowed: the handler reports or propagates the failure. ---

test("a handler that reports the error to a call is allowed", () => {
  for (const handler of ["(error) => console.error(error)", "(error) => log.warn(\"purge failed\", error)", "(error) => { reject(error); }",
    "(error) => failures.push({ id, error })", "(error) => failures.push(String(error))", "async (error) => { await report(error); }",
    "(error) => void reportFailure(error)", "(error) => setState((current) => ({ ...current, error }))", "(error) => report(error).catch(() => {})"]) {
    assert.equal(dropped(handler), 0, handler);
  }
});

test("a handler that stores the error, or a value computed from it, is allowed", () => {
  assert.equal(dropped("(error) => { this.lastError = error; }"), 0);
  assert.equal(dropped("(error) => { state.message = error instanceof Error ? error.message : String(error); }"), 0);
  assert.equal(dropped("(error) => { const message = error instanceof Error ? error.message : String(error); warn(message); }"), 0);
  assert.equal(dropped("({ message }) => warn(message)"), 0);
});

test("a handler that throws or rejects is allowed", () => {
  for (const handler of ["(error) => { throw error; }", "(error) => { throw new Error(\"write failed\", { cause: error }); }",
    "() => { throw new Error(\"write failed\"); }", "(error) => Promise.reject(error)", "() => Promise.reject(new Error(\"write failed\"))"]) {
    assert.equal(dropped(handler), 0, handler);
  }
});

test("naming the one expected failure and reporting or rethrowing the rest is allowed", () => {
  for (const handler of ["(error) => { if (isMissingFile(error)) return; throw error; }",
    "(error) => { if (!String(error).includes(\"SQLITE_CONSTRAINT\")) throw error; }",
    "(error) => { if ((error as Errno).code === \"ENOENT\") { return undefined; } log(error); }",
    "(error) => { if (!isAbort(error)) log.warn(\"sync failed\", error); }",
    "(error) => (isMissingFile(error) ? undefined : Promise.reject(error))",
    "(error) => isAbort(error) || log(error)",
    "(error) => { const code = errorCode(error); if (code === \"ENOENT\") return; throw error; }"]) {
    assert.equal(dropped(handler), 0, handler);
  }
});

test("a report on every path is allowed, including inside a loop, switch or try", () => {
  assert.equal(dropped("(error) => { if (verbose) log.debug(error); else log.warn(error); }"), 0);
  assert.equal(dropped("(error) => { cleanup(); log(error); }"), 0);
  assert.equal(dropped("(error) => { switch (mode) { case 1: return; default: throw error; } }"), 0);
});

// --- Allowed: nothing is dropped that another owner does not report. ---

test("waiting for a held promise to settle is allowed", () => {
  for (const statement of ["await previous.catch(() => undefined);", "await this.tail.catch(() => undefined);",
    "void promise.catch(() => undefined);", "promise.catch(() => undefined);", "await pending[id].catch(() => {});",
    "await tail.then(() => undefined, () => undefined);", "reported.then(undefined, () => undefined);",
    "entry.catch(() => { if (this.entries.get(id) === entry) this.entries.delete(id); });"]) {
    assert.equal(count(`export async function f() { ${statement} }`), 0, statement);
  }
});

test("a promise that is kept, returned or read is not this rule's to judge", () => {
  assert.equal(count("export function f() { tail = run.catch(() => undefined); return run; }"), 0);
  assert.equal(count("export function f() { return write().catch(() => undefined); }"), 0);
  assert.equal(count("export async function f() { const rows = await load().catch(() => []); return rows; }"), 0);
  assert.equal(count("export const next = previous.catch(() => undefined).then(() => migrate());"), 0);
});

test("a handler passed by name is not opened", () => {
  assert.equal(dropped("reportSyncFailure"), 0);
  assert.equal(dropped("this.handleFailure"), 0);
});

test("a catch block with a statement is not this rule's to judge", () => {
  assert.equal(inCatch("{ return; }"), 0);
  assert.equal(inCatch("(error) { log(error); }"), 0);
});

// --- Allowed: the best-effort marker, narrowly. ---

test("a handler holding the best-effort marker with a reason is allowed", () => {
  for (const handler of ["/* best-effort: the next read rebuilds the cache */ () => undefined",
    "\n    // best-effort: the next read rebuilds the cache\n    () => undefined",
    "() => { /* best-effort: the next read rebuilds the cache */ }",
    "() => {\n  // best-effort: the next read rebuilds the cache\n}",
    "() => /* best-effort: the next read rebuilds the cache */ undefined",
    "() => undefined /* best-effort: the next read rebuilds the cache */",
    "() => {\n  /**\n   * best-effort: the next read\n   * rebuilds the cache\n   */\n}"]) {
    assert.equal(dropped(handler), 0, handler);
  }
});

test("an empty catch block holding the best-effort marker is allowed", () => {
  assert.equal(inCatch("{ /* best-effort: malformed values sort as oldest */ }"), 0);
  assert.equal(inCatch("{\n  // best-effort: malformed values sort as oldest\n}"), 0);
});

test("the marker needs its exact spelling and a reason of three words or more", () => {
  for (const comment of ["/* best-effort */", "/* best-effort: ignore */", "/* best-effort: cache only */", "/* best effort: the cache rebuilds */",
    "/* Best-Effort: the cache rebuilds */", "/* besteffort: the cache rebuilds */", "/* not best-effort: the cache rebuilds */"]) {
    assert.equal(dropped(`${comment} () => undefined`), 1, comment);
    assert.equal(inCatch(`{ ${comment} }`), 1, comment);
  }
});

test("a marker outside the handler or the catch block does not count", () => {
  assert.equal(count("export async function f() {\n  await write().catch(() => undefined); // best-effort: the next read rebuilds it\n}"), 1);
  assert.equal(count("export async function f() {\n  // best-effort: the next read rebuilds it\n  await write().catch(() => undefined);\n}"), 1);
  assert.equal(count("export function f() {\n  // best-effort: malformed values sort as oldest\n  try { a(); } catch {}\n}"), 1);
  assert.equal(count("export function f() { try { a(); } catch /* best-effort: malformed values sort as oldest */ {} }"), 1);
  assert.equal(dropped("() => { run(() => { /* best-effort: the next read rebuilds it */ }); }"), 1, "a marker in a nested function belongs to it");
});

test("a marker on one handler does not excuse another", () => {
  const source = "export async function f() { await a().catch(/* best-effort: the next read rebuilds it */ () => undefined); await b().catch(() => undefined); }";
  assert.equal(count(source), 1);
});

// --- Scope: non-test source only. ---

test("test files and everything under a test root are skipped", () => {
  const body = "export async function f() { await write().catch(() => undefined); try { a(); } catch {} }";
  const files = { "src/store.test.ts": body, "src/tests/support.ts": body, "e2e/fixture.ts": body, "src/testsuite/real.ts": body };
  assert.deepEqual(run(makeCtx(files)).map((finding) => finding.path), ["src/testsuite/real.ts"]);
});

test("a .catch-like method that is not a promise's is not a rejection handler", () => {
  assert.equal(count("export function f() { matcher.catches(() => {}); list.concat(() => null); }"), 0);
});

// --- The message has to tell a developer what to do. ---

test("the message says what to do instead", () => {
  const message = run(makeCtx({ "src/store.ts": "export async function f() { await write().catch(() => undefined); }" }))[0].message;
  assert.match(message, /1 failure is silently dropped, at line 1/);
  assert.match(message, /Let the error propagate/);
  assert.match(message, /\.catch\(\(error\) => log\.warn\("cache purge failed", error\)\)/);
  assert.match(message, /if \(isMissingFile\(error\)\) return; throw error;/);
  assert.match(message, /best-effort: <reason, three words or more>/);
});
