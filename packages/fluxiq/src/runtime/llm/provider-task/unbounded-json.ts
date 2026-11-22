// Where a request's context stops being bounded JSON (t974, F22).
//
// The provider's pre-send check refuses a request whose context is not JSON (`./preflight.ts`,
// `llm.provider_request_context_unbounded`), and its refusal reaches the caller in Core's fixed words, which say nothing
// of where (`../../models/failures/contracts.ts`). Live runs run-mwouzg29-ebb0f27d, run-mwov5v61-01468cd3 and
// run-mwow1z18-81707c66 had every judge refused for one `undefined` array item that no log could show, since every log
// writes it as `null`. So the check says what it met and where, and a judge refused this way says it in its step log
// (`../../result-verification/flow-less/judge.ts`).

/**
 * How deep the request context may nest: a recursion guard, not a size limit. There is no count, entry-total, string- or
 * key-length limit on the context: a whole page is thousands of elements, and every one is sent. The only bound on a
 * request's size is the model's context window, checked with the request's measured size.
 */
const AUTOMATION_STUDIO_LLM_MAX_CONTEXT_DEPTH = 64;

/** How many steps of a path are said. */
const PATH_SHOWN = 8;

/**
 * What `root` holds that is not bounded JSON and the path to it, in words; `undefined` where it is bounded JSON. The path
 * names an array's index, and a key only where it is a plain identifier, for at most `PATH_SHOWN` steps: Core's own
 * structure, never page text.
 */
export function automationStudioLlmUnboundedJsonAt(root: unknown): string | undefined {
  const stack: Array<{ value: unknown; depth: number; path: readonly string[]; leave?: true }> = [{ value: root, depth: 0, path: [] }];
  const active = new Set<object>();
  while (stack.length) {
    const { value, depth, path, leave } = stack.pop()!;
    if (value === null || typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) continue;
    if (!value || typeof value !== "object") return `${kindOf(value)} at ${shownPath(path)}`;
    if (leave) {
      active.delete(value);
      continue;
    }
    if (depth > AUTOMATION_STUDIO_LLM_MAX_CONTEXT_DEPTH) return `nesting deeper than ${AUTOMATION_STUDIO_LLM_MAX_CONTEXT_DEPTH} at ${shownPath(path)}`;
    if (active.has(value)) return `a value that contains itself at ${shownPath(path)}`;
    active.add(value);
    stack.push({ value, depth, path, leave: true });
    let children: ReadonlyArray<readonly [string, unknown]>;
    try {
      children = Array.isArray(value) ? value.map((item, index) => [`[${index}]`, item] as const) : Object.entries(value);
    } catch {
      return `a value that cannot be read at ${shownPath(path)}`;
    }
    for (const [key, child] of children) stack.push({ value: child, depth: depth + 1, path: [...path, key] });
  }
  return undefined;
}

function kindOf(value: unknown): string {
  if (value === undefined) return "an undefined value";
  if (typeof value === "number") return "a number that is not finite";
  return `a ${typeof value}`;
}

function shownPath(path: readonly string[]): string {
  const steps = path.slice(0, PATH_SHOWN).map((step) => (step.startsWith("[") || /^[A-Za-z][A-Za-z0-9_]{0,40}$/u.test(step) ? step : "[key]"));
  return `context${steps.map((step) => (step.startsWith("[") ? step : `.${step}`)).join("")}${path.length > PATH_SHOWN ? "..." : ""}`;
}
