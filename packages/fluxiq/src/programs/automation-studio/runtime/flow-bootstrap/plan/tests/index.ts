// The test fixtures this directory shares. A test outside it may only reach
// them through a barrel, and the web domain's real definitions are what the
// catalog, the validation and the plan authoring tests all need to be true.
export * from "./web-domain-definitions-fixture.ts";
