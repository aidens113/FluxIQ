/** Stable address for a published callable Flow. */
export function compositeNodeDefinitionId(target: { flowId: string; version: string }): string {
  return `composite.flow.${encodeURIComponent(target.flowId)}@${target.version}`;
}
