import { expect, it } from "vitest";
import { automationStudioRerunArgumentNote } from "../index.ts";

it("builds removal from screened segments, preserving a literal dot key", () => {
  const note = automationStudioRerunArgumentNote({ step: 3, paths: [["listing", "literal.dot"]], parameters: true }, { kind: "failed", callId: "rerun.3" });
  expect(note).toMatchObject({ kept: ["listing.literal.dot"], removal: { parameters: { listing: { "literal.dot": null } } } });
});

it("is silent on acceptance and distinguishes an unexecuted refusal", () => {
  const metadata = { step: 3, paths: [["listing", "bound"]], parameters: false };
  expect(automationStudioRerunArgumentNote(metadata, { kind: "accepted", callId: "current-check" })).toBeUndefined();
  const refused = automationStudioRerunArgumentNote(metadata, { kind: "refused", reason: "rerun_holds_binding" });
  expect(refused?.attempt).toEqual({ kind: "refused", reason: "rerun_holds_binding" });
  expect(JSON.stringify(refused)).not.toContain("callId");
});
