// Test files live inside a test root directory, never beside the source they
// cover. One ratcheted finding per directory that still co-locates tests.

export const id = "test-placement";
export const title = "Test files live in a test root, not beside their source";

export function run(ctx) {
  const { CONFIG } = ctx;
  const roots = new Set(CONFIG.testRootDirNames);
  const preferredRoot = CONFIG.testRootDirNames[0];
  const counts = new Map();
  for (const file of ctx.sourceFiles) {
    if (!ctx.isTestFile(file)) continue;
    const dir = ctx.dirname(file);
    if (roots.has(ctx.basename(dir))) continue;
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  const findings = [];
  for (const [dir, count] of counts) {
    const subject = count === 1 ? "1 test file sits beside its source" : `${count} test files sit beside their source`;
    const action = count === 1 ? "Move it into" : "Move them into";
    findings.push({
      rule: id, key: dir, value: count, limit: 0, path: dir,
      message: `${dir}/: ${subject}. ${action} ${dir}/${preferredRoot}/.`,
      severity: "fail", ratchet: true
    });
  }
  return findings;
}
