import { describe, expect, it } from "vitest";
import { automationStudioSiteResetActSubjects as actSubjects } from "../act-subjects.ts";

// t750: what one act was about, the one source the settlement's group
// witnesses and site-reset's undo admission and reach read. Made-up fixtures:
// a gallery's albums, opaque tokens only.

describe("what an act was about", () => {
  it("is its subject, and its page only where it sat in no item", () => {
    expect(actSubjects({ subject: "s:album", page: "s:album-page" })).toEqual(["s:album", "s:album-page"]);
    expect(actSubjects({ subject: "s:album", page: "s:album-page", item: "i:album" })).toEqual(["s:album"]);
    expect(actSubjects({ page: "s:album-page" })).toEqual(["s:album-page"]);
    expect(actSubjects({ page: "s:album-page", item: "i:album" })).toEqual([]);
  });

  it("is nothing where the act's place is unknown", () => {
    expect(actSubjects(undefined)).toEqual([]);
    expect(actSubjects({})).toEqual([]);
  });
});
