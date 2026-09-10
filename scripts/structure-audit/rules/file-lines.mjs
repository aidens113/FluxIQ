// Files stay under the line limit. Ratcheted per path.

export const id = "file-lines";
export const title = "Source files stay under the line limit";

export function run(ctx) {
  const { LIMITS } = ctx;
  const findings = [];
  for (const file of ctx.sourceFiles) {
    const lines = ctx.lineCount(file);
    if (lines > LIMITS.fileLines) {
      findings.push({
        rule: id, key: file, value: lines, limit: LIMITS.fileLines, path: file,
        message: `${file}: ${lines} lines exceeds the ${LIMITS.fileLines}-line limit. Split it by diagnosing why it grew.`,
        severity: "fail", ratchet: true
      });
    } else if (lines > LIMITS.fileLinesWarn) {
      findings.push({
        rule: id, key: file, value: lines, limit: LIMITS.fileLinesWarn, path: file,
        message: `${file}: ${lines} lines is past the ${LIMITS.fileLinesWarn}-line advisory threshold.`,
        severity: "warn", ratchet: false
      });
    }
  }
  return findings;
}
