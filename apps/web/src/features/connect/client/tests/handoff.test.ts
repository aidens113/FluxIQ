import { describe, expect, it } from "vitest";
import { describeConnectHandoff } from "..";

const ORIGIN = "https://app.example.test";
const FRAGMENT = `#code=${"a".repeat(43)}&state=synthetic-state-0123456789`;

describe("extension-owned tab handoff", () => {
  it("accepts a valid done fragment only at the configured exact origin and path", () => {
    expect(describeConnectHandoff(`${ORIGIN}/connect/done${FRAGMENT}`, ORIGIN)).toBe("ready");
    for (const href of [`https://evil.example/connect/done${FRAGMENT}`, `${ORIGIN}/connect/authorize${FRAGMENT}`, `${ORIGIN}/connect/done?code=${"a".repeat(43)}${FRAGMENT}`, `https://user@app.example.test/connect/done${FRAGMENT}`]) expect(describeConnectHandoff(href, ORIGIN)).toBe("invalid");
  });

  it("rejects duplicate/malformed fragments and reports declined/failing handoffs without a credential", () => {
    for (const fragment of ["", "#code=short&state=synthetic-state-0123456789", `${FRAGMENT}&code=${"b".repeat(43)}`, `${FRAGMENT}&credential=secret`]) expect(describeConnectHandoff(`${ORIGIN}/connect/done${fragment}`, ORIGIN)).toBe("invalid");
    expect(describeConnectHandoff(`${ORIGIN}/connect/done#error=access_denied&state=synthetic-state-0123456789`, ORIGIN)).toBe("declined");
    expect(describeConnectHandoff(`${ORIGIN}/connect/done#error=server_error&state=synthetic-state-0123456789`, ORIGIN)).toBe("failed");
  });
});
