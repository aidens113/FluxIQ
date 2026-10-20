import { describe, expect, it } from "vitest";
import { clientGatewayLineageAfterReady } from "../index.ts";

describe("clientGatewayLineageAfterReady", () => {
  const mint = () => "lineage.minted";

  it("keeps the stored lineage when the socket resumed by token", () => {
    expect(clientGatewayLineageAfterReady({ stored: "lineage.kept", resumed: true, mint })).toBe("lineage.kept");
  });

  it("mints a new lineage when the socket had to pair", () => {
    expect(clientGatewayLineageAfterReady({ stored: "lineage.kept", resumed: false, mint })).toBe("lineage.minted");
  });

  it("mints a new lineage when nothing was stored, even on a resume", () => {
    expect(clientGatewayLineageAfterReady({ stored: undefined, resumed: true, mint })).toBe("lineage.minted");
    expect(clientGatewayLineageAfterReady({ resumed: true, mint })).toBe("lineage.minted");
  });

  it("does not call mint when the stored lineage is kept", () => {
    let calls = 0;
    clientGatewayLineageAfterReady({ stored: "lineage.kept", resumed: true, mint: () => `lineage.${++calls}` });
    expect(calls).toBe(0);
  });
});
