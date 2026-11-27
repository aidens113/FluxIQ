// Barrel for the record condition: judging a row's value against one (`holds.ts`),
// saying one in words (`text.ts`), and the parity table for date conditions
// (`date-cases.ts`), which a downstream domain runs through its own grammar,
// and the pattern a `matches` or a derive names, with why one cannot run (`pattern.ts`).
export * from "./date-cases.ts";
export * from "./holds.ts";
export * from "./pattern.ts";
export * from "./text.ts";
