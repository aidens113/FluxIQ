/** Node references here are tuples: dotted subflow and node keys cannot alias. */
export function automationStudioResolvedControlIntentNodeKey(subflow: string, node: string): string {
  return JSON.stringify([subflow, node]);
}
