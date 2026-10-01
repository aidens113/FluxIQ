// A test never uses a fixed, shared temporary directory.
//
// Why. A test that writes under a fixed path -- `path.join(process.cwd(),
// ".tmp", "store-test")` or `path.join(os.tmpdir(), "store-test")` -- shares
// that directory with every other run of the same file: a second lane
// validating the same checkout, a parallel worker, a rerun started before the
// first one finished. Each run's `beforeEach` deletes the other's databases and
// each writes onto the other's data, so the file passes alone and fails when
// several suites run at once. On 2026-09-30 this was the cause of Core's
// conversation-store failures (a change-feed assertion and a stuck case), and
// 37 more Core test files had the same fixed root.
//
// What is counted, in test files and in anything under a test root directory:
// a `join` or `resolve` call (`path.join`, `path.resolve`, `path.posix.join`,
// or a bare imported `join`/`resolve`) whose first argument is a shared base
// and whose other arguments are all fixed strings:
//
//   path.join(os.tmpdir(), "store-test")                every fixed path under
//   path.resolve(tmpdir(), "a", "b")                    the system temp dir
//   path.join(process.cwd(), ".tmp", "store-test")      a path under the working
//                                                       directory whose first
//                                                       segment is tmp, .tmp,
//                                                       temp or .temp
//
// What is allowed.
//
//   1. The same call as the prefix handed to `mkdtemp` or `mkdtempSync`:
//      `mkdtemp(path.join(os.tmpdir(), "store-test-"))` is a new directory
//      every time. That is the fix for every finding.
//   2. A path with anything computed in it -- `${process.pid}`, a UUID, a
//      name built at run time -- is not a fixed string and is not counted.
//   3. Fixture files read from the working directory (`path.join(
//      process.cwd(), "fixtures", "page.html")`) are not temp roots.
//
// The holes, stated rather than hidden. The audit is syntactic: a fixed name
// assembled in a variable first, or passed through a helper, is not seen, and
// a computed name that happens to repeat across runs (`Date.now()` in two
// processes started together) passes. A finding always fails: there is no
// baseline to hide one behind.

export const id = "shared-temp-root";
export const title = "A test never uses a fixed, shared temporary directory";

const TEMP_SEGMENT = /^\.?(tmp|temp)$/i;

export function run(ctx) {
  const { ts } = ctx;
  const roots = new Set(ctx.CONFIG.testRootDirNames);
  const findings = [];
  for (const file of ctx.scriptFiles) {
    const underTestRoot = ctx.normalize(file).split("/").slice(0, -1).some((segment) => roots.has(segment));
    if (!ctx.isTestFile(file) && !underTestRoot) continue;
    const sourceFile = ctx.parse(file);
    const visit = (node) => {
      if (ts.isCallExpression(node) && isSharedFixedPath(ts, node) && !insideMkdtemp(ts, node)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const text = node.getText(sourceFile).replace(/\s+/g, " ");
        findings.push({
          rule: id, key: `${ctx.normalize(file)}:${line}`, value: 1, limit: 0, path: ctx.normalize(file), line,
          message: `${ctx.normalize(file)}:${line}: ${text} is a fixed temporary directory, shared by every run of this test in this checkout and in any other process, so parallel runs delete and overwrite each other's data. Give each run its own directory: mkdtemp(path.join(os.tmpdir(), "<name>-")).`,
          severity: "fail", ratchet: false
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return findings;
}

function calleeName(ts, expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function isFixedString(ts, node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** `process.cwd()`, `os.tmpdir()` or `tmpdir()`, or null. */
function sharedBase(ts, node) {
  if (!ts.isCallExpression(node) || node.arguments.length !== 0) return null;
  const callee = node.expression;
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "cwd" && ts.isIdentifier(callee.expression) && callee.expression.text === "process") return "cwd";
  if (calleeName(ts, callee) === "tmpdir") return "tmpdir";
  return null;
}

function isSharedFixedPath(ts, call) {
  const name = calleeName(ts, call.expression);
  if (name !== "join" && name !== "resolve") return false;
  const [first, ...rest] = call.arguments;
  if (!first || rest.length === 0) return false;
  const base = sharedBase(ts, first);
  if (!base || !rest.every((argument) => isFixedString(ts, argument))) return false;
  if (base === "tmpdir") return true;
  const firstSegment = rest[0].text.split(/[\\/]/).find((segment) => segment !== "") ?? "";
  return TEMP_SEGMENT.test(firstSegment);
}

/** Whether the path is (part of) the prefix a `mkdtemp`/`mkdtempSync` call makes a fresh directory from. */
function insideMkdtemp(ts, node) {
  let current = node;
  while (current.parent && ts.isCallExpression(current.parent) && current.parent.arguments.includes(current)) {
    const name = calleeName(ts, current.parent.expression);
    if (name === "mkdtemp" || name === "mkdtempSync") return true;
    current = current.parent;
  }
  return false;
}
