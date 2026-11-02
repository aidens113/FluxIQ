import type { RecordingIndex } from "@fluxiq/contracts/recording";

export function recordingIndexStateObjectRefs(index: RecordingIndex): string[] {
  const refs = new Set<string>();
  for (const entry of Object.values(index.entries)) {
    for (const ref of entry.objectRefs ?? []) refs.add(ref);
  }
  for (const action of Object.values(index.actions)) {
    for (const ref of action.sourceObjectRefs ?? []) refs.add(ref);
  }
  for (const state of Object.values(index.states)) {
    refs.add(state.stateRef);
    if (state.screenshotRef) refs.add(state.screenshotRef);
    for (const ref of state.objectRefs ?? []) refs.add(ref);
  }
  for (const proposal of Object.values(index.proposals)) {
    for (const ref of proposal.objectRefs ?? []) refs.add(ref);
  }
  return [...refs].sort();
}
