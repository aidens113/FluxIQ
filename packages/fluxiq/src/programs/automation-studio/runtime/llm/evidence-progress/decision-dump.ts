// A build's decisions written down in full, for the person debugging it.
//
// The build trace (`./progress-trace.ts`) is content-free on purpose: it goes to
// the Core process's own output, which the Lab publishes as `logs/core.log`. But
// a build that proposes nothing stores nothing -- no decision, no draft, no page
// it was shown -- so the full debug of such a run could not say what the model
// was asked or what it answered. Runs `run-muoga8at-123533a4` and
// `run-muogweml-0190212c` (lane A, 2026-09-30) each spent 64 decisions and left
// only result codes; even with the Lab keeping the run's Core store, the store
// held the Flow, its instruction and its settings, and no decision.
//
// Off unless `FLUXIQ_BUILD_DECISION_DUMP` names an absolute directory. Then each
// loop writes one JSON-lines file there: every distinct evidence entry once
// (`entry`, keyed by a hash of its content), and per decision the keys of the
// window it was shown in order, with what it answered (`decision`); every tool
// call with its request and full result (`tool`); every completion check's
// verdict (`check`). Nothing here is screened: it holds page text and the
// person's instruction, which is why it is written only where the debugger
// pointed it -- the Lab's ignored run tree -- and never to the log or a bundle.
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type AutomationStudioLlmEvidenceDecisionDump = {
  /** One decision: the window it was shown, and what came back. */
  decision(record: { iteration: number; ms: number; evidence: unknown; decision: unknown }): void;
  /** One tool call: what was asked of the tool, and all it answered. */
  tool(record: { callId: unknown; toolId: unknown; ms: number; request: unknown; result: unknown }): void;
  /** One completion check's verdict, feedback included. */
  check(record: { verdict: unknown }): void;
};

/** The dump when `FLUXIQ_BUILD_DECISION_DUMP` names an absolute directory; nothing otherwise. */
export function automationStudioLlmEvidenceDecisionDump(
  env: Readonly<Record<string, string | undefined>>,
  now: () => Date = () => new Date()
): AutomationStudioLlmEvidenceDecisionDump | undefined {
  const directory = env.FLUXIQ_BUILD_DECISION_DUMP;
  if (!directory || !path.isAbsolute(directory)) return undefined;
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `build-${now().toISOString().replace(/[:.]/gu, "-")}-${process.pid}.jsonl`);
  const write = (record: Record<string, unknown>) => appendFileSync(file, `${JSON.stringify({ at: now().toISOString(), ...record })}\n`);
  const written = new Set<string>();
  const keyOf = (entry: unknown): string => {
    const text = JSON.stringify(entry) ?? "null";
    const key = createHash("sha256").update(text).digest("hex").slice(0, 16);
    if (!written.has(key)) {
      written.add(key);
      write({ event: "entry", key, entry });
    }
    return key;
  };
  return {
    decision: ({ iteration, ms, evidence, decision }) => {
      const shown = Array.isArray(evidence) ? evidence.map(keyOf) : [];
      write({ event: "decision", iteration, ms, shown, decision });
    },
    tool: ({ callId, toolId, ms, request, result }) => write({ event: "tool", callId, toolId, ms, request, result }),
    check: ({ verdict }) => write({ event: "check", verdict })
  };
}
