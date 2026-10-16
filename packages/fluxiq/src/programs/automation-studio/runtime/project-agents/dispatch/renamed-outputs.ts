// A carried proposal's script with the outputs an amendment renamed bound as
// before under their new names (A8 towels `run-mvac0nmw`, t658). The amendment
// that carried the proposal renamed the subflow's output and nothing else
// about it, so the step output the old name was bound to is the one the new
// name hands on: each `output: <old> = ...`
// line of a callable part becomes `output: <new> = ...`, and every other line
// is left as its builder wrote it (`./run-brief.ts`, `startsFrom`). Output
// names are a port name's letters and digits (`../supervisor/plan-input.ts`),
// so a name is matched as written.

/** `script` with each renamed output's line binding the same step output under its new name (header). */
export function automationStudioProjectRenamedOutputs(script: string, renamed: ReadonlyArray<{ from: string; to: string }>): string {
  return renamed.reduce((text, { from, to }) => text.replace(new RegExp(`^(\\s*output:\\s*)${from}(\\s*=)`, "gmu"), `$1${to}$2`), script);
}
