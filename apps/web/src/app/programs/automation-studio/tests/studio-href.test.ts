import { expect, it } from "vitest";
import { studioHref } from "../studio-href";

it("puts the domain first and keeps every other parameter, repeated ones included", () => {
  const href = studioHref("web", { domainId: "gone", project: "p", tag: ["a", "b"], empty: undefined });
  expect(href).toBe("/programs/automation-studio?domainId=web&project=p&tag=a&tag=b");
});
