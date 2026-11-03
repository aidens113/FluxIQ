/** Host-resolved authoring semantics; never action permission or effect safety. */
export type AutomationStudioResolvedControlIntent =
  | Readonly<{ intent: "accept"; responseOnly?: true }>
  | Readonly<{ intent: "dismiss" | "neutral" | "navigate" }>;
