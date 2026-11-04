// Which recorded commands Core's own bookkeeping sent, by the name it gives them:
// the reads and moves around a site reset, a result check's end view, a dry run
// and a rerun. In a saved build about half the trace is these. They are not what
// the model explored or what a Flow's steps do, so the state rule reads neither
// side with them. A command with no name is the model's or the Flow's.

const BOOKKEEPING_PREFIXES: readonly string[] = Object.freeze(["site-reset", "result-check", "dryrun", "rerun"]);

export function clientGatewayTraceStateIsBookkeepingCall(callId: string | null): boolean {
  if (callId === null) return false;
  return BOOKKEEPING_PREFIXES.some((prefix) => callId === prefix || callId.startsWith(`${prefix}.`) || callId.startsWith(`${prefix}-`));
}
