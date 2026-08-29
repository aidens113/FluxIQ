export function stateWithImage(id: string, timestamp: number, contentRef: string) {
  return {
    id,
    timestamp,
    namespaces: {
      ui: {
        schemaId: "ui",
        schemaVersion: "0.1",
        values: {
          title: { type: "string", value: id, observedAt: timestamp }
        }
      }
    },
    presentation: {
      defaultFrameId: "screen",
      visualFrames: [{
        id: "screen",
        label: "Screen",
        coordinateSpace: { width: 100, height: 100, unit: "px" },
        layers: [{ id: `image.${id}`, kind: "image", contentRef, bounds: { x: 0, y: 0, width: 100, height: 100 } }]
      }]
    }
  };
}

export function zIndexForLabel(html: string, label: string): number {
  const pattern = new RegExp(`aria-label="${label}"[^>]*style="[^"]*z-index:([^;"]+)`);
  const match = pattern.exec(html);
  if (!match?.[1]) throw new Error(`No z-index found for ${label}`);
  return Number(match[1]);
}

export function zIndexForLabelIncludes(html: string, label: string): number {
  const pattern = new RegExp(`aria-label="[^"]*${label}[^"]*"[^>]*style="[^"]*z-index:([^;"]+)`);
  const match = pattern.exec(html);
  if (!match?.[1]) throw new Error(`No z-index found for ${label}`);
  return Number(match[1]);
}
