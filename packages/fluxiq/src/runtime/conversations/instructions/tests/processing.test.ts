import { expect, it } from "vitest";
import { automationStudioConversationDeclaredProcessing } from "../processing.ts";

it("distinguishes a missing NEW declaration, explicit action-only N/A and empty data criteria", () => {
  expect(automationStudioConversationDeclaredProcessing({ do: "flow.createHere" })).toEqual({});
  expect(automationStudioConversationDeclaredProcessing({ process: undefined })).toEqual({});
  expect(automationStudioConversationDeclaredProcessing({ process: null })).toBeNull();
  expect(automationStudioConversationDeclaredProcessing({ process: {} })).toEqual({ process: {} });
});

it("reads the same interpretation envelope without binding or authenticating model provenance", () => {
  const process = { where: [{ field: "Price", atMost: 30 }], columns: ["Name"], declaration: { version: 1 } };
  const answer = automationStudioConversationDeclaredProcessing({ output: JSON.stringify({ process }) });
  expect(answer).toEqual({ process }); // The framework binder must refuse the untrusted stamp later.
  process.columns.push("unseen");
  expect(answer).toMatchObject({ process: { columns: ["Name"] } });
});

it("does not turn malformed or unreadable declarations into N/A", () => {
  for (const raw of [null, "broken {", { process: Number.NaN }, { process: () => ({}) }]) expect(automationStudioConversationDeclaredProcessing(raw)).toEqual({});
  expect(automationStudioConversationDeclaredProcessing({ process: "not a process" })).toEqual({ process: "not a process" });
});
