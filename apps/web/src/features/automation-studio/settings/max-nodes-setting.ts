/**
 * The Flow size setting as the settings form offers it: the most nodes one
 * Subflow may hold.
 *
 * A mirror of Core's `AUTOMATION_STUDIO_FLOW_SIZE_SETTING`
 * (`packages/fluxiq/src/programs/automation-studio/model/flow-size/flow-size-settings.ts`),
 * not an import of it. The panel takes Core runtime values only through the
 * narrow client-safe subpaths `fluxiq` exports (`llm-models`, `nodes`, ...),
 * and there is no such subpath for the Flow model; the main barrel carries the
 * server runtime. `tests/max-nodes-setting.test.tsx` reads Core's source and
 * fails if the two drift, and Core refuses a value outside its own range on
 * save whatever this form lets through.
 */
export const FLOW_SIZE_SETTING = {
  metadataKey: "flowSizeSettings",
  field: "maxNodesPerSubflow",
  label: "Maximum nodes per Subflow",
  defaultValue: 100,
  minimum: 1,
  maximum: 1_000
} as const;
