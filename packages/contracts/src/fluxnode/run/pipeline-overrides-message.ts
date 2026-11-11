// Why a pipeline run takes no per-run overrides: a prompt section or tool id belongs to one
// FluxNode's run, and a pipeline maps several. The engine and the SDK refuse with these words.

/** The refusal's sentence, shared by the contract (`run_request.overrides_on_pipeline`), the engine and the SDK. */
export const FLUXNODE_PIPELINE_OVERRIDES_MESSAGE =
  "A pipeline run takes options, not overrides: a prompt or tool override belongs to one FluxNode. Declare overrides on the FluxNodes the pipeline calls.";
