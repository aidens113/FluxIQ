// The path a read's answer takes into an answer-first attempt's result, published for a host that proves recorded
// reads offline (t990, `fluxiq/automation/answer-first-data`): the row sink that stores a read as the run dataset
// does (`../rows/`), the result feed whose ledger joins read pages and whose data stage applies the task's
// processing declaration (`../result-feed/`), and the declaration as an attempt opens it (`../result-processing/`).
// Each is Core's own, re-exported unchanged; nothing here composes or copies them. A subpath of its own, because the
// service loads answer-first by a dynamic import and the public automation entry must not load it eagerly.
export { automationStudioAnswerFirstRowSink, type AutomationStudioAnswerFirstRowCall, type AutomationStudioAnswerFirstRowSink, type AutomationStudioAnswerFirstRowSinkInput, type AutomationStudioAnswerFirstRowsStored, type AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";
export { automationStudioAnswerFirstResultFeed, type AutomationStudioAnswerFirstResultFeed, type AutomationStudioAnswerFirstResultReadiness } from "../result-feed/index.ts";
export { automationStudioAnswerFirstTaskProcessing, type AutomationStudioAnswerFirstProcessingDeclaration } from "../result-processing/index.ts";
