import { expect, it } from "vitest";
import { automationStudioRerunScreenedPaths } from "../index.ts";

it("distinguishes missing authority from a deliberately empty declaration", () => {
  expect(automationStudioRerunScreenedPaths([["listing", "bound"]], undefined)).toEqual([]);
  expect(automationStudioRerunScreenedPaths([["listing", "bound"]], [])).toEqual([["listing", "bound"]]);
});

it("omits denied, executable, secret and locator/credential-shaped names without leaking paths", () => {
  const unsafe = [["listing", "selector"], ["listing", "target"], ["listing", "apiKey"], ["listing", "#private"], ["listing", "hostPrivate"], ["listing", "ghp_" + "a".repeat(36)]];
  expect(automationStudioRerunScreenedPaths([...unsafe, ["listing", "maxPages"]], ["selector", "hostPrivate"])).toEqual([["listing", "maxPages"]]);
  expect(automationStudioRerunScreenedPaths([["listing", "maxPages"]], ["listing.maxPages"])).toEqual([]);
});
