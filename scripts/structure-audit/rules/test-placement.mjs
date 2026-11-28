// Test files live inside a test root directory, never beside the source they
// cover, and a test group (a <tests>/<name>/<tests>/ directory) holds two or
// more files. One ratcheted finding per directory that breaks either.
//
// A group of one file names no shared feature: it only dodges the
// directory-files limit.

export const id = "test-placement";
export const title = "Test files live in a test root, in groups of two or more";

export function run(ctx) {
  return [...colocated(ctx), ...oneFileGroups(ctx)];
}

function colocated(ctx) {
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

function oneFileGroups(ctx) {
  const roots = new Set(ctx.CONFIG.testRootDirNames);
  const groups = new Map();
  for (const file of ctx.sourceFiles) {
    let dir = ctx.dirname(file);
    while (dir !== "." && dir !== "/" && dir !== ctx.dirname(dir)) {
      const parent = ctx.dirname(dir);
      if (roots.has(ctx.basename(dir)) && !roots.has(ctx.basename(parent)) && roots.has(ctx.basename(ctx.dirname(parent)))) {
        const entry = groups.get(dir) ?? { count: 0, tests: 0 };
        entry.count += 1;
        if (ctx.isTestFile(file)) entry.tests += 1;
        groups.set(dir, entry);
      }
      dir = parent;
    }
  }
  const findings = [];
  for (const [dir, entry] of groups) {
    if (entry.count !== 1 || entry.tests !== 1) continue;
    const owner = ctx.dirname(ctx.dirname(dir));
    findings.push({
      rule: id, key: dir, value: 1, limit: 0, path: dir,
      message: `${dir}/: a test group of one file names no shared feature. Group the tests in ${owner}/ that share a filename prefix into one group of two or more, or split them by kind, and move this test up into ${owner}/.`,
      severity: "fail", ratchet: true
    });
  }
  return findings;
}
