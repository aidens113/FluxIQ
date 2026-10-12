// One statement per line.
//
// Why. The file-lines budget measures lines, so the cheapest way to keep a
// file under it is to stop using them: on 2026-10-09 a worker twice kept a
// file inside its budget -- Core's baselined `runtime/service.ts` and the web
// extension's `run-scenario.ts` -- by writing
// `let a: X | undefined; if (cond) doThing({...}); // comment` and
// `import { a } from "./a.js"; import { b } from "./b.js";`. The file kept its
// line count and lost its readability, and the budget stopped measuring
// anything. A file that needs the room is a file to split.
//
// What counts. A line on which one statement ends and the next statement in
// the same statement list begins: a declaration, an expression or call, an
// `if`, `return`, `await`, `import`, `export`, `throw`, a block, anything the
// parser reads as a statement. Statement lists are a file's top level, a
// block (a function or arrow body, an `if` or loop body, a `try`, a static
// block), a namespace body, and a `case` or `default` clause. A line holding
// three statements is one finding line, not two.
//
// What does not count, because the rule reads the parsed syntax tree rather
// than the text: the `;` of a `for (init; test; step)` header, a `;` inside a
// string, a template literal, a regular expression or a comment, the members
// of a type literal or interface (`{ a: string; b: number }`), and an arrow or
// function body holding a single statement (`() => { run(); }`), which is one
// statement on its line. An empty statement (a stray `;`, as in `class A {};`)
// is not a statement for this rule.
//
// Scope. Every script file the audit sees, tests included, since a test file
// has a file-lines budget too. Existing packed lines are baselined per file
// and may only go down; a new file, or one more packed line in a baselined
// file, fails.

export const id = "statement-packing";
export const title = "One statement per line; packing statements onto one line dodges the file-lines budget";

function isStatementList(ts, node) {
  return ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node);
}

// The 1-based lines on which a statement begins where its previous sibling
// statement ends, sorted and without repeats.
function packedLines(ts, sourceFile) {
  const lines = new Set();
  const lineOf = (position) => sourceFile.getLineAndCharacterOfPosition(position).line + 1;
  const visit = (node) => {
    if (isStatementList(ts, node)) {
      const statements = node.statements.filter((statement) => !ts.isEmptyStatement(statement));
      for (let i = 1; i < statements.length; i += 1) {
        const startLine = lineOf(statements[i].getStart(sourceFile));
        if (lineOf(statements[i - 1].getEnd()) === startLine) lines.add(startLine);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...lines].sort((a, b) => a - b);
}

function describeLines(lines) {
  const shown = lines.slice(0, 10).join(", ");
  const more = lines.length > 10 ? ` and ${lines.length - 10} more` : "";
  return lines.length === 1
    ? `1 line holds more than one statement, line ${lines[0]}`
    : `${lines.length} lines hold more than one statement, lines ${shown}${more}`;
}

export function run(ctx) {
  const findings = [];
  for (const file of ctx.scriptFiles) {
    const normalized = ctx.normalize(file);
    const lines = packedLines(ctx.ts, ctx.parse(normalized));
    if (lines.length === 0) continue;
    findings.push({
      rule: id,
      key: normalized,
      value: lines.length,
      limit: 0,
      path: normalized,
      line: lines[0],
      message: `${normalized}: ${describeLines(lines)}. Put each statement on its own line. Packing statements together keeps a file under its file-lines budget without making it any smaller, which is how the budget gets dodged; if one statement per line takes the file past its budget, split the file by the reason it grew.`,
      severity: "fail",
      ratchet: true
    });
  }
  return findings;
}
