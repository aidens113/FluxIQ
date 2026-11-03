import { expect, it } from "vitest";
import { observationFixture } from "./fixture.ts";

it("distinguishes pre-entry absence from an original entered frame and foreign handles", async () => {
  const f = await observationFixture();
  const other = await observationFixture();
  expect(f.source.hasFrame(f.observation)).toBe(false);
  expect(() => f.source.hasFrame({ ...f.observation })).toThrow("foreign_binding");
  expect(() => f.source.hasFrame(other.observation)).toThrow("foreign_binding");
  const callback = () => undefined;
  f.source.manage({ receiver: undefined, callback, contract: "no_direct_effects" });
  const call = { receiver: undefined, callback, args: [] as [] };
  const prepared = await f.source.prepare(f.observation, call);
  expect(f.source.hasFrame(f.source.forParent(f.source.context(prepared)))).toBe(true);
  await f.source.invoke(prepared, call);
  expect(() => f.source.hasFrame(f.source.forParent(f.source.context(prepared)))).toThrow("frame_inactive");
});

it("propagates actual scope/reservation mismatches instead of treating them as pre-entry", async () => {
  const f = await observationFixture();
  const other = await observationFixture();
  const callback = () => undefined;
  f.source.manage({ receiver: undefined, callback, contract: "no_direct_effects" });
  const call = { receiver: undefined, callback, args: [] as [] };
  const prepared = await f.source.prepare(f.observation, call);
  const context = f.source.context(prepared);
  expect(() => f.source.hasFrame(f.source.forParent({ parent: context.parent, reservation: other.reserved.reservation }))).toThrow("durable_frame_missing");
  expect(() => other.source.hasFrame(other.source.forParent(context))).toThrow("durable_frame_missing");
  await f.source.invoke(prepared, call);
});
