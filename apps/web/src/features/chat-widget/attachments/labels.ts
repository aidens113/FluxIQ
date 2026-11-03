// What a turn's attachment is called when nothing here can draw it.

const LABELS: Readonly<Record<string, string>> = Object.freeze({
  "flow-graph-diff": "Proposed Flow change",
  "dataset-preview": "Collected data",
  screenshot: "Screenshot"
});

export function attachmentLabel(kind: string): string {
  return LABELS[kind] ?? "Attachment";
}
