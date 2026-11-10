import { describe, expect, it } from "vitest";
import { docsSnapshotInput, getDocsPageInput } from "../index.ts";

describe("docs inputs", () => {
  it("snapshot takes nothing", () => {
    expect(docsSnapshotInput.parse(undefined)).toEqual({});
  });

  it("get-page needs a page id", () => {
    expect(getDocsPageInput.parse({ pageId: " intro " })).toEqual({ pageId: "intro" });
    expect(getDocsPageInput.read({})).toEqual({ ok: false, error: expect.stringContaining("pageId:") });
    expect((getDocsPageInput.jsonSchema().properties as Record<string, { description?: string }>).pageId?.description).toBeTruthy();
  });
});
