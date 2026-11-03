/**
 * What a carried proposal must change, beyond its renamed outputs, so its
 * script fits the subflow it is carried onto (Lab `run-mvan7giv`, t671): the
 * outputs the amendment removed, the subflow it was built for when merged
 * under another key, and whether that subflow is now the one the router runs.
 */
export type AutomationStudioProjectCarriedScriptChange = { removedOutputs?: readonly string[]; builtFor?: string; routerRun?: true };

/**
 * A carried proposal's script rewritten to fit the subflow `subflowKey` it is
 * carried onto (`../dispatch/run-brief.ts`, `startsFrom`), so its builder starts
 * from a script the scope check takes rather than learn each change from a
 * refusal. Its renamed outputs are bound under their new names first
 * (`../dispatch/renamed-outputs.ts`); then:
 *
 * - each `output: <name>` line of a removed output, written inside the part
 *   one level in, is taken out, its step left in place: what the step does
 *   may still be the subflow's work, and a helper part's outputs are its own;
 * - the subflow's own `part <builtFor>:` header -- written at the start of a
 *   line, as a callable subflow's part is -- is renamed `part <subflowKey>:`;
 * - when the subflow is now the one the router runs, which is given no inputs
 *   and hands back no outputs, that part is unwrapped: its header, its own
 *   `input:` and `output:` lines (indented one level, as written inside the
 *   part) and the `end` that closes it at the start of a line are taken out,
 *   and its lines are moved one level, two spaces, out. Any other block, a
 *   helper part or a handler beside it, is left as written.
 *
 * A script whose part header is not found is returned as it is: Core does not
 * guess at a shape it did not write, and the scope check says what is
 * missing. Port names and subflow keys are letters, digits, `_` and `-`
 * (`../supervisor/plan-input.ts`), so each is matched as written.
 */
export function automationStudioProjectCarriedScript(script: string, carried: AutomationStudioProjectCarriedScriptChange, subflowKey: string): string {
  const lines = script.split("\n");
  const key = carried.builtFor ?? subflowKey;
  const header = lines.findIndex((line) => new RegExp(`^part\\s+${escaped(key)}\\s*:`, "u").test(line));
  if (header < 0) return script;
  const found = lines.findIndex((line, index) => index > header && /^end\s*$/u.test(line));
  const close = found < 0 ? lines.length : found;
  const removed = new Set(carried.removedOutputs ?? []);
  // Only the part's own output lines, one level in: a helper part's outputs are its own.
  let body = lines.slice(header + 1, close).filter((line) => {
    const output = /^ {2}output:\s*([A-Za-z0-9]+)\s*(?:=|$)/u.exec(line);
    return !output || !removed.has(output[1]!);
  });
  const before = lines.slice(0, header);
  const after = lines.slice(found < 0 ? lines.length : close + 1);
  if (carried.routerRun) {
    body = body.filter((line) => !/^ {2}(?:input|output):/u.test(line)).map((line) => line.replace(/^ {2}/u, ""));
    return [...before, ...body, ...after].join("\n");
  }
  const opened = key === subflowKey ? lines[header]! : lines[header]!.replace(new RegExp(`^part\\s+${escaped(key)}(\\s*:)`, "u"), `part ${subflowKey}$1`);
  return [...before, opened, ...body, ...(found < 0 ? [] : [lines[close]!]), ...after].join("\n");
}

/** `text` with every character a regular expression gives a meaning escaped. */
function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
