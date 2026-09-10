// Directories stay under the file limit. Ratcheted per directory. A
// subdirectory (including a tests/ folder) is not a file and does not count.

export const id = "directory-files";
export const title = "Directories stay under the source-file limit";

export function run(ctx) {
  const { LIMITS } = ctx;
  const counts = new Map();
  for (const file of ctx.sourceFiles) {
    const dir = ctx.dirname(file);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  const findings = [];
  for (const [dir, count] of counts) {
    if (count > LIMITS.directoryFiles) {
      findings.push({
        rule: id, key: dir, value: count, limit: LIMITS.directoryFiles, path: dir,
        message: `${dir}/: ${count} source files exceeds the ${LIMITS.directoryFiles}-file limit. Group them by feature (shared filename prefix) or kind.`,
        severity: "fail", ratchet: true
      });
    } else if (count > LIMITS.directoryFilesWarn) {
      findings.push({
        rule: id, key: dir, value: count, limit: LIMITS.directoryFilesWarn, path: dir,
        message: `${dir}/: ${count} source files is past the ${LIMITS.directoryFilesWarn}-file advisory threshold.`,
        severity: "warn", ratchet: false
      });
    }
  }
  return findings;
}
