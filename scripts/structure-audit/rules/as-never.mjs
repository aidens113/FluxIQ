// No new `as never` casts, in source or tests.
//
// Why. `never` is assignable to every type, so `value as never` type-checks
// wherever it is written and turns off the one check that would have noticed
// the value no longer fits. In a test stub that is exactly the failure that
// matters: in October 2026 seven FluxIQ Core re-author tests (t341) stayed
// broken for a day because their build stubs were cast `as never`, so the
// t299 change to the proposal shape compiled clean and the stubs went on
// describing a contract that no longer existed.
//
// What to write instead:
//   - a typed stub: `const port: ReauthorPort = { approve: async () => ok };`
//   - `satisfies`, which checks the value and keeps its own type:
//     `const proposal = { ... } satisfies Proposal;`
//   - a small helper that returns the real type and fills the rest:
//     `function stubPort(overrides: Partial<Port> = {}): Port { ... }`
//   - when a value is genuinely partial, `Partial<T>` or `Pick<T, ...>` at
//     the receiving parameter, not a cast at the call site.
//
// What counts. A cast whose target type is `never`, in either spelling:
// `x as never` and `<never>x`. `as unknown as never` counts once, for its
// outer cast. The rule reads the parsed syntax tree, so the words in a
// comment, a string or a template literal never count, and neither does a
// `never` type annotation or return type, which the compiler still checks.
//
// Scope. Every script file the audit sees, tests included, because a stub is
// where the cast does its damage. Existing casts are baselined per file and
// may only go down; a new file, or one more cast in a baselined file, fails.

export const id = "as-never";
export const title = "No new `as never` casts; they silence the type check a stale stub needs";

function isNeverCast(ts, node) {
  if (!ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node)) return false;
  return node.type.kind === ts.SyntaxKind.NeverKeyword;
}

function castLines(ctx, file) {
  const { ts } = ctx;
  const sourceFile = ctx.parse(file);
  const lines = [];
  const visit = (node) => {
    if (isNeverCast(ts, node)) lines.push(sourceFile.getLineAndCharacterOfPosition(node.type.getStart(sourceFile)).line + 1);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return lines;
}

export function run(ctx) {
  const findings = [];
  for (const file of ctx.scriptFiles) {
    const normalized = ctx.normalize(file);
    const lines = castLines(ctx, normalized);
    if (lines.length === 0) continue;
    const subject = lines.length === 1
      ? `1 \`as never\` cast, at line ${lines[0]}`
      : `${lines.length} \`as never\` casts, at lines ${lines.join(", ")}`;
    findings.push({
      rule: id,
      key: normalized,
      value: lines.length,
      limit: 0,
      path: normalized,
      line: lines[0],
      message: `${normalized}: ${subject}. \`never\` is assignable to every type, so the cast compiles wherever it is written and hides the very type change that should have broken it: seven Core re-author tests stayed red for a day because their stubs were cast \`as never\` and a contract change compiled clean. Write a typed stub (\`const port: Port = { ... }\`), check a literal with \`satisfies T\`, or use a helper that returns the real type (\`stubPort(overrides: Partial<Port>): Port\`).`,
      severity: "fail",
      ratchet: true
    });
  }
  return findings;
}
