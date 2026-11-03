// Flow Bootstrap plan: the limits, contracts, provider schemas, catalog context,
// structural parsing and registry validation that a bootstrap completion passes
// through. Every member is implemented under ./plan/ and re-exported here, so
// consumers of this module and of the flow-bootstrap barrel see what they
// always saw.
//
// It once also declared automationStudioFlowBootstrapCatalogByteBudget, which
// fitted the node catalog to a request's input-token budget. The catalog is
// whole since 2026-09-30 (`./plan/catalog.ts`), so there is no budget to fit.
export * from "./plan/index.ts";
