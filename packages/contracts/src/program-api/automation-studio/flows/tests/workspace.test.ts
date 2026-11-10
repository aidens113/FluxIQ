// The workspace inputs: a project's overview and its recordings.
import { describe, expect, it } from "vitest";
import { getProjectWorkspaceSummaryInput, listRecordingsInput } from "../index.ts";

describe("Workspace inputs", () => {
  it("the overview needs a project", () => {
    expect(getProjectWorkspaceSummaryInput.parse({ projectId: "p" })).toEqual({ projectId: "p" });
    expect(getProjectWorkspaceSummaryInput.read({}).ok).toBe(false);
  });

  it("recordings may be listed for every project, or one, in short form", () => {
    expect(listRecordingsInput.parse({})).toEqual({});
    expect(listRecordingsInput.parse({ projectId: "p", summaries: true, limit: 20 })).toEqual({ projectId: "p", summaries: true, limit: 20 });
    expect(listRecordingsInput.read({ summaries: "yes" }).ok).toBe(false);
  });
});
