export type InspectorWidgetModel =
  | { kind: "summary"; title: string; items: Array<[string, string | number]> }
  | { kind: "cards"; title: string; items: Array<{ title: string; detail: string; meta?: string }> };
