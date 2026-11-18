import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { shapeKeyRow } from "../../model";
import { KeyAvailability } from "../KeyAvailability";

it.each([
  [{ state: "available" }, "Saved"],
  [{ state: "unavailable", code: "legacy_recovery_required" }, "FluxIQ can&#x27;t open it any more. Replace it."],
  [{ state: "unavailable", code: "host_protection_unavailable" }, "This FluxIQ server can&#x27;t open saved keys"],
  [{ state: "unavailable", code: "ciphertext_invalid" }, "FluxIQ can&#x27;t read it. Replace it."],
  [{ state: "unavailable", code: "future" }, "Not known"],
  [null, "Not known"]
])("shows saved-key cause %j without another authentication action", (availability, words) => {
  const row = shapeKeyRow({ id: "key", enabled: true, availability, secret: "PRIVATE" });
  const html = renderToStaticMarkup(createElement(KeyAvailability, { row }));
  expect(html).toContain(words);
  expect(html).not.toMatch(/password|unlock|vault|PRIVATE/iu);
});

it("keeps explicit old lock metadata unavailable and disabled keys turned off", () => {
  const legacy = shapeKeyRow({ id: "key", enabled: true, unlocked: false });
  expect(renderToStaticMarkup(createElement(KeyAvailability, { row: legacy }))).toContain("FluxIQ needs an update");
  const disabled = shapeKeyRow({ id: "key", enabled: false, availability: { state: "available" } });
  expect(renderToStaticMarkup(createElement(KeyAvailability, { row: disabled }))).toContain("Turned off");
});
