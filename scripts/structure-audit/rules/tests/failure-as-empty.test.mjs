// Unit tests for the failure-as-empty rule. The rule reaches the repository
// only through ctx, so these build a fake ctx by hand over in-memory fixtures:
// no git, no filesystem.
//
// The rule exists because a failed read that answers `[]`, `{}`, `null` or
// `undefined` is indistinguishable from a real "nothing there", and FluxIQ Core
// shipped several of them at once: a failed session listing admitted a second
// adaptive run, a failed idempotency lookup started a duplicate, a failed flow
// index listed no Flows. Every flagged form below is paired with the allowed
// form a developer should reach for instead -- above all, naming the one
// failure that really means absent and rethrowing the rest.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../failure-as-empty.mjs";

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
const consumed = (handler) => count(`export async function read() { const rows = await load().catch(${handler}); return rows; }`);
const inCatch = (body) => count(`export async function read(): Promise<unknown> { try { return await load(); } catch (error) { ${body} } }`);

// --- Flagged: a `.catch` whose result is an empty or absent value. ---

test("a .catch turning a failure into [] is one ratcheted finding", () => {
  const findings = run(makeCtx({ "src/store.ts": "export const rows = await load().catch(() => []);" }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "fail");
  assert.equal(findings[0].ratchet, true);
  assert.equal(findings[0].key, "src/store.ts");
  assert.equal(findings[0].value, 1);
  assert.equal(findings[0].line, 1);
});

test("every spelling of an empty or absent result is flagged", () => {
  for (const handler of ["() => ({})", "() => undefined", "() => null", "() => void 0", "() => \"\"", "() => [] as Row[]"]) {
    assert.equal(consumed(handler), 1, handler);
  }
});

test("a typed empty value is flagged: an empty...() factory, an object of empties, an empty collection", () => {
  for (const handler of ["() => emptyFlowSummaryIndex()", "() => ({ sessions: [] })", "() => ({ recordings: [], cursor: undefined })",
    "() => new Map()", "() => new Set([])", "() => Promise.resolve([])", "() => Promise.resolve()"]) {
    assert.equal(consumed(handler), 1, handler);
  }
});

test("a block-bodied handler returning nothing, or falling off the end, is flagged", () => {
  for (const handler of ["function () { return []; }", "() => { return null; }", "() => {}", "(error) => { log(error); }", "() => { return; }"]) {
    assert.equal(consumed(handler), 1, handler);
  }
});

test("then's rejection handler is flagged the same way", () => {
  assert.equal(count("export const rows = await load().then((value) => parse(value), () => []);"), 1);
});

test("a conditional whose other branch is not a rejection is flagged", () => {
  assert.equal(consumed("(error) => (isMissingFile(error) ? [] : null)"), 1);
  assert.equal(consumed("() => (optional ? undefined : Promise.reject(new Error('x')))"), 1);
});

test("a queue step that goes on to use the swallowed value is flagged", () => {
  assert.equal(count("export const next = previous.catch(() => undefined).then((value) => use(value));"), 1);
});

// --- Flagged: a catch block returning an empty or absent value. ---

test("a catch block returning [], undefined, null or {} is flagged", () => {
  for (const body of ["return [];", "return undefined;", "return null;", "return {};", "log(error); return [];"]) {
    assert.equal(inCatch(body), 1, body);
  }
  assert.equal(count("export function parse(text: string) { try { return JSON.parse(text); } catch { return null; } }"), 1);
});

test("a bare return counts only in a function that returns a value elsewhere", () => {
  assert.equal(inCatch("return;"), 1);
  assert.equal(count("export async function save() { try { await write(); } catch { return; } }"), 0);
});

test("a guard that does not test the caught error does not excuse the empty exit", () => {
  assert.equal(inCatch("if (signal.aborted) throw error; return null;"), 1);
  assert.equal(inCatch("if (error) return []; throw error;"), 1, "truthiness names nothing");
  assert.equal(inCatch("if (error instanceof Error) return []; throw error;"), 1, "plain Error is every failure");
  assert.equal(inCatch("if (error === undefined) return []; throw error;"), 1);
});

test("naming the failure is not enough when nothing else is rethrown", () => {
  assert.equal(inCatch("if (isMissingFile(error)) return []; return null;"), 2);
});

test("every instance in a file is counted into one finding that lists its lines", () => {
  const source = [
    "export async function a() { return await load().catch(() => []); }",
    "export function b(text: string) { try { return JSON.parse(text); } catch { return undefined; } }",
    "export async function c() { return await load().catch(() => null); }"
  ].join("\n");
  const findings = run(makeCtx({ "src/store.ts": source }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].value, 3);
  assert.match(findings[0].message, /3 caught failures are turned into empty or absent values, at lines 1, 2, 3/);
});

test("a nested try inside a catch block is counted once, by its own catch", () => {
  assert.equal(count("export async function f() { try { return await a(); } catch { try { return await b(); } catch { return []; } } }"), 1);
});

// --- Allowed: the named expected failure, with everything else rethrown. ---

test("a catch block that names the expected failure and rethrows the rest is allowed", () => {
  assert.equal(inCatch("if (isMissingFile(error)) return []; throw error;"), 0);
  assert.equal(inCatch("if ((error as NodeJS.ErrnoException).code !== \"ENOENT\") throw error; return [];"), 0);
  assert.equal(inCatch("if (error instanceof NotFoundError) return null; throw error;"), 0);
  assert.equal(inCatch("if (error?.name === \"AbortError\") { return undefined; } throw new Error(\"read failed\", { cause: error });"), 0);
  assert.equal(inCatch("if (isNodeError(error, \"ENOENT\")) return this.empty(); throw error;"), 0);
  assert.equal(inCatch("if (error && typeof error === \"object\" && \"code\" in error && error.code === \"ENOENT\") return \"\"; throw error;"), 0);
});

test("a value read from the error into a local still names it", () => {
  assert.equal(inCatch("const code = (error as Errno).code; if (code === \"ENOENT\") return undefined; throw error;"), 0);
  assert.equal(inCatch("const code = errorCode(error); if (code !== \"ENOENT\") throw error; return [];"), 0);
});

test("a .catch handler that names the expected failure and rethrows the rest is allowed", () => {
  assert.equal(consumed("(error) => { if (isMissingFile(error)) return []; throw error; }"), 0);
  assert.equal(consumed("(error) => { if (!isMissingFile(error)) return Promise.reject(error); return []; }"), 0);
  assert.equal(consumed("(error) => { if (error.code !== \"ENOENT\") throw error; }"), 0);
  assert.equal(consumed("(error) => (isMissingFile(error) ? [] : Promise.reject(error))"), 0);
  assert.equal(consumed("(error) => (error.code !== \"ENOENT\" ? Promise.reject(error) : undefined)"), 0);
});

// --- Allowed: nothing is read from the swallowed failure. ---

test("a .catch whose result is discarded is not counted", () => {
  assert.equal(count("export async function f() { await cleanup().catch(() => undefined); }"), 0);
  assert.equal(count("export function f() { void work().catch(() => {}); promise.catch(() => null); }"), 0);
  assert.equal(count("export async function f() { await (cleanup().catch(() => [])); }"), 0);
  assert.equal(count("export function f() { void cleanup().catch(() => undefined).finally(() => done()); }"), 0);
  assert.equal(count("export const settled = cleanup().catch(() => undefined).finally(() => done());"), 1);
});

test("a queue tail that only settles is not counted", () => {
  assert.equal(count("export const tail = result.then(() => undefined, () => undefined);"), 0);
  assert.equal(count("queue.tail = queue.tail.then(async () => { await step(); }).catch(() => undefined);"), 0);
  assert.equal(count("export const next = previous.catch(() => undefined).then(() => migrate());"), 0);
  assert.equal(count("export const next = (previous.catch(() => undefined)).then(function () { return migrate(); });"), 0);
});

test("a handler that keeps the error for a later reader is allowed, but not beside an empty return", () => {
  assert.equal(count("this.loaded = this.load().catch((error: unknown) => { this.loadError = error; });"), 0);
  assert.equal(count("this.loaded = this.load().catch((error: unknown) => { this.loadError = error; return []; });"), 1);
});

test("a handler passed by name is not opened", () => {
  assert.equal(consumed("ignoreMissing"), 0);
  assert.equal(consumed("this.handleFailure"), 0);
});

test("a fallback that is an answer rather than absence is not counted", () => {
  for (const handler of ["() => false", "() => 0", "() => defaults", "() => ({ ok: false })", "(error) => { throw wrap(error); }",
    "(error) => ({ error: describe(error) })", "() => new Map(DEFAULT_ENTRIES)"]) {
    assert.equal(consumed(handler), 0, handler);
  }
  assert.equal(inCatch("return fallbackValue;"), 0);
  assert.equal(inCatch("throw new Error(\"could not read\", { cause: error });"), 0);
});

test("an empty return in a function nested inside a catch block belongs to that function", () => {
  assert.equal(inCatch("const rows = items.map(() => { return null; }); throw new Error(String(rows));"), 0);
});

test("an array spread or other call named catch-like is not a rejection handler", () => {
  assert.equal(count("export const x = matcher.catches(() => []); export const y = [].concat(() => null);"), 0);
});

// --- Scope: non-test source only. ---

test("test files and everything under a test root are skipped", () => {
  const body = "export const rows = await load().catch(() => []);";
  const files = { "src/store.test.ts": body, "src/tests/support.ts": body, "e2e/fixture.ts": body, "src/testsuite/real.ts": body };
  assert.deepEqual(run(makeCtx(files)).map((finding) => finding.path), ["src/testsuite/real.ts"]);
});

// --- The message has to tell a developer what to do. ---

test("the message says what to do instead", () => {
  const message = run(makeCtx({ "src/store.ts": "export const rows = await load().catch(() => []);" }))[0].message;
  assert.match(message, /1 caught failure is turned into an empty or absent value, at line 1/);
  assert.match(message, /Let the error propagate/);
  assert.match(message, /fail closed/);
  assert.match(message, /if \(isMissingFile\(error\)\) return \[\]; throw error;/);
  assert.match(message, /tail\.then\(\(\) => undefined, \(\) => undefined\)/);
});
