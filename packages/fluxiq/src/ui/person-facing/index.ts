// Barrel for the person-facing text guard: one check that says why a sentence
// FluxIQ is about to show a person reads as internal or generated text -- an
// internal term, a code identifier, a generated class-like name, or a phrase
// said twice -- so no producer can put such text in the chat or on the page
// overlay silently.
export { personFacingTextFaults } from "./text-faults.ts";
