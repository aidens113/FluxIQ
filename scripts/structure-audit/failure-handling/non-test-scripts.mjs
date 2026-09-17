// The files the failure-handling rules audit: script files that are neither
// test files nor inside a test root directory (`tests/`, `e2e/`), as
// normalized repository paths.

export function nonTestScripts(ctx) {
  const roots = new Set(ctx.CONFIG.testRootDirNames ?? []);
  return ctx.scriptFiles
    .map((file) => ctx.normalize(file))
    .filter((file) => !ctx.isTestFile(file) && !file.split("/").slice(0, -1).some((segment) => roots.has(segment)));
}
