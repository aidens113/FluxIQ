// What makes two calls one act: a row by its own fields, a target by its stable
// fields, never a position, and never what a read minted.

import { describe, expect, it } from "vitest";
import { automationStudioAttemptActId, automationStudioAttemptActIsAddress, automationStudioAttemptActRowIdentity, automationStudioAttemptActTargetKeys } from "../index.ts";

const overlap = (left: string[], right: string[]) => left.some((key) => right.includes(key));

describe("a row's identity", () => {
  it("leaves out what a read mints, so a row read again is the row it was", () => {
    const first = automationStudioAttemptActRowIdentity({ name: "Oak desk", $handle: "read-1-row-3", rowHandle: "h1", evidenceRef: "e1", spec: { size: "L", $row: 3 } });
    const again = automationStudioAttemptActRowIdentity({ name: "Oak desk", $handle: "read-2-row-0", rowHandle: "h9", evidenceRef: "e7", spec: { size: "L", $row: 0 } });
    expect(first).toBe(again);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("tells one row from another by any field of its own", () => {
    expect(automationStudioAttemptActRowIdentity({ name: "Oak desk", price: "$3" })).not.toBe(automationStudioAttemptActRowIdentity({ name: "Oak desk", price: "$4" }));
  });

  it("is not moved by key order, by a link written from the page's origin, or by a value read back as a number", () => {
    const shown = { link: "/p/1", name: "Oak desk", count: "3" };
    const carried = { count: 3, name: "Oak desk", link: "https://shop.test/p/1" };
    expect(automationStudioAttemptActRowIdentity(shown)).toBe(automationStudioAttemptActRowIdentity(carried));
  });

  it("is none for a row of nothing but minted fields", () => {
    expect(automationStudioAttemptActRowIdentity({ $handle: "h", evidenceId: "e" })).toBeUndefined();
  });
});

describe("a target's keys", () => {
  const frozen = { selector: "#save", element: { tag: "button", text: "Save it" } };

  it("gives a handle and a frozen target different keys, and the frozen form first, since the act id is built from it", () => {
    const byHandle = automationStudioAttemptActTargetKeys("press", { target: { handle: "t7" } });
    expect(byHandle.handle).toBe("t7");
    expect(byHandle.handleKeys).toHaveLength(1);
    const stable = automationStudioAttemptActTargetKeys("press", frozen);
    expect(overlap(byHandle.keys, stable.keys)).toBe(false);
    expect(stable.handleKeys).toEqual([]);
    expect(stable.keys).toHaveLength(2);
    expect(automationStudioAttemptActTargetKeys("press", { target: "t7" }).keys).toEqual(byHandle.keys);
  });

  it("matches on the same selector or the same whole fingerprint alone, with the same inputs", () => {
    const stable = automationStudioAttemptActTargetKeys("press", frozen).keys;
    expect(overlap(stable, automationStudioAttemptActTargetKeys("press", { selector: "#save", element: { tag: "button", text: "Saved" } }).keys)).toBe(true);
    expect(overlap(stable, automationStudioAttemptActTargetKeys("press", { selector: "#other", element: { tag: "button", text: "Save it" } }).keys)).toBe(true);
    expect(overlap(stable, automationStudioAttemptActTargetKeys("press", { selector: "#other", element: { tag: "a", text: "Other" } }).keys)).toBe(false);
  });

  it("never takes another action, or other inputs, for the same act", () => {
    const stable = automationStudioAttemptActTargetKeys("press", { ...frozen, text: "3" }).keys;
    expect(overlap(stable, automationStudioAttemptActTargetKeys("other", { ...frozen, text: "3" }).keys)).toBe(false);
    expect(overlap(stable, automationStudioAttemptActTargetKeys("press", { ...frozen, text: "4" }).keys)).toBe(false);
  });

  it("is not moved by what Core adds to a step, or by where a page drew the control", () => {
    const stable = automationStudioAttemptActTargetKeys("press", frozen).keys;
    const added = { ...frozen, timeoutMs: 500, ensureState: { state: "on" }, consequences: ["create_new"], expectedState: { x: 1 }, waitFor: "y", recordOutput: { id: "r" }, visualTarget: { bounds: { x: 1 } } };
    expect(automationStudioAttemptActTargetKeys("press", added).keys).toEqual(stable);
    const moved = { selector: "#save", element: { tag: "button", text: "Save it", bounds: { x: 9 }, index: 4, $handle: "t9" } };
    expect(automationStudioAttemptActTargetKeys("press", moved).keys).toEqual(stable);
  });

  it("never lets a selector that counts siblings stand for a control a fingerprint can name", () => {
    const counted = { selector: "ul > li:nth-child(3) button", element: { text: "Save it" } };
    const other = { selector: "ul > li:nth-child(3) button", element: { text: "Remove it" } };
    expect(overlap(automationStudioAttemptActTargetKeys("press", counted).keys, automationStudioAttemptActTargetKeys("press", other).keys)).toBe(false);
  });

  it("says the control's words as digests, the same however a call spelled the slot, leaving out what every control of a kind shares", () => {
    const direct = automationStudioAttemptActTargetKeys("press", { element: { text: "Save  It", tag: "button", role: "button", id: "row-17" } }).controls;
    expect(direct).toEqual(automationStudioAttemptActTargetKeys("press", { target: { element: { text: "save it" } } }).controls);
    expect(direct).toHaveLength(1);
    expect(direct![0]).toMatch(/^[a-f0-9]{64}$/u);
    expect(direct).not.toEqual(automationStudioAttemptActTargetKeys("press", { element: { text: "Remove" } }).controls);
    expect(automationStudioAttemptActTargetKeys("press", { element: { tag: "button" } }).controls).toBeUndefined();
  });

  it("reads an address by its shape, and never takes typed words or a whole web address for one", () => {
    for (const address of ["#save", ".add", "li > button", "ul li.card a", "button.primary", "[data-x='1']", "a[href='/x']", "ul > li:nth-child(3) button"]) expect(automationStudioAttemptActIsAddress(address)).toBe(true);
    for (const input of ["3", "Oak desk", "hello there", "https://shop.test/p/1", "a.b@c", "Great, thanks!", "12.50"]) expect(automationStudioAttemptActIsAddress(input)).toBe(false);
  });

  it("never takes a typed value for an address: the same control typed with other words is another act", () => {
    const first = automationStudioAttemptActTargetKeys("press", { selector: "#q", element: { label: "Quantity" }, text: "3" }).keys;
    expect(overlap(first, automationStudioAttemptActTargetKeys("press", { selector: "#other", element: { label: "Quantity" }, text: "4" }).keys)).toBe(false);
    expect(overlap(first, automationStudioAttemptActTargetKeys("press", { selector: "#other", element: { label: "Quantity" }, text: "3" }).keys)).toBe(true);
  });

  it("gives a call with no target at all one key, from all it was sent", () => {
    const { keys } = automationStudioAttemptActTargetKeys("go", { url: "https://shop.test/a" });
    expect(keys).toHaveLength(1);
    expect(overlap(keys, automationStudioAttemptActTargetKeys("go", { url: "https://shop.test/b" }).keys)).toBe(false);
    expect(automationStudioAttemptActTargetKeys("go", {}).keys).toHaveLength(1);
  });

  it("never lets a handle's inputs alone stand for its target", () => {
    const one = automationStudioAttemptActTargetKeys("press", { target: { handle: "t1" }, text: "3" }).keys;
    expect(overlap(one, automationStudioAttemptActTargetKeys("press", { target: { handle: "t2" }, text: "3" }).keys)).toBe(false);
  });
});

describe("an act's id", () => {
  it("fits the contract's id, is stable, and differs by row", () => {
    const id = automationStudioAttemptActId({ key: "k" });
    expect(id).toMatch(/^act\.[a-f0-9]{40}$/u);
    expect(automationStudioAttemptActId({ key: "k" })).toBe(id);
    expect(automationStudioAttemptActId({ key: "k", row: "sha256:aa" })).not.toBe(id);
  });
});
